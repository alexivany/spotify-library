import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single-password session gate for this personal, single-user app.
 *
 * There are no user accounts. Access is proven by a signed, httpOnly cookie
 * whose value is `<expiryMs>.<hmac>`, where the HMAC is over the expiry using
 * AUTH_SECRET. Nothing is stored server-side — verification is a recomputed
 * HMAC plus an expiry check. Next.js 16 runs proxy.ts on the Node.js runtime,
 * so node:crypto is available here and in the auth route handlers.
 */

export const SESSION_COOKIE_NAME = "sl_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a random value of 32+ chars.",
    );
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mint a session token valid for SESSION_MAX_AGE_SECONDS from `now` (ms). */
export function createSessionToken(now: number): string {
  const exp = now + SESSION_MAX_AGE_SECONDS * 1000;
  return `${exp}.${sign(String(exp))}`;
}

/** True only for an unexpired token whose signature matches AUTH_SECRET. */
export function isValidSessionToken(
  token: string | undefined,
  now: number,
): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sig, sign(expStr));
}

/** Constant-time check of a submitted password against APP_PASSWORD. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(input, expected);
}
