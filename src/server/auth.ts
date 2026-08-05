import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { config } from "./config.js";

const COOKIE_NAME = "dogfeed_session";
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

type SessionPayload = { exp: number };

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", config.sessionSecret).update(data).digest("base64url");
}

export function createSessionToken(): string {
  const exp = Date.now() + config.sessionDays * 24 * 60 * 60 * 1000;
  const payload = b64url(JSON.stringify({ exp } satisfies SessionPayload));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function pinMatches(input: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(config.pin);
  if (a.length !== b.length) {
    // still do a dummy compare to reduce timing leak on length
    timingSafeEqual(randomBytes(32), randomBytes(32));
    return false;
  }
  return timingSafeEqual(a, b);
}

export function checkLoginRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 10;
  let entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    loginAttempts.set(ip, entry);
  }
  if (entry.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

function cookieSecure(): boolean {
  // Behind DockPloy/HTTPS set COOKIE_SECURE=true (or leave default in production).
  // For local HTTP smoke tests: COOKIE_SECURE=false.
  if (process.env.COOKIE_SECURE === "true" || process.env.COOKIE_SECURE === "1") return true;
  if (process.env.COOKIE_SECURE === "false" || process.env.COOKIE_SECURE === "0") return false;
  return config.isProd;
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "Lax",
    path: "/",
    maxAge: config.sessionDays * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

export function getSessionFromRequest(c: Context): boolean {
  return verifySessionToken(getCookie(c, COOKIE_NAME));
}

export async function requireAuth(c: Context, next: Next) {
  if (!getSessionFromRequest(c)) {
    return c.json({ error: "Non authentifié" }, 401);
  }
  await next();
}
