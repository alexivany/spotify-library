import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMusicBrainzClient, MusicBrainzApiError, MusicBrainzChunkBudgetExceededError, MusicBrainzUnavailableError } from "../lib/musicbrainz/client";
import { runEnrichment } from "../lib/musicbrainz/enrich";
import type { MatchResult } from "../lib/musicbrainz/match";
import { enrichmentFixture } from "./support/enrichment-fixture";

const matched: MatchResult = { status: "matched", releaseId: "fixture-release", releaseGroupId: null, label: "Fixture label", genres: [], score: 100 };
const backup = async () => ({ dir: "fixture", files: [] });

async function withContact(run: () => Promise<void>) {
  const previous = process.env.MUSICBRAINZ_CONTACT_EMAIL;
  process.env.MUSICBRAINZ_CONTACT_EMAIL = "fixture@example.invalid";
  try { await run(); } finally {
    if (previous === undefined) delete process.env.MUSICBRAINZ_CONTACT_EMAIL;
    else process.env.MUSICBRAINZ_CONTACT_EMAIL = previous;
  }
}

describe("MusicBrainz HTTP deadlines and retries", () => {
  it("paces the first request of every new chunk as well as subsequent requests", () => withContact(async () => {
    let clock = 0;
    const times: number[] = [];
    const options = { now: () => clock, sleep: async (ms: number) => { clock += ms; }, intervalMs: 1100,
      fetch: (async () => { times.push(clock); return Response.json({}); }) as typeof fetch };
    const first = createMusicBrainzClient(options);
    await first("/url");
    await first("/url");
    await createMusicBrainzClient(options)("/url");
    assert.deepEqual(times, [1100, 2200, 3300]);
  }));

  it("bounds continuous 503 retries instead of exhausting a chunk indefinitely", () => withContact(async () => {
    let calls = 0, clock = 0;
    const request = createMusicBrainzClient({ now: () => clock, sleep: async ms => { clock += ms; }, deadline: 45_000, intervalMs: 0,
      fetch: (async () => { calls++; return new Response(null, { status: 503 }); }) as typeof fetch });
    await assert.rejects(request("/url"), MusicBrainzUnavailableError);
    assert.equal(calls, 3);
    assert.equal(clock, 6000);
  }));

  it("aborts a request that never supplies response headers", () => withContact(async () => {
    let signal: AbortSignal | undefined;
    const request = createMusicBrainzClient({ requestTimeoutMs: 15, intervalMs: 0,
      fetch: ((_url, init) => { signal = init?.signal ?? undefined; return new Promise(() => {}); }) as typeof fetch });
    await assert.rejects(request("/url"), MusicBrainzUnavailableError);
    assert.equal(signal?.aborted, true);
  }));

  it("bounds a stalled JSON body as well as response headers", () => withContact(async () => {
    const request = createMusicBrainzClient({ requestTimeoutMs: 15, intervalMs: 0,
      fetch: (async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }))) as typeof fetch });
    await assert.rejects(request("/release/fixture"), MusicBrainzUnavailableError);
  }));

  it("uses the remaining chunk deadline when it is shorter than the request timeout", () => withContact(async () => {
    const request = createMusicBrainzClient({ deadline: Date.now() + 15, requestTimeoutMs: 1000, intervalMs: 0,
      fetch: (() => new Promise(() => {})) as unknown as typeof fetch });
    await assert.rejects(request("/url"), MusicBrainzChunkBudgetExceededError);
  }));

  it("does not begin another lookup after a successful response consumes the budget", () => withContact(async () => {
    let clock = 0, calls = 0;
    const request = createMusicBrainzClient({ deadline: 10, now: () => clock, intervalMs: 0,
      fetch: (async () => { calls++; clock = 11; return Response.json({}); }) as typeof fetch });
    await assert.rejects(request("/url"), MusicBrainzChunkBudgetExceededError);
    await assert.rejects(request("/release/fixture"), MusicBrainzChunkBudgetExceededError);
    assert.equal(calls, 1);
  }));

  it("honors Retry-After without sleeping past the chunk deadline", () => withContact(async () => {
    let calls = 0;
    const request = createMusicBrainzClient({ deadline: 45_000, now: () => 0, intervalMs: 0,
      fetch: (async () => { calls++; return new Response(null, { status: 429, headers: { "Retry-After": "120" } }); }) as typeof fetch });
    await assert.rejects(request("/url"), (error: unknown) => error instanceof MusicBrainzUnavailableError && error.retryAfterSeconds === 120);
    assert.equal(calls, 1);
  }));

  it("preserves 404 lookup semantics and isolates deadlines between clients", () => withContact(async () => {
    const expired = createMusicBrainzClient({ deadline: 0, now: () => 1 });
    await assert.rejects(expired("/url"), MusicBrainzChunkBudgetExceededError);
    const fresh = createMusicBrainzClient({ intervalMs: 0, fetch: (async () => new Response(null, { status: 404 })) as typeof fetch });
    await assert.rejects(fresh("/url"), (error: unknown) => error instanceof MusicBrainzApiError && error.status === 404);
  }));
});

describe("resumable enrichment coordination", () => {
  it("persists cooldown across invocations and resumes after it expires without inflating counts", async () => {
    const fixture = enrichmentFixture();
    let clock = Date.now(), calls = 0;
    const dependencies = { supabase: fixture.client, now: () => clock, backup, match: async () => { calls++; throw new MusicBrainzUnavailableError(); } };
    const first = await runEnrichment(dependencies);
    assert.equal(first.status, "paused");
    assert.equal(calls, 1);
    assert.equal(fixture.runs[0].status, "running");
    assert.equal((fixture.runs[0].cursor as { candidates: number }).candidates, 0);
    await runEnrichment(dependencies);
    assert.equal(calls, 1, "a second invocation during cooldown makes no MusicBrainz request");
    clock = Date.parse(String(fixture.state.retry_after)) + 1;
    const result = await runEnrichment({ ...dependencies, match: async () => matched });
    assert.equal(result.status, "success");
    if (result.status === "success") assert.deepEqual(result.counts, { candidates: 1, matched: 1, ambiguous: 0, unmatched: 0, errors: 0 });
    assert.equal(fixture.runs.length, 1);
    assert.equal(fixture.state.no_progress_chunks, 0);
  });

  it("resumes an old active run instead of declaring it orphaned after ten minutes", async () => {
    const fixture = enrichmentFixture();
    fixture.runs.push({ id: "old-run", status: "running", started_at: "2020-01-01T00:00:00Z", cursor: { candidates: 99, matched: 3, ambiguous: 0, unmatched: 0, errors: 0 } });
    const result = await runEnrichment({ supabase: fixture.client, match: async () => matched, backup });
    assert.equal(result.status, "success");
    if (result.status === "success") assert.equal(result.counts.candidates, 4);
    assert.equal(fixture.runs.length, 1);
    assert.equal(fixture.runs[0].status, "success");
  });

  it("allows only one of two concurrent invocations to process albums", async () => {
    const fixture = enrichmentFixture();
    let enter!: () => void, finish!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    const first = runEnrichment({ supabase: fixture.client, backup, match: async () => { enter(); await blocked; return matched; } });
    await entered;
    const second = await runEnrichment({ supabase: fixture.client, backup, match: async () => { throw new Error("must not run"); } });
    assert.equal(second.status, "paused");
    if (second.status === "paused") assert.match(second.message, /Another enrichment request/);
    finish();
    assert.equal((await first).status, "success");
    assert.equal(fixture.runs.length, 1);
  });

  it("recovers an expired invocation lease without discarding progress", async () => {
    const fixture = enrichmentFixture();
    fixture.state.lease_token = "abandoned";
    fixture.state.lease_expires_at = new Date(Date.now() - 1).toISOString();
    fixture.runs.push({ id: "resumed", status: "running", cursor: { matched: 2 }, started_at: "2020-01-01T00:00:00Z" });
    const result = await runEnrichment({ supabase: fixture.client, match: async () => matched, backup });
    assert.equal(result.status, "success");
    if (result.status === "success") assert.equal(result.counts.matched, 3);
    assert.equal(fixture.state.lease_token, null);
  });

  it("backs off progressively when chunks make no progress", async () => {
    const fixture = enrichmentFixture(); let clock = Date.now();
    const dependencies = { supabase: fixture.client, now: () => clock, backup, match: async () => { throw new MusicBrainzChunkBudgetExceededError(); } };
    const first = await runEnrichment(dependencies);
    assert.equal(first.status, "paused");
    clock = Date.parse(String(fixture.state.retry_after)) + 1;
    const second = await runEnrichment(dependencies);
    assert.equal(second.status, "paused");
    if (first.status === "paused" && second.status === "paused") assert.ok(second.retryAfterSeconds > first.retryAfterSeconds);
    assert.equal((fixture.runs[0].cursor as { candidates: number }).candidates, 0);
  });

  it("fails closed when coordination storage is unavailable", async () => {
    const fixture = enrichmentFixture(); fixture.fail("musicbrainz_enrichment_state");
    await assert.rejects(runEnrichment({ supabase: fixture.client, match: async () => { throw new Error("must not run"); }, backup }), /Cannot coordinate MusicBrainz/);
    assert.equal(fixture.runs.length, 0);
  });
});
