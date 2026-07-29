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

    if ((res.status === 503 || (res.status >= 500 && res.status < 600)) && transientRetries < MAX_TRANSIENT_RETRIES) {
      transientRetries += 1;
      const waitSeconds = 2 ** transientRetries;
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
