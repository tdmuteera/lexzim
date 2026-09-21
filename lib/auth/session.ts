import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, noteDbConnectivityFailure, noteDbConnectivitySuccess } from "@/lib/db";
import { asDatabaseUnavailable } from "@/lib/db/connectivity";
import { firms, roles, users } from "@/lib/db/schema";
import { getEffectivePermissionCodes } from "@/lib/rbac/repository";
import { AuthError, type AuthSessionUser } from "@/lib/auth/types";
import {
  decodeAccessTokenClaims,
  enforceStaffSessionFreshness,
  isStaffSessionRevoked,
} from "@/lib/auth/staff-sessions";
import {
  STAFF_EXPIRED_LOGOUT_REASON,
  STAFF_IDLE_LOGOUT_REASON,
  type StaffLogoutReason,
} from "@/lib/auth/idle-timeout";

async function loadSessionUser(authUserId: string): Promise<AuthSessionUser | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      jobTitle: users.jobTitle,
      isSystemUser: users.isSystemUser,
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
  if (!row) return null;
  if (!row.isActive) {
    throw new AuthError(
      "unauthorized",
      "This account is deactivated. Sign out and use an active login, or ask the Managing Partner to reactivate you.",
    );
  }
  if (!row.isSystemUser) {
    throw new AuthError(
      "unauthorized",
      "This person has no LexZim login. Create a system user from their staff record first.",
    );
  }
  if (row.firmStatus === "suspended" || row.firmStatus === "archived") {
    throw new AuthError(
      "unauthorized",
      "This firm is not currently active. Contact LexZim support.",
    );
  }

  const permissions = await getEffectivePermissionCodes({
    userId: row.id,
    roleId: row.roleId,
    roleCode: row.roleCode,
    firmId: row.firmId,
  });

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    jobTitle: row.jobTitle,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
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
    const { sessionId } = accessToken
      ? decodeAccessTokenClaims(accessToken)
      : { sessionId: null };

    if (await isStaffSessionRevoked(sessionId)) {
      await supabase.auth.signOut();
      return null;
    }

    const freshness = await enforceStaffSessionFreshness({
      userId: user.id,
      sessionId,
      touch: true,
    });
    if (freshness !== "ok") {
      await supabase.auth.signOut();
      return null;
    }

    const profile = await loadSessionUser(user.id);
    noteDbConnectivitySuccess();
    return profile;
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }
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

export type CookieSessionGate =
  | { ok: true }
  | { ok: false; reason: StaffLogoutReason | null };

/**
 * Platform shell gate: JWT present AND staff session still within idle / absolute limits.
 * Signs out and returns a login reason when the cookie is stale (bookmark / closed-tab return).
 */
export async function authCookieSessionGate(): Promise<CookieSessionGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: null };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;
  const { sessionId } = accessToken
    ? decodeAccessTokenClaims(accessToken)
    : { sessionId: null };

  if (await isStaffSessionRevoked(sessionId)) {
    await supabase.auth.signOut();
    return { ok: false, reason: STAFF_EXPIRED_LOGOUT_REASON };
  }

  const freshness = await enforceStaffSessionFreshness({
    userId: user.id,
    sessionId,
    touch: false,
  });
  if (freshness === "ok") return { ok: true };

  await supabase.auth.signOut();
  if (freshness === "idle") return { ok: false, reason: STAFF_IDLE_LOGOUT_REASON };
  return { ok: false, reason: STAFF_EXPIRED_LOGOUT_REASON };
}

/** @deprecated Prefer authCookieSessionGate for idle/absolute enforcement. */
export async function authHasCookieSession(): Promise<boolean> {
  const gate = await authCookieSessionGate();
  return gate.ok;
}

export { loadSessionUser };
