import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SortableTableHead } from "../app/(app)/library/sortable-table-head";
import { parseLibraryFilters, queryLibrary } from "../lib/library/query";
import type { SortKey, SortOption } from "../lib/library/types";

describe("sortable list headers", () => {
  const columns: { label: string; key: SortKey }[] = [
    { label: "Track", key: "name" },
    { label: "Album", key: "album" },
    { label: "Artist", key: "artist" },
    { label: "Release date", key: "release_date" },
    { label: "Label", key: "label" },
  ];

  for (const { label, key } of columns) {
    it(`${label} starts ascending, toggles both ways, and preserves filters`, () => {
      const cases: { current: SortOption; next: SortOption; ariaSort?: string }[] = [
        { current: "saved_at-desc", next: `${key}-asc` },
        { current: `${key}-asc`, next: `${key}-desc`, ariaSort: "ascending" },
        { current: `${key}-desc`, next: `${key}-asc`, ariaSort: "descending" },
      ];

      for (const { current, next, ariaSort } of cases) {
        const params = new URLSearchParams({
          view: "tracks", display: "list", q: "love & light", genre: "soul,jazz",
          label: "A&B", page: "3", pageSize: "48", sort: current,
        });
        const before = params.toString();
        const html = renderToStaticMarkup(
          <SortableTableHead label={label} sortKey={key} sort={current} searchParams={params} />,
        );
        const href = html.match(/href="([^"]+)"/)?.[1];
        assert.ok(href);
        const nextParams = new URL(href.replaceAll("&amp;", "&"), "http://localhost/library").searchParams;
        assert.equal(nextParams.get("sort"), next);
        assert.equal(nextParams.has("page"), false);
        for (const name of ["view", "display", "q", "genre", "label", "pageSize"]) {
          assert.equal(nextParams.get(name), params.get(name));
        }
        assert.equal(params.toString(), before);
        assert.equal(html.match(/aria-sort="([^"]+)"/)?.[1], ariaSort);
        const direction = next.endsWith("-asc") ? "ascending" : "descending";
        assert.ok(html.includes(`aria-label="Sort by ${label.toLowerCase()} ${direction}"`));
      }
    });
  }
});

describe("library query ordering", () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const requests: URL[] = [];

  before(() => {
    // Never contact the configured database, even if .env.local is production.
    process.env.SUPABASE_URL = "https://sorting-test.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.hostname, "sorting-test.invalid");
      requests.push(url);
      return new Response("[]", {
        headers: { "Content-Type": "application/json", "Content-Range": "*/0" },
      });
    }) as typeof fetch;
  });
  beforeEach(() => { requests.length = 0; });
  after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it("rejects unrecognized or injected sort expressions", () => {
    for (const sort of ["name-asc,id.desc", "raw-desc", "artist-up", "label-asc.nullsfirst"]) {
      assert.equal(parseLibraryFilters({ sort }).sort, "saved_at-desc");
    }
  });

  for (const view of ["tracks", "albums"] as const) {
    for (const [key, column] of [
      ["name", "name"],
      ["album", view === "tracks" ? "albums(name)" : "name"],
      ["release_date", view === "tracks" ? "albums(release_date)" : "release_date"],
      ["label", view === "tracks" ? "albums(resolved_label)" : "resolved_label"],
      // Historical credited aliases remain the intentional artist sort key.
      ["artist", "raw->artists->0->>name"],
    ] as const) {
      for (const direction of ["asc", "desc"] as const) {
        it(`${view}: ${key} ${direction} orders the parent rows before page two`, async () => {
          const filters = parseLibraryFilters({
            view, sort: `${key}-${direction}`, page: "2", label: "Warp", genre: "ambient",
          });
          assert.equal(filters.sort, `${key}-${direction}`);
          await queryLibrary(filters);
          assert.equal(requests.length, 1);
          const { pathname, searchParams: params } = requests[0];
          assert.equal(pathname, `/rest/v1/${view}`);
          assert.equal(params.get("order"),
            `${column}.${direction}.nullslast,${column === "name" ? "" : "name.asc,"}id.asc`);
          // Ordering an embedded album alone doesn't reorder its parent tracks.
          assert.equal(params.has("albums.order"), false);
          assert.equal(params.get("offset"), "24");
          assert.equal(params.get("limit"), "24");
          const prefix = view === "tracks" ? "albums." : "";
          assert.equal(params.get(`${prefix}resolved_label`), "ilike.%Warp%");
          assert.equal(params.get(`${prefix}musicbrainz_genres`), "ov.{ambient}");
          assert.equal(params.get("saved_at"), "not.is.null");
        });
      }
    }
  }
});
