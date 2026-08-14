import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { passwordResetRequests, roles, users } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/auth/password";

export type PasswordResetRequestRow = {
  id: string;
  firmId: string | null;
  userId: string | null;
  email: string;
  status: string;
  note: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  fullName: string | null;
  roleName: string | null;
};

/**
 * Record a password reset request (login screen). Never reveals whether the
 * email exists. If the email maps to an active user we attach firmId/userId so
 * the right firm's admins see it; otherwise it lands as an orphan pending row
 * that admins can dismiss.
 */
export async function createPasswordResetRequest(
  emailRaw: string,
  opts?: { ipOrUserAgent?: string | null },
): Promise<void> {
  const email = normalizeEmail(emailRaw);
  if (!email) return;

  const db = getDb();
  const userRows = await db
    .select({ id: users.id, firmId: users.firmId, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = userRows[0];

  // Only attach to active users; still record row for audit trail.
  const firmId = user?.isActive ? user.firmId : null;
  const userId = user?.isActive ? user.id : null;

  if (firmId && userId) {
    const existing = await db
      .select({ id: passwordResetRequests.id })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.userId, userId),
          eq(passwordResetRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (existing[0]) return; // dedupe: one open request per user
  }

  await db.insert(passwordResetRequests).values({
    firmId,
    userId,
    email,
    status: "pending",
    ipOrUserAgent: opts?.ipOrUserAgent ?? null,
  });
}

export async function listResetRequests(
  firmId: string,
  status: "pending" | "all" = "pending",
): Promise<PasswordResetRequestRow[]> {
  const db = getDb();
  const conditions = [eq(passwordResetRequests.firmId, firmId)];
  if (status === "pending") {
    conditions.push(eq(passwordResetRequests.status, "pending"));
  }
  const rows = await db
    .select({
      id: passwordResetRequests.id,
      firmId: passwordResetRequests.firmId,
      userId: passwordResetRequests.userId,
      email: passwordResetRequests.email,
      status: passwordResetRequests.status,
      note: passwordResetRequests.note,
      requestedAt: passwordResetRequests.requestedAt,
      resolvedAt: passwordResetRequests.resolvedAt,
      fullName: users.fullName,
      roleName: roles.name,
    })
    .from(passwordResetRequests)
    .leftJoin(users, eq(users.id, passwordResetRequests.userId))
    .leftJoin(roles, eq(roles.id, users.roleId))
    .where(and(...conditions))
    .orderBy(desc(passwordResetRequests.requestedAt))
    .limit(200);

  return rows.map((r) => ({
    ...r,
    requestedAt: r.requestedAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));
}

export async function getResetRequest(firmId: string, requestId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(passwordResetRequests)
    .where(
      and(
        eq(passwordResetRequests.firmId, firmId),
        eq(passwordResetRequests.id, requestId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markResetResolved(
  requestId: string,
  status: "approved" | "rejected",
  resolvedBy: string,
  note?: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(passwordResetRequests)
    .set({
      status,
      resolvedAt: new Date(),
      resolvedBy,
      note: note ?? null,
    })
    .where(eq(passwordResetRequests.id, requestId));
}

export async function countPendingResetRequests(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: passwordResetRequests.id })
    .from(passwordResetRequests)
    .where(
      and(
        eq(passwordResetRequests.firmId, firmId),
        eq(passwordResetRequests.status, "pending"),
      ),
    );
  return rows.length;
}
