/**
 * AI conversations / messages repository stubs (P2-01).
 * EVERY firm-scoped query MUST filter firmId.
 */
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiConversations, aiMessages } from "@/lib/db/schema";
import type { AiConversationMode, AiMessageRole } from "@/lib/db/ai-types";

export async function listConversations(
  firmId: string,
  userId: string,
  opts?: { mode?: string; includeArchived?: boolean },
) {
  const db = getDb();
  const conditions = [eq(aiConversations.firmId, firmId), eq(aiConversations.userId, userId)];
  if (opts?.mode) conditions.push(eq(aiConversations.mode, opts.mode));
  if (!opts?.includeArchived) conditions.push(isNull(aiConversations.archivedAt));

  return db
    .select()
    .from(aiConversations)
    .where(and(...conditions))
    .orderBy(desc(aiConversations.updatedAt));
}

export async function getConversation(firmId: string, conversationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.firmId, firmId), eq(aiConversations.id, conversationId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createConversation(input: {
  firmId: string;
  userId: string;
  mode: AiConversationMode | string;
  matterId?: string | null;
  title?: string | null;
}) {
  const db = getDb();
  const rows = await db
    .insert(aiConversations)
    .values({
      firmId: input.firmId,
      userId: input.userId,
      mode: input.mode,
      matterId: input.matterId ?? null,
      title: input.title ?? null,
    })
    .returning();
  return rows[0];
}

export async function listMessages(firmId: string, conversationId: string) {
  const db = getDb();
  return db
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.firmId, firmId), eq(aiMessages.conversationId, conversationId)))
    .orderBy(asc(aiMessages.createdAt));
}

export async function createMessage(input: {
  firmId: string;
  conversationId: string;
  role: AiMessageRole | string;
  content: string;
  confidence?: number | null;
  citationsJson?: unknown[];
  retrievalMetaJson?: Record<string, unknown>;
}) {
  const db = getDb();
  const rows = await db
    .insert(aiMessages)
    .values({
      firmId: input.firmId,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      confidence: input.confidence ?? null,
      citationsJson: input.citationsJson ?? [],
      retrievalMetaJson: input.retrievalMetaJson ?? {},
    })
    .returning();

  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.firmId, input.firmId),
        eq(aiConversations.id, input.conversationId),
      ),
    );

  return rows[0];
}

export async function getMessage(
  firmId: string,
  conversationId: string,
  messageId: string,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.firmId, firmId),
        eq(aiMessages.conversationId, conversationId),
        eq(aiMessages.id, messageId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Update a user message and hard-delete all later messages in the thread (edit + regenerate). */
export async function editUserMessageAndTruncate(input: {
  firmId: string;
  conversationId: string;
  messageId: string;
  content: string;
}) {
  const db = getDb();
  const existing = await getMessage(input.firmId, input.conversationId, input.messageId);
  if (!existing || existing.role !== "user") return null;

  const content = input.content.trim();
  if (!content) throw new Error("content_required");

  await db.transaction(async (tx) => {
    await tx
      .update(aiMessages)
      .set({ content })
      .where(
        and(
          eq(aiMessages.firmId, input.firmId),
          eq(aiMessages.conversationId, input.conversationId),
          eq(aiMessages.id, input.messageId),
        ),
      );

    await tx
      .delete(aiMessages)
      .where(
        and(
          eq(aiMessages.firmId, input.firmId),
          eq(aiMessages.conversationId, input.conversationId),
          gt(aiMessages.createdAt, existing.createdAt),
        ),
      );

    await tx
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(aiConversations.firmId, input.firmId),
          eq(aiConversations.id, input.conversationId),
        ),
      );
  });

  return getMessage(input.firmId, input.conversationId, input.messageId);
}
