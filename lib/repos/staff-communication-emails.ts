/**
 * Staff communication emails (P11-09). May differ from login email.
 * Up to MAX_STAFF_NOTIFY_EMAILS addresses per person receive the same staff notifications
 * (business + personal inboxes). Assigned by users.manage (system admin).
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { normalizeEmailAddress } from "@/lib/email/mailer";
import { getDb } from "@/lib/db";
import { staffCommunicationEmails, users } from "@/lib/db/schema";

/** Primary + up to two additional inboxes (business / personal / backup). */
export const MAX_STAFF_NOTIFY_EMAILS = 3;

export async function getPrimaryCommunicationEmail(
  firmId: string,
  userId: string,
): Promise<string | null> {
  const emails = await listNotifyEmailsForUser(firmId, userId);
  return emails[0] ?? null;
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
 * Ordered notification emails for a user (primary first).
 * Falls back to login email when no communication rows exist.
 */
export async function listNotifyEmailsForUser(
  firmId: string,
  userId: string,
): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(staffCommunicationEmails)
    .where(
      and(
        eq(staffCommunicationEmails.firmId, firmId),
        eq(staffCommunicationEmails.userId, userId),
      ),
    )
    .orderBy(desc(staffCommunicationEmails.isPrimary));

  const emails: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
    if (emails.length >= MAX_STAFF_NOTIFY_EMAILS) break;
  }

  if (emails.length > 0) return emails;

  const login = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .limit(1);
  const loginEmail = login[0]?.email?.trim().toLowerCase();
  return loginEmail ? [loginEmail] : [];
}

function normalizeEmailList(emailsRaw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of emailsRaw) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    let email: string;
    try {
      email = normalizeEmailAddress(raw);
    } catch {
      throw new AuthError("validation", `Invalid email address: ${raw.trim()}`);
    }
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= MAX_STAFF_NOTIFY_EMAILS) break;
  }
  return out;
}

/**
 * Replace all communication emails for a user (max 3). First entry is primary.
 * Empty list is not allowed — pass at least one address.
 */
export async function setCommunicationEmails(
  firmId: string,
  userId: string,
  emailsRaw: string[],
) {
  const emails = normalizeEmailList(emailsRaw);
  if (emails.length === 0) {
    throw new AuthError(
      "validation",
      "At least one notification email is required.",
    );
  }
  if (emailsRaw.filter((e) => typeof e === "string" && e.trim()).length > MAX_STAFF_NOTIFY_EMAILS) {
    throw new AuthError(
      "validation",
      `You can assign at most ${MAX_STAFF_NOTIFY_EMAILS} notification emails per person.`,
    );
  }

  const db = getDb();
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .limit(1);
  if (!userRows[0]) throw new AuthError("not_found", "User not found.");

  await db
    .delete(staffCommunicationEmails)
    .where(
      and(
        eq(staffCommunicationEmails.firmId, firmId),
        eq(staffCommunicationEmails.userId, userId),
      ),
    );

  const inserted = [];
  for (let i = 0; i < emails.length; i += 1) {
    const [row] = await db
      .insert(staffCommunicationEmails)
      .values({
        firmId,
        userId,
        email: emails[i]!,
        isPrimary: i === 0,
        updatedAt: new Date(),
      })
      .returning();
    inserted.push(row!);
  }
  return { emails, rows: inserted, primary: emails[0]! };
}

/**
 * Set primary communication email (compat). Keeps other secondary emails when possible.
 */
export async function setPrimaryCommunicationEmail(
  firmId: string,
  userId: string,
  emailRaw: string,
) {
  const email = normalizeEmailAddress(emailRaw);
  const existing = await listNotifyEmailsForUser(firmId, userId);
  const without = existing.filter((e) => e !== email);
  const next = [email, ...without].slice(0, MAX_STAFF_NOTIFY_EMAILS);
  const result = await setCommunicationEmails(firmId, userId, next);
  return result.rows.find((r) => r.isPrimary) ?? result.rows[0]!;
}

/**
 * Resolve all notification targets for a set of users.
 * Each person may contribute up to MAX_STAFF_NOTIFY_EMAILS addresses.
 * Dedupes identical addresses across the batch.
 */
export async function resolveStaffNotifyEmails(
  firmId: string,
  userIds: string[],
): Promise<Array<{ userId: string; email: string }>> {
  const out: Array<{ userId: string; email: string }> = [];
  const seen = new Set<string>();
  for (const userId of userIds) {
    const emails = await listNotifyEmailsForUser(firmId, userId);
    for (const email of emails) {
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ userId, email });
    }
  }
  return out;
}
