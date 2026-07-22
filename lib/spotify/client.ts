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
const MAX_RATE_LIMIT_RETRIES = 10;

/**
 * Fetch wrapper for the Spotify Web API. Retries on 429 using the
 * Retry-After header (Spotify's rate limit is per-app, shared across the
 * whole sync run, so this backoff is load-bearing during a full sync), up to
 * MAX_RATE_LIMIT_RETRIES — logged each time, so a long wait is visible in the
 * server log instead of looking like a hang. Also retries transient 5xx
 * errors (Spotify's API occasionally 502s mid-page on large libraries) with
 * exponential backoff, up to MAX_TRANSIENT_RETRIES.
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
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
    });

    if (res.status === 429) {
      if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
        const body = await res.json().catch(() => undefined);
        throw new SpotifyApiError(res.status, `${url.pathname}${url.search}`, body);
      }
      rateLimitRetries += 1;
      const retryAfterSeconds = Number(res.headers.get("Retry-After") ?? "1") || 1;
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
