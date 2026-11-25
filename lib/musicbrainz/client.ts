const MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TRANSIENT_RETRIES = 2;

export class MusicBrainzApiError extends Error {
  constructor(public status: number, public path: string) {
    super(`MusicBrainz API error ${status} on ${path}`);
  }
}

export class MusicBrainzUnavailableError extends Error {
  constructor(public retryAfterSeconds = 60) {
    super("MusicBrainz is busy or not responding. Progress has been saved; enrichment is paused.");
  }
}

export class MusicBrainzChunkBudgetExceededError extends Error {
  constructor() {
    super("MusicBrainz chunk time budget reached; saving progress for the next chunk.");
  }
}

type MusicBrainzFetchOptions = Omit<RequestInit, "headers"> & {
  searchParams?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
};

export type MusicBrainzFetcher = <T>(path: string, options?: MusicBrainzFetchOptions) => Promise<T>;

type ClientOptions = {
  deadline?: number;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  requestTimeoutMs?: number;
  intervalMs?: number;
};

function userAgent(): string {
  const contactEmail = process.env.MUSICBRAINZ_CONTACT_EMAIL;
  if (!contactEmail) throw new Error("MUSICBRAINZ_CONTACT_EMAIL is not configured.");
  return `spotify-library/1.0 ( ${contactEmail} )`;
}

function retryAfter(value: string | null, now: number): number {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - now) / 1000;
  return Number.isFinite(delay) ? Math.max(0, Math.ceil(delay)) : 0;
}

/** A client belongs to one chunk. Deadlines and retry state never leak between invocations. */
export function createMusicBrainzClient(options: ClientOptions = {}): MusicBrainzFetcher {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const request = options.fetch ?? ((...args) => fetch(...args));
  const deadline = options.deadline ?? Infinity;
  const configuredInterval = Number(process.env.MUSICBRAINZ_MIN_REQUEST_INTERVAL_MS ?? 1100);
  const interval = options.intervalMs ?? Math.max(1100, Number.isFinite(configuredInterval) ? configuredInterval : 1100);
  // A fresh chunk may follow the previous chunk immediately on another instance.
  // Wait one interval before its first request as well as between later requests.
  let nextAllowedAt = now() + interval;
  let throttleChain = Promise.resolve();

  const checkBudget = () => {
    if (now() >= deadline) throw new MusicBrainzChunkBudgetExceededError();
  };

  async function throttle() {
    const turn = throttleChain.then(async () => {
      checkBudget();
      const wait = Math.max(0, nextAllowedAt - now());
      if (now() + wait >= deadline) throw new MusicBrainzChunkBudgetExceededError();
      if (wait) await sleep(wait);
      checkBudget();
      nextAllowedAt = now() + interval;
    });
    // A deadline rejection must not poison subsequent calls on the pacing gate.
    throttleChain = turn.catch(() => {});
    await turn;
  }

  return async function musicBrainzFetch<T>(path: string, { searchParams, headers, ...init }: MusicBrainzFetchOptions = {}): Promise<T> {
    const url = new URL(`${MUSICBRAINZ_API_BASE}${path}`);
    url.searchParams.set("fmt", "json");
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const agent = userAgent();

    for (let attempt = 0; ; attempt++) {
      await throttle();
      checkBudget();
      const remaining = deadline - now();
      const limit = Math.min(options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS, remaining);
      const controller = new AbortController();
      const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // The timer covers response headers AND body consumption. Racing also protects
        // against a transport that ignores AbortSignal; the underlying fetch is aborted.
        const response = await Promise.race([
          (async () => {
            const res = await request(url, {
              ...init, signal, cache: "no-store",
              headers: { "User-Agent": agent, Accept: "application/json", ...headers },
            });
            const transient = res.status === 429 || res.status >= 500;
            if (transient) {
              const delay = retryAfter(res.headers.get("retry-after"), now());
              await res.body?.cancel();
              return { transient: true as const, delay, status: res.status };
            }
            if (!res.ok) {
              await res.body?.cancel();
              throw new MusicBrainzApiError(res.status, url.pathname);
            }
            return { transient: false as const, data: await res.json() as T };
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              const error = remaining <= (options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS)
                ? new MusicBrainzChunkBudgetExceededError()
                : new MusicBrainzUnavailableError();
              reject(error);
              controller.abort(error);
            }, limit);
          }),
        ]);
        checkBudget();
        if (!response.transient) return response.data;
        if (attempt >= MAX_TRANSIENT_RETRIES) throw new MusicBrainzUnavailableError(Math.max(60, response.delay));
        const waitSeconds = Math.max(2 ** (attempt + 1), response.delay);
        if (now() + waitSeconds * 1000 >= deadline) {
          throw new MusicBrainzUnavailableError(Math.max(60, waitSeconds));
        }
        console.warn(`[musicbrainz] ${response.status} on ${url.pathname}; retry ${attempt + 1}/${MAX_TRANSIENT_RETRIES} in ${waitSeconds}s`);
        // The HTTP timer must not include backoff; the chunk deadline still does.
        clearTimeout(timer);
        await sleep(waitSeconds * 1000);
      } catch (error) {
        if (error instanceof MusicBrainzApiError || error instanceof MusicBrainzUnavailableError || error instanceof MusicBrainzChunkBudgetExceededError) throw error;
        if (init.signal?.aborted) throw error;
        throw new MusicBrainzUnavailableError();
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

export const musicBrainzFetch = createMusicBrainzClient();
