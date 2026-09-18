import type { AuthSessionUser } from "@/lib/auth/types";
import { requireSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/types";
import { getRoutePermission, getRoutePermissions } from "@/lib/nav";
import { hasAnyPermission, hasPermission } from "@/lib/rbac/permissions";

export function canAccessRoute(
  session: AuthSessionUser,
  pathname: string,
): boolean {
  const permissions = getRoutePermissions(pathname);
  if (!permissions.length) return true;
  return hasAnyPermission(session, permissions);
}

/** Server route guard for platform modules. */
export async function requireRouteAccess(pathname: string): Promise<AuthSessionUser> {
  const session = await requireSession();
  const permissions = getRoutePermissions(pathname);
  if (permissions.length && !hasAnyPermission(session, permissions)) {
    throw new AuthError(
      "forbidden",
      `Permission required: ${permissions.join(" or ")}`,
    );
  }
  return session;
}

export async function getRouteAccessStatus(pathname: string): Promise<{
  allowed: boolean;
  permission?: string;
}> {
  const session = await requireSession();
  const permissions = getRoutePermissions(pathname);
  if (permissions.length && !hasAnyPermission(session, permissions)) {
    return { allowed: false, permission: getRoutePermission(pathname) };
  }
  return { allowed: true, permission: getRoutePermission(pathname) };
}

/** Convenience re-export for callers that only need a single code check. */
export { hasPermission };
