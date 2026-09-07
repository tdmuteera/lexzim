/**
 * Staff communication emails (P11-09). May differ from login email.
 */
import "server-only";

import { and, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { normalizeEmailAddress } from "@/lib/email/mailer";
import { getDb } from "@/lib/db";
import { staffCommunicationEmails, users } from "@/lib/db/schema";

export async function getPrimaryCommunicationEmail(
  firmId: string,
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(staffCommunicationEmails)
    .where(
      and(
        eq(staffCommunicationEmails.firmId, firmId),
        eq(staffCommunicationEmails.userId, userId),
        eq(staffCommunicationEmails.isPrimary, true),
      ),
    )
    .limit(1);
  if (rows[0]?.email) return rows[0].email;

  const login = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .limit(1);
  return login[0]?.email?.trim().toLowerCase() || null;
}

export async function listCommunicationEmails(firmId: string, userId: string) {
  const db = getDb();
  return db
    .select()
    .from(staffCommunicationEmails)
    .where(
      and(
        eq(staffCommunicationEmails.firmId, firmId),
        eq(staffCommunicationEmails.userId, userId),
      ),
    );
}

/**
 * Set primary communication email for a user (replaces previous primary row for that email pair).
 */
export async function setPrimaryCommunicationEmail(
  firmId: string,
  userId: string,
  emailRaw: string,
) {
  const email = normalizeEmailAddress(emailRaw);
  const db = getDb();

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .limit(1);
  if (!userRows[0]) throw new AuthError("not_found", "User not found.");

  await db
    .update(staffCommunicationEmails)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(staffCommunicationEmails.firmId, firmId),
        eq(staffCommunicationEmails.userId, userId),
      ),
    );

  const existing = await db
    .select()
    .from(staffCommunicationEmails)
    .where(
      and(
        eq(staffCommunicationEmails.firmId, firmId),
        eq(staffCommunicationEmails.userId, userId),
        eq(staffCommunicationEmails.email, email),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(staffCommunicationEmails)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(staffCommunicationEmails.id, existing[0].id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(staffCommunicationEmails)
    .values({
      firmId,
      userId,
      email,
      isPrimary: true,
      updatedAt: new Date(),
    })
    .returning();
  return row!;
}

export async function resolveStaffNotifyEmails(
  firmId: string,
  userIds: string[],
): Promise<Array<{ userId: string; email: string }>> {
  const out: Array<{ userId: string; email: string }> = [];
  const seen = new Set<string>();
  for (const userId of userIds) {
    const email = await getPrimaryCommunicationEmail(firmId, userId);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ userId, email });
  }
  return out;
}
