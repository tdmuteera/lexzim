import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import {
  STAFF_ACTIVITY_PING_MIN_MS,
  STAFF_IDLE_TIMEOUT_MS,
  STAFF_SESSION_ABSOLUTE_MAX_MS,
} from "@/lib/auth/idle-timeout";
import { getDb, getSql } from "@/lib/db";
import { staffSessions, users } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";

export function decodeAccessTokenClaims(accessToken: string): {
  sessionId: string | null;
  sub: string | null;
} {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return { sessionId: null, sub: null };
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const data = JSON.parse(json) as { session_id?: string; sub?: string };
    return {
      sessionId: typeof data.session_id === "string" ? data.session_id : null,
      sub: typeof data.sub === "string" ? data.sub : null,
    };
  } catch {
    return { sessionId: null, sub: null };
  }
}

export type StaffSessionFreshness = "ok" | "idle" | "expired" | "revoked";

/**
 * Server-side idle + absolute session gate.
 * Returns why the session should end, or "ok" (and may refresh lastSeenAt).
 */
export async function enforceStaffSessionFreshness(input: {
  userId: string;
  sessionId: string | null;
  /** When true, update lastSeenAt after a successful freshness check. */
  touch?: boolean;
}): Promise<StaffSessionFreshness> {
  const db = getDb();
  const now = Date.now();

  let row:
    | {
        id: string;
        createdAt: Date;
        lastSeenAt: Date;
        revokedAt: Date | null;
      }
    | undefined;

  if (input.sessionId) {
    const rows = await db
      .select({
        id: staffSessions.id,
        createdAt: staffSessions.createdAt,
        lastSeenAt: staffSessions.lastSeenAt,
        revokedAt: staffSessions.revokedAt,
      })
      .from(staffSessions)
      .where(
        and(
          eq(staffSessions.userId, input.userId),
          eq(staffSessions.sessionId, input.sessionId),
        ),
      )
      .limit(1);
    row = rows[0];
  }

  if (!row) {
    const rows = await db
      .select({
        id: staffSessions.id,
        createdAt: staffSessions.createdAt,
        lastSeenAt: staffSessions.lastSeenAt,
        revokedAt: staffSessions.revokedAt,
      })
      .from(staffSessions)
      .where(
        and(eq(staffSessions.userId, input.userId), isNull(staffSessions.revokedAt)),
      )
      .orderBy(desc(staffSessions.lastSeenAt))
      .limit(1);
    row = rows[0];
  }

  // No registry row (legacy / failed register): require a fresh sign-in.
  if (!row) return "expired";
  if (row.revokedAt) return "revoked";

  if (now - row.createdAt.getTime() > STAFF_SESSION_ABSOLUTE_MAX_MS) {
    await db
      .update(staffSessions)
      .set({ revokedAt: new Date(), revokedByUserId: input.userId })
      .where(and(eq(staffSessions.id, row.id), isNull(staffSessions.revokedAt)));
    return "expired";
  }

  if (now - row.lastSeenAt.getTime() > STAFF_IDLE_TIMEOUT_MS) {
    await db
      .update(staffSessions)
      .set({ revokedAt: new Date(), revokedByUserId: input.userId })
      .where(and(eq(staffSessions.id, row.id), isNull(staffSessions.revokedAt)));
    return "idle";
  }

  if (input.touch !== false && now - row.lastSeenAt.getTime() >= STAFF_ACTIVITY_PING_MIN_MS) {
    await db
      .update(staffSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(staffSessions.id, row.id));
  }

  return "ok";
}

/** Explicit activity heartbeat from the open browser tab. */
export async function touchStaffSessionActivity(input: {
  userId: string;
  sessionId: string | null;
}): Promise<StaffSessionFreshness> {
  return enforceStaffSessionFreshness({ ...input, touch: true });
}

export async function registerStaffSession(input: {
  firmId: string;
  userId: string;
  sessionId: string | null;
  ipOrUserAgent?: string | null;
}) {
  const db = getDb();
  const now = new Date();
  if (input.sessionId) {
    const existing = await db
      .select()
      .from(staffSessions)
      .where(
        and(
          eq(staffSessions.firmId, input.firmId),
          eq(staffSessions.sessionId, input.sessionId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (existing[0].revokedAt) {
        throw new AuthError("unauthorized", "This session was revoked. Sign in again.");
      }
      const rows = await db
        .update(staffSessions)
        .set({
          lastSeenAt: now,
          createdAt: now,
          ipOrUserAgent: input.ipOrUserAgent ?? existing[0].ipOrUserAgent,
        })
        .where(eq(staffSessions.id, existing[0].id))
        .returning();
      return rows[0];
    }
  }

  const rows = await db
    .insert(staffSessions)
    .values({
      firmId: input.firmId,
      userId: input.userId,
      sessionId: input.sessionId,
      ipOrUserAgent: input.ipOrUserAgent ?? null,
      userAgent: input.ipOrUserAgent ?? null,
      createdAt: now,
      lastSeenAt: now,
    })
    .returning();
  return rows[0];
}

export async function isStaffSessionRevoked(sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;
  const db = getDb();
  const rows = await db
    .select({ revokedAt: staffSessions.revokedAt })
    .from(staffSessions)
    .where(eq(staffSessions.sessionId, sessionId))
    .limit(1);
  return Boolean(rows[0]?.revokedAt);
}

export async function listActiveStaffSessions(firmId: string, userId?: string) {
  const db = getDb();
  const conditions = [
    eq(staffSessions.firmId, firmId),
    isNull(staffSessions.revokedAt),
  ];
  if (userId) conditions.push(eq(staffSessions.userId, userId));

  return db
    .select({
      id: staffSessions.id,
      userId: staffSessions.userId,
      sessionId: staffSessions.sessionId,
      ipOrUserAgent: staffSessions.ipOrUserAgent,
      createdAt: staffSessions.createdAt,
      lastSeenAt: staffSessions.lastSeenAt,
      fullName: users.fullName,
      email: users.email,
    })
    .from(staffSessions)
    .innerJoin(users, eq(staffSessions.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(staffSessions.lastSeenAt))
    .limit(100);
}

/** Best-effort delete from auth.sessions (Supabase). Ignores if schema not reachable. */
async function deleteAuthSessions(opts: {
  sessionId?: string | null;
  userId?: string;
}): Promise<void> {
  const sqlClient = getSql();
  try {
    if (opts.sessionId) {
      await sqlClient`delete from auth.sessions where id = ${opts.sessionId}::uuid`;
      return;
    }
    if (opts.userId) {
      await sqlClient`delete from auth.sessions where user_id = ${opts.userId}::uuid`;
    }
  } catch {
    /* auth schema may be restricted on some pools; app revoke still blocks via registry */
  }
}

export async function revokeStaffSession(input: {
  firmId: string;
  registryId: string;
  revokedByUserId: string;
}) {
  const db = getDb();
  const rows = await db
    .update(staffSessions)
    .set({
      revokedAt: new Date(),
      revokedByUserId: input.revokedByUserId,
    })
    .where(
      and(
        eq(staffSessions.id, input.registryId),
        eq(staffSessions.firmId, input.firmId),
        isNull(staffSessions.revokedAt),
      ),
    )
    .returning();
  const row = rows[0];
  if (!row) throw new AuthError("not_found", "Active session not found.");
  await deleteAuthSessions({ sessionId: row.sessionId });
  return row;
}

export async function revokeAllStaffSessionsForUser(input: {
  firmId: string;
  userId: string;
  revokedByUserId: string;
  exceptSessionId?: string | null;
}) {
  const db = getDb();
  const conditions = [
    eq(staffSessions.firmId, input.firmId),
    eq(staffSessions.userId, input.userId),
    isNull(staffSessions.revokedAt),
  ];
  if (input.exceptSessionId) {
    conditions.push(
      sql`(${staffSessions.sessionId} is distinct from ${input.exceptSessionId}::uuid)`,
    );
  }
  const rows = await db
    .update(staffSessions)
    .set({
      revokedAt: new Date(),
      revokedByUserId: input.revokedByUserId,
    })
    .where(and(...conditions))
    .returning();

  if (input.exceptSessionId) {
    for (const row of rows) {
      await deleteAuthSessions({ sessionId: row.sessionId });
    }
  } else {
    await deleteAuthSessions({ userId: input.userId });
  }
  return rows;
}

export async function setUserActiveState(input: {
  firmId: string;
  userId: string;
  isActive: boolean;
}) {
  const db = getDb();
  const rows = await db
    .update(users)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(and(eq(users.id, input.userId), eq(users.firmId, input.firmId)))
    .returning();
  if (!rows[0]) throw new AuthError("not_found", "User not found in this firm.");

  if (!rows[0].isSystemUser) {
    return rows[0];
  }

  try {
    const admin = createAdminClient();
    if (!input.isActive) {
      await admin.auth.admin.updateUserById(input.userId, {
        ban_duration: "876000h",
      });
      await deleteAuthSessions({ userId: input.userId });
    } else {
      await admin.auth.admin.updateUserById(input.userId, {
        ban_duration: "none",
      });
    }
  } catch {
    /* ban is best-effort; app is_active still gates loadSessionUser */
  }

  return rows[0];
}
