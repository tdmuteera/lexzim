import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, noteDbConnectivityFailure, noteDbConnectivitySuccess } from "@/lib/db";
import { asDatabaseUnavailable } from "@/lib/db/connectivity";
import { firms, roles, users } from "@/lib/db/schema";
import { getPermissionCodesForRole } from "@/lib/rbac/repository";
import { AuthError, type AuthSessionUser } from "@/lib/auth/types";
import {
  decodeAccessTokenClaims,
  isStaffSessionRevoked,
} from "@/lib/auth/staff-sessions";

async function loadSessionUser(authUserId: string): Promise<AuthSessionUser | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      firmId: firms.id,
      firmName: firms.name,
      firmSlug: firms.slug,
      firmStatus: firms.status,
      firmCurrency: firms.defaultCurrency,
      firmLogoUrl: firms.logoUrl,
      firmIsDemo: firms.isDemo,
      roleId: roles.id,
      roleCode: roles.code,
      roleName: roles.name,
    })
    .from(users)
    .innerJoin(firms, eq(users.firmId, firms.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, authUserId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;
  if (row.firmStatus === "suspended" || row.firmStatus === "archived") {
    return null;
  }

  const permissions = await getPermissionCodesForRole(row.roleId);

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt,
    firm: {
      id: row.firmId,
      name: row.firmName,
      slug: row.firmSlug,
      status: row.firmStatus,
      defaultCurrency: row.firmCurrency,
      logoUrl: row.firmLogoUrl,
      isDemo: row.firmIsDemo,
    },
    role: {
      id: row.roleId,
      code: row.roleCode,
      name: row.roleName,
    },
    permissions,
  };
}

/**
 * Current signed-in app user + firm + role + permission codes, or null.
 * React.cache dedupes layout + page + nested server calls within one request.
 */
export const authCurrentUser = cache(async (): Promise<AuthSessionUser | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;
    if (accessToken) {
      const { sessionId } = decodeAccessTokenClaims(accessToken);
      if (await isStaffSessionRevoked(sessionId)) {
        await supabase.auth.signOut();
        return null;
      }
    }

    const profile = await loadSessionUser(user.id);
    noteDbConnectivitySuccess();
    return profile;
  } catch (err) {
    const unavailable = asDatabaseUnavailable(err);
    if (unavailable) {
      noteDbConnectivityFailure();
      throw unavailable;
    }
    throw err;
  }
});

/** Require a valid session; throws AuthError if missing/inactive. */
export async function requireSession(): Promise<AuthSessionUser> {
  const session = await authCurrentUser();
  if (!session) {
    throw new AuthError("unauthorized", "Sign in required.");
  }
  return session;
}

/**
 * Fast gate for platform shell: JWT / cookie only, no Postgres.
 * Full firm/role profile still loads via APIs and authCurrentUser when needed.
 */
export async function authHasCookieSession(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

export { loadSessionUser };
