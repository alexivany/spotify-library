const MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2";

export class MusicBrainzApiError extends Error {
  status: number;
  path: string;
  body: unknown;

  constructor(status: number, path: string, body: unknown) {
    super(`MusicBrainz API error ${status} on ${path}: ${JSON.stringify(body)}`);
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

/**
 * Thrown when MusicBrainz has been rate-limiting/erroring so persistently
 * that grinding through per-request backoff would burn the whole run's time
 * budget (a serverless invocation has a hard wall-clock timeout, unlike a
 * long-running worker). See MAX_CONSECUTIVE_TRANSIENT_RESPONSES below.
 */
export class MusicBrainzUnavailableError extends Error {
  constructor(streak: number) {
    super(
      `MusicBrainz returned ${streak} consecutive rate-limit/server errors — aborting this run instead of ` +
        `continuing to grind through backoff. A re-run resumes from whatever wasn't yet checked.`,
    );
  }
}

/**
 * Thrown when the *next* backoff sleep on a single request would itself run
 * past the current enrichment chunk's deadline. Exponential backoff (up to
 * 2+4+8+16+32=62s across MAX_TRANSIENT_RETRIES) can exceed the entire chunk
 * budget on just one or two stuck requests, well before
 * MAX_CONSECUTIVE_TRANSIENT_RESPONSES is reached and long before
 * performEnrichment's own between-candidate deadline check ever gets a turn
 * to run — the caller is just blocked awaiting this one call the whole time.
 * Unlike MusicBrainzUnavailableError this isn't "MusicBrainz looks down",
 * just "not enough time left in this chunk" — the caller treats it as a
 * clean end-of-chunk, not a run failure, and this exact candidate gets
 * retried in the next chunk.
 */
export class MusicBrainzChunkBudgetExceededError extends Error {
  constructor() {
    super("MusicBrainz retry backoff would exceed the current chunk's time budget — ending chunk early.");
  }
}

// Set by performEnrichment() at the start of each chunk (see
// setMusicBrainzChunkDeadline) so a retry backoff mid-request can bail out
// before Vercel kills the whole invocation instead. Infinity outside of an
// enrichment run (e.g. callers that don't chunk) means this never triggers.
let chunkDeadline = Infinity;

/** Called at the start of an enrichment chunk; pass the chunk's own deadline (Date.now() + budget). */
export function setMusicBrainzChunkDeadline(deadline: number): void {
  chunkDeadline = deadline;
}

type MusicBrainzFetchOptions = Omit<RequestInit, "headers"> & {
  searchParams?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
};

const MAX_TRANSIENT_RETRIES = 5;

/**
 * MusicBrainz has no path to a higher anonymous quota (bulk consumers are
 * expected to mirror the DB locally instead), so unlike Spotify's pacing this
 * interval is a hard ceiling, not just a starting point. Default sits above
 * the documented 1 req/sec as a safety margin. Override via
 * MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS.
 */
const MIN_REQUEST_INTERVAL_MS = Number(process.env.MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS ?? "1100") || 1100;

/**
 * MusicBrainz requires a well-formed User-Agent identifying a contact; a
 * missing/malformed one gets silently degraded service, so this fails fast
 * on the first request rather than surfacing as a confusing downstream error.
 */
function userAgent(): string {
  const contactEmail = process.env.MUSICBRAINZ_CONTACT_EMAIL;
  if (!contactEmail) {
    throw new Error("MUSICBRAINZ_CONTACT_EMAIL is not configured — required for MusicBrainz's User-Agent header.");
  }
  return `spotify-library/1.0 ( ${contactEmail} )`;
}

// A serverless invocation has a hard wall-clock timeout (Vercel kills it and
// returns a non-JSON error page), unlike a long-running worker that can just
// keep backing off forever. If MusicBrainz is having a sustained outage or
// rate-limiting everything, grinding through MAX_TRANSIENT_RETRIES on every
// remaining candidate would burn the whole budget and take the run down with
// it. Tracking a streak of transient (5xx) responses across requests — not
// just retries within one request — lets a run bail out fast instead.
const MAX_CONSECUTIVE_TRANSIENT_RESPONSES = 15;
let consecutiveTransientResponses = 0;

/** Called at the start of an enrichment run so a prior run's streak (on a warm lambda) doesn't carry over. */
export function resetMusicBrainzCircuitBreaker(): void {
  consecutiveTransientResponses = 0;
}

// Serialized pacing gate — same chaining pattern as lib/spotify/client.ts, so
// the minimum interval holds even if requests are ever issued concurrently.
let nextAllowedAt = 0;
let throttleChain: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  throttleChain = throttleChain.then(async () => {
    const now = Date.now();
    const wait = nextAllowedAt - now;
    if (wait > 0) await sleep(wait);
    nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_REQUEST_INTERVAL_MS;
  });
  return throttleChain;
}

/**
 * Fetch wrapper for the MusicBrainz web service. Paces every request at
 * MIN_REQUEST_INTERVAL_MS (see above) and retries MusicBrainz's rate-limit
 * signal — 503, not 429 — plus other transient 5xx, with exponential
 * backoff up to MAX_TRANSIENT_RETRIES. A 404 is returned to the caller as a
 * normal ApiError (callers like the URL-relationship lookup treat it as "no
 * match found", not a failure) rather than retried.
 */
export async function musicBrainzFetch<T>(
  path: string,
  { searchParams, headers, ...init }: MusicBrainzFetchOptions = {},
): Promise<T> {
  const url = new URL(`${MUSICBRAINZ_API_BASE}${path}`);
  url.searchParams.set("fmt", "json");
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let transientRetries = 0;
  for (;;) {
    await throttle();
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": userAgent(),
        Accept: "application/json",
        ...headers,
      },
    });

    const isTransientStatus = res.status === 503 || (res.status >= 500 && res.status < 600);
    if (isTransientStatus) {
      consecutiveTransientResponses += 1;
      if (consecutiveTransientResponses >= MAX_CONSECUTIVE_TRANSIENT_RESPONSES) {
        throw new MusicBrainzUnavailableError(consecutiveTransientResponses);
      }
    } else {
      consecutiveTransientResponses = 0;
    }

    if (isTransientStatus && transientRetries < MAX_TRANSIENT_RETRIES) {
      transientRetries += 1;
      const waitSeconds = 2 ** transientRetries;
      if (Date.now() + waitSeconds * 1000 >= chunkDeadline) {
        throw new MusicBrainzChunkBudgetExceededError();
      }
      console.warn(
        `[musicbrainz] ${res.status} on ${url.pathname} (attempt ${transientRetries}/${MAX_TRANSIENT_RETRIES}), retrying in ${waitSeconds}s`,
      );
      await sleep(waitSeconds * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      throw new MusicBrainzApiError(res.status, `${url.pathname}${url.search}`, body);
    }

    return (await res.json()) as T;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
