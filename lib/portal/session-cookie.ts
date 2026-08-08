import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  appUrlIsHttps,
  isProductionRuntime,
  withProductionCookieOptions,
} from "@/lib/env";

export const PORTAL_COOKIE_NAME = "lz_portal_session";
/** Short-lived portal sessions (8 hours). */
export const PORTAL_SESSION_TTL_SEC = 60 * 60 * 8;

export type PortalSessionPayload = {
  v: 1;
  sub: string;
  firmId: string;
  clientId: string;
  email: string;
  exp: number;
};

function portalSecret(): string {
  return (
    process.env.PORTAL_SESSION_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "dev-portal-secret-change-me"
  );
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function signPortalSession(payload: PortalSessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", portalSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

export function verifyPortalSessionToken(token: string): PortalSessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", portalSecret()).update(body).digest();
  let actual: Buffer;
  try {
    actual = fromB64url(sig);
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as PortalSessionPayload;
    if (payload.v !== 1 || !payload.sub || !payload.firmId || !payload.clientId) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function portalCookieOptions(maxAgeSec = PORTAL_SESSION_TTL_SEC) {
  return withProductionCookieOptions({
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    maxAge: maxAgeSec,
    // Path "/" so /api/portal/* receives the cookie; name is portal-specific.
    secure: isProductionRuntime() && appUrlIsHttps() ? true : undefined,
  });
}

export async function setPortalSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(PORTAL_COOKIE_NAME, token, portalCookieOptions());
}

export async function clearPortalSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(PORTAL_COOKIE_NAME, "", portalCookieOptions(0));
}

export async function readPortalSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(PORTAL_COOKIE_NAME)?.value ?? null;
}
