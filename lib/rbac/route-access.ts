import type { AuthSessionUser } from "@/lib/auth/types";
import { requireSession } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/types";
import { getRoutePermission } from "@/lib/nav";
import { hasPermission } from "@/lib/rbac/permissions";

export function canAccessRoute(
  session: AuthSessionUser,
  pathname: string,
): boolean {
  const permission = getRoutePermission(pathname);
  if (!permission) return true;
  return hasPermission(session, permission);
}

/** Server route guard for platform modules. */
export async function requireRouteAccess(pathname: string): Promise<AuthSessionUser> {
  const session = await requireSession();
  const permission = getRoutePermission(pathname);
  if (permission && !hasPermission(session, permission)) {
    throw new AuthError("forbidden", `Permission required: ${permission}`);
  }
  return session;
}

export async function getRouteAccessStatus(pathname: string): Promise<{
  allowed: boolean;
  permission?: string;
}> {
  const session = await requireSession();
  const permission = getRoutePermission(pathname);
  if (permission && !hasPermission(session, permission)) {
    return { allowed: false, permission };
  }
  return { allowed: true, permission };
}
