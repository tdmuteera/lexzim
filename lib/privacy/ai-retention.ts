/**
 * Minimize AI conversation retention (P5-12).
 * Deletes old ai_conversations; ai_messages cascade.
 */
import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiConversations } from "@/lib/db/schema";
import { getFirmSetting } from "@/lib/repos/firm-settings";

export const DEFAULT_AI_CONVERSATION_RETENTION_DAYS = 90;

export async function resolveAiConversationRetentionDays(
  firmId?: string | null,
): Promise<number> {
  if (firmId) {
    const raw = await getFirmSetting(firmId, "ai_conversation_retention_days");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 7 && n <= 3650) return Math.floor(n);
  }
  const env = Number(process.env.AI_CONVERSATION_RETENTION_DAYS ?? "");
  if (Number.isFinite(env) && env >= 7 && env <= 3650) return Math.floor(env);
  return DEFAULT_AI_CONVERSATION_RETENTION_DAYS;
}

export async function purgeOldAiConversations(opts?: {
  firmId?: string | null;
  olderThanDays?: number;
}): Promise<{ deleted: number; olderThanDays: number; firmId: string | null }> {
  const firmId = opts?.firmId ?? null;
  const olderThanDays =
    opts?.olderThanDays ?? (await resolveAiConversationRetentionDays(firmId));
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const db = getDb();

  const conditions = [lt(aiConversations.updatedAt, cutoff)];
  if (firmId) conditions.push(eq(aiConversations.firmId, firmId));

  const deleted = await db
    .delete(aiConversations)
    .where(and(...conditions))
    .returning({ id: aiConversations.id });

  return {
    deleted: deleted.length,
    olderThanDays,
    firmId,
  };
}

/** Count conversations that would be purged (dry run). */
export async function countExpiringAiConversations(opts?: {
  firmId?: string | null;
  olderThanDays?: number;
}): Promise<{ count: number; olderThanDays: number }> {
  const firmId = opts?.firmId ?? null;
  const olderThanDays =
    opts?.olderThanDays ?? (await resolveAiConversationRetentionDays(firmId));
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const db = getDb();
  const conditions = [lt(aiConversations.updatedAt, cutoff)];
  if (firmId) conditions.push(eq(aiConversations.firmId, firmId));

  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiConversations)
    .where(and(...conditions));

  return { count: Number(rows[0]?.n ?? 0), olderThanDays };
}
