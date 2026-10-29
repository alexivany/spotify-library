import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { Env } from "./config";

export const SETUP_CALLBACK = "http://127.0.0.1:43821/api/spotify/callback";

export async function exchangeCode(env: Env, code: string, redirectUri: string): Promise<string> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  const body = await response.json();
  if (!response.ok || typeof body.refresh_token !== "string") {
    throw new Error("Spotify token exchange failed. Check the client ID, secret and exact registered setup callback, then retry.");
  }
  return body.refresh_token;
}

function page(title: string, message: string): string {
  // These strings are fixed by the application, never reflected OAuth input.
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;background:#121212;color:#eee;font:18px/1.6 system-ui"><main style="max-width:600px;margin:12vh auto;padding:32px"><p style="color:#1ed760">Spotify Library Manager · Setup</p><h1>${title}</h1><p>${message}</p><p>You can close this tab and return to your terminal.</p></main></body></html>`;
}

/** A temporary loopback listener, independent of Next.js, app login and the DB. */
export async function startSpotifyConnection(options: {
  clientId: string;
  exchange: (code: string, redirectUri: string) => Promise<string>;
  saveToken: (token: string) => Promise<void>;
  port?: number;
  timeoutMs?: number;
}): Promise<{ authorizeUrl: string; done: Promise<void>; close: () => void }> {
  const state = randomBytes(32).toString("hex");
  let exchanging = false;
  let settled = false;
  let resolveDone: () => void;
  let rejectDone: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  // A caller can print the URL before awaiting completion without an unhandled rejection.
  void done.catch(() => {});
  let redirectUri = "";
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== "/api/spotify/callback") {
      response.writeHead(404).end(page("Setup is waiting", "Open the Spotify authorization link printed in your terminal."));
      return;
    }
    const supplied = Buffer.from(url.searchParams.get("state") ?? "");
    const expected = Buffer.from(state);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(400).end(page("Invalid authorization state", "Use the link from the current setup session and try again."));
      return;
    }
    if (exchanging || settled) { response.writeHead(409).end("Authorization already handled."); return; }
    if (url.searchParams.has("error") || !url.searchParams.get("code")) {
      response.writeHead(400).end(page("Spotify was not connected", "No token was saved. Run the Spotify setup step again when ready."));
      finish(new Error("Spotify authorization was declined. Run bun run setup:spotify to retry."));
      return;
    }
    exchanging = true;
    try {
      const token = await options.exchange(url.searchParams.get("code")!, redirectUri);
      await options.saveToken(token);
      response.end(page("Spotify connected", "Your refresh token has been saved to your private environment file. It was not displayed or sent to an AI assistant."));
      finish();
    } catch {
      response.writeHead(500).end(page("Connection could not be saved", "Check your Spotify app credentials, callback URL and environment file permissions, then retry setup."));
      finish(new Error("Could not exchange or save the Spotify token. Check your credentials, registered setup callback and file permissions; then retry."));
    }
  });
  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
    if (error) rejectDone(error); else resolveDone();
  };
  const timer = setTimeout(() => finish(new Error("Spotify setup timed out after 10 minutes. Run bun run setup:spotify to retry.")), options.timeoutMs ?? 600_000);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", () => reject(new Error("Cannot start the local OAuth listener. Check that 127.0.0.1:43821 is available and local network access is allowed, then retry.")));
      server.listen(options.port ?? 43821, "127.0.0.1", resolve);
    });
  } catch (error) {
    finish(error as Error);
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start the local OAuth listener.");
  redirectUri = `http://127.0.0.1:${address.port}/api/spotify/callback`;
  const params = new URLSearchParams({ response_type: "code", client_id: options.clientId, scope: "user-library-read", redirect_uri: redirectUri, state });
  return { authorizeUrl: `https://accounts.spotify.com/authorize?${params}`, done, close: () => finish(new Error("Spotify setup cancelled.")) };
}
