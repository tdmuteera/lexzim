/**
 * Client portal feature flags (Phase 5).
 * Same Next.js app; routes under /portal. No subdomain required for MVP.
 */
export function isPortalEnabled(): boolean {
  const raw = process.env.PORTAL_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  // Default on in non-production so local skeleton is reachable.
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return process.env.NODE_ENV !== "production";
}

export function getPortalPublicPath(): string {
  return "/portal";
}

export function getPortalStrategyNote(): string {
  return "MVP: same Railway Next.js service at /portal. Optional later: portal.* host to the same service.";
}
