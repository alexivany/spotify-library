import { NextRequest, NextResponse } from "next/server";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const STATE_COOKIE = "spotify_auth_state";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function htmlPage(body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Spotify OAuth</title></head>` +
      `<body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; line-height: 1.5;">${body}</body></html>`,
    { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    } },
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const authError = url.searchParams.get("error");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;

  if (authError) {
    return htmlPage(`<h1>Spotify authorization failed</h1><p>${escapeHtml(authError)}</p>`);
  }

  if (!code || !state || state !== storedState) {
    return htmlPage(
      `<h1>Invalid OAuth state</h1><p>The state parameter did not match. Try <a href="/api/spotify/login">signing in again</a>.</p>`,
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return htmlPage(`<h1>Missing Spotify env vars</h1><p>Check SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REDIRECT_URI in .env.local.</p>`);
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    refresh_token?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenJson.refresh_token) {
    return htmlPage(
      `<h1>Token exchange failed</h1><p>Check your Spotify app credentials and redirect URI, then try connecting again.</p>`,
    );
  }

  const response = htmlPage(
    `<h1>Spotify connected</h1>` +
      `<p>Copy this refresh token into <code>.env.local</code> as <code>SPOTIFY_REFRESH_TOKEN</code>. ` +
      `It is shown only once and is not stored anywhere by this app.</p>` +
      `<pre style="background:#f4f4f4;padding:1rem;border-radius:6px;overflow-wrap:anywhere;white-space:pre-wrap;">${escapeHtml(tokenJson.refresh_token)}</pre>` +
      `<p>After saving it, restart the dev server and use "Sync now" on <a href="/library">/library</a>.</p>`,
  );
  response.cookies.delete(STATE_COOKIE);
  return response;
}
