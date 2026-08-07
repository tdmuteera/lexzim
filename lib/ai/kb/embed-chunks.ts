import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiEmbeddings, knowledgeChunks } from "@/lib/db/schema";
import { AiProviderError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/providers";
import { GEMINI_EMBEDDINGS_MODEL_ID } from "@/lib/ai/types";

export type EmbedProgressStep = {
  chunkId: string;
  status: "embedded" | "skipped" | "failed";
  errorCode?: string;
};

export type EmbedKnowledgeResult = {
  modelName: string;
  attempted: number;
  embedded: number;
  failed: number;
  deletedOrphans: number;
  progress: EmbedProgressStep[];
  errorCode?: string;
  message?: string;
};

/**
 * Embed all system KB chunks (firm_id NULL) into ai_embeddings.
 * Idempotent via unique (owner_type, owner_id, model_name) upsert.
 */
export async function embedSystemKnowledgeChunks(input: {
  firmIdForProvider: string;
  modelName?: string;
}): Promise<EmbedKnowledgeResult> {
  const db = getDb();
  let provider;
  try {
    provider = await getProvider(input.firmIdForProvider);
  } catch (err) {
    const code = err instanceof AiProviderError ? err.code : "provider_error";
    return {
      modelName: input.modelName ?? GEMINI_EMBEDDINGS_MODEL_ID,
      attempted: 0,
      embedded: 0,
      failed: 0,
      deletedOrphans: 0,
      progress: [],
      errorCode: code,
      message: err instanceof Error ? err.message : "Could not resolve AI provider.",
    };
  }

  const modelName = input.modelName?.trim() || provider.defaultEmbeddingsModel;

  const chunks = await db
    .select({
      id: knowledgeChunks.id,
      text: knowledgeChunks.text,
      headingPath: knowledgeChunks.headingPath,
    })
    .from(knowledgeChunks)
    .where(isNull(knowledgeChunks.firmId));

  const progress: EmbedProgressStep[] = [];
  let embedded = 0;
  let failed = 0;

  for (const chunk of chunks) {
    const payload = [chunk.headingPath, chunk.text].filter(Boolean).join("\n\n");
    try {
      const result = await provider.embed(payload, { model: modelName });
      await db
        .insert(aiEmbeddings)
        .values({
          ownerType: "knowledge_chunk",
          ownerId: chunk.id,
          firmId: null,
          embedding: result.embedding,
          modelName: result.model,
        })
        .onConflictDoUpdate({
          target: [aiEmbeddings.ownerType, aiEmbeddings.ownerId, aiEmbeddings.modelName],
          set: {
            embedding: result.embedding,
            createdAt: new Date(),
          },
        });
      embedded += 1;
      progress.push({ chunkId: chunk.id, status: "embedded" });
    } catch (err) {
      failed += 1;
      const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
      progress.push({ chunkId: chunk.id, status: "failed", errorCode });
      // Stop early on missing/invalid key so we do not burn the loop.
      if (errorCode === "missing_key" || errorCode === "invalid_key") {
        return {
          modelName,
          attempted: chunks.length,
          embedded,
          failed,
          deletedOrphans: 0,
          progress,
          errorCode,
          message: err instanceof Error ? err.message : "Embedding failed.",
        };
      }
    }
  }

  // Remove orphan embeddings for deleted system chunks (same model).
  const liveIds = chunks.map((c) => c.id);
  let deletedOrphans = 0;
  if (liveIds.length > 0) {
    const orphans = await db
      .select({ id: aiEmbeddings.id, ownerId: aiEmbeddings.ownerId })
      .from(aiEmbeddings)
      .where(
        and(
          eq(aiEmbeddings.ownerType, "knowledge_chunk"),
          eq(aiEmbeddings.modelName, modelName),
          isNull(aiEmbeddings.firmId),
        ),
      );
    const orphanIds = orphans.filter((o) => !liveIds.includes(o.ownerId)).map((o) => o.id);
    if (orphanIds.length > 0) {
      await db.delete(aiEmbeddings).where(inArray(aiEmbeddings.id, orphanIds));
      deletedOrphans = orphanIds.length;
    }
  } else {
    const deleted = await db
      .delete(aiEmbeddings)
      .where(
        and(
          eq(aiEmbeddings.ownerType, "knowledge_chunk"),
          eq(aiEmbeddings.modelName, modelName),
          isNull(aiEmbeddings.firmId),
        ),
      )
      .returning({ id: aiEmbeddings.id });
    deletedOrphans = deleted.length;
  }

  return {
    modelName,
    attempted: chunks.length,
    embedded,
    failed,
    deletedOrphans,
    progress,
    errorCode: failed > 0 ? "partial_failure" : undefined,
    message:
      failed > 0
        ? `Embedded ${embedded}/${chunks.length}; ${failed} failed.`
        : `Embedded ${embedded} chunks with ${modelName}.`,
  };
}

export async function countSystemKnowledgeEmbeddings(modelName?: string) {
  const db = getDb();
  const conditions = [
    eq(aiEmbeddings.ownerType, "knowledge_chunk"),
    isNull(aiEmbeddings.firmId),
  ];
  if (modelName) conditions.push(eq(aiEmbeddings.modelName, modelName));

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiEmbeddings)
    .where(and(...conditions));

  return row?.count ?? 0;
}
