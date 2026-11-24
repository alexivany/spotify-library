import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { safeNext } from "../lib/auth-redirect";
import { POST as login } from "../app/api/auth/login/route";
import { GET as callback } from "../app/api/spotify/callback/route";

describe("login redirect boundary", () => {
  it("rejects external URLs, backslash authorities, and stripped control characters", () => {
    for (const value of [undefined, "https://example.test", "//example.test", "/\\example.test", "/\t/example.test", "/\n/example.test", "/\r/example.test"]) {
      assert.equal(safeNext(value), "/");
    }
    assert.equal(safeNext("/library?view=albums&q=some%20music"), "/library?view=albums&q=some%20music");
  });

  it("keeps a successful form login on the instance and sets a protected cookie", async () => {
    const previous = { APP_PASSWORD: process.env.APP_PASSWORD, AUTH_SECRET: process.env.AUTH_SECRET };
    process.env.APP_PASSWORD = "fixture-only-passphrase";
    process.env.AUTH_SECRET = "fixture-only-signing-key-at-least-32-characters";
    try {
      for (const next of ["/\\example.test", "/\t/example.test", "/library?view=albums"]) {
        const response = await login(new NextRequest("http://localhost/api/auth/login", {
          method: "POST", body: new URLSearchParams({ password: process.env.APP_PASSWORD, next }),
        }));
        const destination = new URL(response.headers.get("location")!);
        assert.equal(destination.origin, "http://localhost");
        assert.equal(destination.pathname, next.startsWith("/library") ? "/library" : "/");
        assert.equal(response.status, 303);
        assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
        assert.match(response.headers.get("set-cookie")!, /SameSite=lax/i);
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
});

describe("Spotify callback output", () => {
  it("renders attacker-controlled errors as text and prevents caching and scripts", async () => {
    const payload = '<script>document.title="injected"</script>';
    const url = new URL("http://localhost/api/spotify/callback");
    url.searchParams.set("error", payload);
    const response = await callback(new NextRequest(url));
    const html = await response.text();
    assert.ok(!html.includes(payload));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy")!, /default-src 'none'/);
  });

  it("does not expose token-provider error bodies", async () => {
    const previousFetch = globalThis.fetch;
    const keys = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"];
    const previous = keys.map(key => process.env[key]);
    keys.forEach(key => { process.env[key] = "fixture-only"; });
    globalThis.fetch = (async () => Response.json({ error_description: "private-provider-details", access_token: "private-token" }, { status: 400 })) as typeof fetch;
    try {
      const response = await callback(new NextRequest("http://localhost/api/spotify/callback?code=fixture&state=fixture", {
        headers: { cookie: "spotify_auth_state=fixture" },
      }));
      const html = await response.text();
      assert.ok(html.includes("Token exchange failed"));
      assert.ok(!html.includes("private-provider-details"));
      assert.ok(!html.includes("private-token"));
    } finally {
      globalThis.fetch = previousFetch;
      keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    }
  });
});
