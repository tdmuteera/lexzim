/**
 * Ops / platform-admin access: platform_admins row + optional IP allowlist.
 */
import "server-only";

import { AuthError } from "@/lib/auth/types";
import { requirePlatformAdmin } from "@/lib/platform/admin";

export function clientIpFromRequest(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

/** Comma-separated IPs/CIDR-lite exact matches. Empty = no IP restriction. */
export function getOpsIpAllowlist(): string[] {
  const raw = process.env.OPS_IP_ALLOWLIST?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function assertOpsIpAllowed(request: Request): void {
  const allow = getOpsIpAllowlist();
  if (allow.length === 0) return;
  const ip = clientIpFromRequest(request);
  if (!ip || !allow.includes(ip)) {
    throw new AuthError(
      "forbidden",
      "Ops access denied from this network address.",
    );
  }
}

/**
 * Platform admin + optional OPS_IP_ALLOWLIST.
 * Pass the incoming Request so IP can be checked.
 */
export async function requireOpsAccess(request: Request) {
  assertOpsIpAllowed(request);
  return requirePlatformAdmin();
}
