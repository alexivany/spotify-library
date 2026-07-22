const TOKEN_URL = "https://accounts.spotify.com/api/token";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/**
 * Refreshes the Spotify access token from the stored refresh token and
 * caches it in memory until shortly before it expires. There is no
 * persistent token store — this is a single-user local tool and the
 * refresh token lives in `.env.local`.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5_000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, or SPOTIFY_REFRESH_TOKEN. " +
        "Run the OAuth flow via /api/spotify/login first.",
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to refresh Spotify access token: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  if (json.refresh_token && json.refresh_token !== refreshToken) {
    console.warn(
      "Spotify returned a new refresh_token. Update SPOTIFY_REFRESH_TOKEN in .env.local to avoid future refresh failures.",
    );
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };

  return cachedToken.accessToken;
}
