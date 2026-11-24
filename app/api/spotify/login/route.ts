import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const STATE_COOKIE = "spotify_auth_state";

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing SPOTIFY_CLIENT_ID or SPOTIFY_REDIRECT_URI in .env.local" },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "user-library-read",
    redirect_uri: redirectUri,
    state,
  });

  const response = NextResponse.redirect(`${AUTHORIZE_URL}?${params}`);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
