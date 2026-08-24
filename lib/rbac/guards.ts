import "server-only";

import { requireSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/types";
import type { AuthSessionUser } from "@/lib/auth/types";
import type { PermissionCode } from "@/lib/db/types";
import {
  canViewAllLawyerPerformance,
  canViewAllMatters,
  canApproveTemplates,
  canLookupClients,
  canViewFirmRevenue,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from "@/lib/rbac/permissions";

export async function requirePermission(
  permissionCode: PermissionCode | string,
): Promise<AuthSessionUser> {
  const session = await requireSession();
  if (!hasPermission(session, permissionCode)) {
    throw new AuthError("forbidden", `Permission required: ${permissionCode}`);
  }
  return session;
}

export async function requireAny(
  permissionCodes: (PermissionCode | string)[],
): Promise<AuthSessionUser> {
  const session = await requireSession();
  if (!hasAnyPermission(session, permissionCodes)) {
    throw new AuthError("forbidden", "Insufficient permissions.");
  }
  return session;
}

export async function requireAll(
  permissionCodes: (PermissionCode | string)[],
): Promise<AuthSessionUser> {
  const session = await requireSession();
  if (!hasAllPermissions(session, permissionCodes)) {
    throw new AuthError("forbidden", "Insufficient permissions.");
  }
  return session;
}

/**
 * Ensures the signed-in user's firm matches the requested firm scope.
 * Pass the firm id from route params or query — never trust without this check.
 */
export async function requireFirmScope(firmId: string): Promise<AuthSessionUser> {
  const session = await requireSession();
  if (session.firm.id !== firmId) {
    throw new AuthError("forbidden", "Firm scope mismatch.");
  }
  return session;
}

export {
  canViewAllMatters,
  canViewAllLawyerPerformance,
  canApproveTemplates,
  canLookupClients,
  canViewFirmRevenue,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
};
