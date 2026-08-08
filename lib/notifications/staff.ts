/**
 * Firm-scoped in-app staff notifications (portal inbox alerts, etc.).
 */
import "server-only";

import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { staffNotifications } from "@/lib/db/schema";

export async function createStaffNotification(input: {
  firmId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  const rows = await db
    .insert(staffNotifications)
    .values({
      firmId: input.firmId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      metadataJson: input.metadata ?? {},
    })
    .returning();
  return rows[0];
}

export async function listStaffNotifications(
  firmId: string,
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
) {
  const db = getDb();
  const conditions = [
    eq(staffNotifications.firmId, firmId),
    or(isNull(staffNotifications.userId), eq(staffNotifications.userId, userId)),
  ];
  if (opts?.unreadOnly) {
    conditions.push(isNull(staffNotifications.readAt));
  }
  return db
    .select()
    .from(staffNotifications)
    .where(and(...conditions))
    .orderBy(desc(staffNotifications.createdAt))
    .limit(opts?.limit ?? 20);
}

export async function markStaffNotificationRead(
  firmId: string,
  userId: string,
  notificationId: string,
) {
  const db = getDb();
  const rows = await db
    .update(staffNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(staffNotifications.id, notificationId),
        eq(staffNotifications.firmId, firmId),
        or(isNull(staffNotifications.userId), eq(staffNotifications.userId, userId)),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function markAllStaffNotificationsRead(firmId: string, userId: string) {
  const db = getDb();
  await db
    .update(staffNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(staffNotifications.firmId, firmId),
        isNull(staffNotifications.readAt),
        or(isNull(staffNotifications.userId), eq(staffNotifications.userId, userId)),
      ),
    );
}
