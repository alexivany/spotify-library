import { getAccessToken } from "./token";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export class SpotifyApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`Spotify API error ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

type SpotifyFetchOptions = Omit<RequestInit, "headers"> & {
  searchParams?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
};

/**
 * Fetch wrapper for the Spotify Web API. Retries on 429 using the
 * Retry-After header (Spotify's rate limit is per-app, shared across the
 * whole sync run, so this backoff is load-bearing during a full sync).
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

  for (;;) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
    });

    if (res.status === 429) {
      const retryAfterSeconds = Number(res.headers.get("Retry-After") ?? "1");
      await sleep((retryAfterSeconds || 1) * 1000);
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      throw new SpotifyApiError(res.status, body);
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
