import { getAccessToken } from "./token";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export class SpotifyApiError extends Error {
  status: number;
  path: string;
  body: unknown;

  constructor(status: number, path: string, body: unknown) {
    super(`Spotify API error ${status} on ${path}: ${JSON.stringify(body)}`);
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

type SpotifyFetchOptions = Omit<RequestInit, "headers"> & {
  searchParams?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
};

const MAX_TRANSIENT_RETRIES = 5;
const MAX_RATE_LIMIT_RETRIES = 20;

/**
 * Upper bound on how long a single Retry-After stall is allowed to be.
 * Observed in practice (2026-07-26): Spotify can return Retry-After values in
 * the tens of thousands of seconds (one case: 86144s, ~24h) rather than the
 * few-second waits a rolling rate-limit window would imply — almost
 * certainly a longer-lived quota/throttle state, not something worth
 * blocking an in-flight request over. Sleeping through that would hang the
 * request (and, in the sync route, leave its sync_runs row stuck at
 * "running" for a day). Past this cap, fail fast with a clear error instead
 * — the sync's incremental per-page saves mean a re-run just resumes.
 * Override via SPOTIFY_MAX_RATE_LIMIT_WAIT_SECONDS.
 */
const MAX_RATE_LIMIT_WAIT_SECONDS = Number(process.env.SPOTIFY_MAX_RATE_LIMIT_WAIT_SECONDS ?? "60") || 60;

/**
 * Minimum gap between the start of consecutive Spotify requests. Spotify's
 * rate limit is a rolling 30-second window sized by app quota mode
 * (Development mode is much tighter than Extended); reacting only to 429s
 * means every limit hit costs a full Retry-After stall. Pacing requests
 * proactively keeps a full sync of a large library under the window and
 * makes 429s rare rather than routine. Override via SPOTIFY_MIN_REQUEST_INTERVAL_MS.
 */
const MIN_REQUEST_INTERVAL_MS = Number(process.env.SPOTIFY_MIN_REQUEST_INTERVAL_MS ?? "100") || 0;

// Serialized pacing gate: each call chains off the previous so the minimum
// interval is enforced even if requests are ever issued concurrently (today's
// sync is sequential, but this keeps the guarantee robust). `nextAllowedAt`
// tracks the earliest wall-clock time the next request may start.
let nextAllowedAt = 0;
let throttleChain: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  throttleChain = throttleChain.then(async () => {
    if (MIN_REQUEST_INTERVAL_MS <= 0) return;
    const now = Date.now();
    const wait = nextAllowedAt - now;
    if (wait > 0) await sleep(wait);
    nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_REQUEST_INTERVAL_MS;
  });
  return throttleChain;
}

/**
 * Fetch wrapper for the Spotify Web API. Paces requests with a minimum
 * inter-request interval (see MIN_REQUEST_INTERVAL_MS) to stay under the
 * rolling rate-limit window proactively. Retries on 429 using the
 * Retry-After header (Spotify's rate limit is per-app, shared across the
 * whole sync run, so this backoff is load-bearing during a full sync), up to
 * MAX_RATE_LIMIT_RETRIES — logged each time, so a long wait is visible in the
 * server log instead of looking like a hang — but only while Retry-After
 * stays under MAX_RATE_LIMIT_WAIT_SECONDS; past that it fails fast rather
 * than stalling the request for however long Spotify asked for. Also
 * retries transient 5xx errors (Spotify's API occasionally 502s mid-page on
 * large libraries) with exponential backoff, up to MAX_TRANSIENT_RETRIES.
 */
export async function spotifyFetch<T>(
  path: string,
  { searchParams, headers, ...init }: SpotifyFetchOptions = {},
): Promise<T> {
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const accessToken = await getAccessToken();

  let transientRetries = 0;
  let rateLimitRetries = 0;
  for (;;) {
    await throttle();
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
    });

    if (res.status === 429) {
      const body = await res.json().catch(() => undefined);
      const retryAfterSeconds = Number(res.headers.get("Retry-After") ?? "1") || 1;
      if (retryAfterSeconds > MAX_RATE_LIMIT_WAIT_SECONDS) {
        console.warn(
          `[spotify] 429 rate limited on ${url.pathname} with Retry-After ${retryAfterSeconds}s — exceeds ` +
            `${MAX_RATE_LIMIT_WAIT_SECONDS}s cap, failing fast instead of stalling the request`,
        );
        throw new SpotifyApiError(res.status, `${url.pathname}${url.search}`, body);
      }
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
        throw new SpotifyApiError(res.status, `${url.pathname}${url.search}`, body);
      }
      rateLimitRetries += 1;
      console.warn(
        `[spotify] 429 rate limited on ${url.pathname} (attempt ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES}), waiting ${retryAfterSeconds}s`,
      );
      await sleep(retryAfterSeconds * 1000);
      continue;
    }

    if (res.status >= 500 && res.status < 600 && transientRetries < MAX_TRANSIENT_RETRIES) {
      transientRetries += 1;
      const waitSeconds = 2 ** transientRetries;
      console.warn(
        `[spotify] ${res.status} on ${url.pathname} (attempt ${transientRetries}/${MAX_TRANSIENT_RETRIES}), retrying in ${waitSeconds}s`,
      );
      await sleep(waitSeconds * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      throw new SpotifyApiError(res.status, `${url.pathname}${url.search}`, body);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Splits an array into chunks of at most `size` — used for Spotify's batch endpoints. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
