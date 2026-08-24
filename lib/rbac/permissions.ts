import type { PermissionCode } from "@/lib/db/types";
import type { AuthSessionUser } from "@/lib/auth/types";

/** Client-safe session shape (dates serialized as ISO strings from API). */
export type ClientAuthSession = Omit<AuthSessionUser, "lastLoginAt"> & {
  lastLoginAt: string | null;
};

export function hasPermission(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
  code: PermissionCode | string,
): boolean {
  if (!user) return false;
  return (user.permissions as readonly string[]).includes(code);
}

export function hasAnyPermission(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
  codes: (PermissionCode | string)[],
): boolean {
  if (!user) return false;
  const granted = user.permissions as readonly string[];
  return codes.some((code) => granted.includes(code));
}

export function hasAllPermissions(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
  codes: (PermissionCode | string)[],
): boolean {
  if (!user) return false;
  const granted = user.permissions as readonly string[];
  return codes.every((code) => granted.includes(code));
}

/** Phase 1: whether user may see all firm matters (not only assigned). */
export function canViewAllMatters(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
): boolean {
  return hasPermission(user, "matters.view_all");
}

/**
 * Client name lookup for invoicing / quotations without full KYC registry access.
 * Full Clients module still requires clients.view.
 */
export function canLookupClients(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
): boolean {
  return hasAnyPermission(user, [
    "clients.view",
    "billing.view",
    "billing.manage",
    "finance.quote.manage",
  ]);
}

/**
 * Fee revenue / revenue-by-lawyer: finance desk only (not individual lawyers).
 */
export function canViewFirmRevenue(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
): boolean {
  return hasPermission(user, "finance.view");
}

/**
 * Lawyer caseload / revenue: MP and finance.view see the firm.
 * Others see self unless they have matters.view_all.
 */
export function canViewAllLawyerPerformance(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role.code === "managing_partner") return true;
  if (hasPermission(user, "finance.view")) return true;
  return canViewAllMatters(user);
}

const PRACTICE_LAWYER_ROLES = new Set([
  "managing_partner",
  "senior_associate",
  "junior_associate",
]);

/** Managing Partner or any lawyer may approve firm templates. */
export function canApproveTemplates(
  user: AuthSessionUser | ClientAuthSession | null | undefined,
): boolean {
  if (!user) return false;
  return PRACTICE_LAWYER_ROLES.has(user.role.code);
}
