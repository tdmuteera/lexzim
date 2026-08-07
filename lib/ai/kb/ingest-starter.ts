import "server-only";

import { createHash } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiEmbeddings, knowledgeChunks, knowledgeSources } from "@/lib/db/schema";
import { chunkTextWithOverlap } from "@/lib/ai/kb/chunker";
import {
  countSystemKnowledgeEmbeddings,
  embedSystemKnowledgeChunks,
  type EmbedKnowledgeResult,
} from "@/lib/ai/kb/embed-chunks";
import {
  STARTER_KB_SOURCES,
  STARTER_PACK_VERSION,
} from "@/lib/ai/kb/starter-pack";
import { GEMINI_EMBEDDINGS_MODEL_ID } from "@/lib/ai/types";

export type StarterIngestResult = {
  packVersion: string;
  quality: "starter_demo";
  sourcesUpserted: number;
  chunksWritten: number;
  sourcesRemoved: number;
  embeddingsDeleted: number;
  embeddingNote: string;
};

export type KbReingestAllResult = {
  pack: StarterIngestResult;
  embeddings: EmbedKnowledgeResult;
  steps: Array<{ step: string; ok: boolean; detail: string }>;
};

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function deleteEmbeddingsForChunkIds(chunkIds: string[]) {
  if (chunkIds.length === 0) return 0;
  const db = getDb();
  const deleted = await db
    .delete(aiEmbeddings)
    .where(
      and(eq(aiEmbeddings.ownerType, "knowledge_chunk"), inArray(aiEmbeddings.ownerId, chunkIds)),
    )
    .returning({ id: aiEmbeddings.id });
  return deleted.length;
}

/**
 * Load/replace the system Zimbabwe starter pack (firm_id NULL).
 * Idempotent by pack version. Chunks use ~500–800 token windows with overlap.
 */
export async function ingestZimbabweStarterPack(): Promise<StarterIngestResult> {
  const db = getDb();

  const existing = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(
      and(isNull(knowledgeSources.firmId), eq(knowledgeSources.versionLabel, STARTER_PACK_VERSION)),
    );

  let embeddingsDeleted = 0;
  for (const row of existing) {
    const oldChunks = await db
      .select({ id: knowledgeChunks.id })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.sourceId, row.id));
    embeddingsDeleted += await deleteEmbeddingsForChunkIds(oldChunks.map((c) => c.id));
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, row.id));
    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, row.id));
  }

  let chunksWritten = 0;
  const now = new Date();

  for (const source of STARTER_KB_SOURCES) {
    const combined = source.chunks.map((c) => `${c.headingPath}\n${c.text}`).join("\n\n");
    const contentHash = hashText(`${STARTER_PACK_VERSION}:${source.key}:${combined}`);

    const [created] = await db
      .insert(knowledgeSources)
      .values({
        firmId: null,
        title: source.title,
        sourceType: source.sourceType,
        citationLabel: source.citationLabel,
        jurisdiction: "Zimbabwe",
        publisher: source.publisher,
        sourceUrl: source.sourceUrl,
        licenseNote: source.licenseNote,
        versionLabel: STARTER_PACK_VERSION,
        effectiveDate: source.effectiveDate,
        ingestedAt: now,
        contentHash,
        isActive: true,
        updatedAt: now,
      })
      .returning();

    let chunkIndex = 0;
    for (const section of source.chunks) {
      const windows = chunkTextWithOverlap({
        headingPath: section.headingPath,
        text: section.text,
      });
      for (const window of windows) {
        await db.insert(knowledgeChunks).values({
          sourceId: created!.id,
          firmId: null,
          chunkIndex,
          headingPath: window.headingPath,
          text: window.text,
          tokenEstimate: window.tokenEstimate,
          metadataJson: {
            packVersion: STARTER_PACK_VERSION,
            sourceKey: source.key,
            quality: "starter_demo",
          },
        });
        chunkIndex += 1;
        chunksWritten += 1;
      }
    }
  }

  return {
    packVersion: STARTER_PACK_VERSION,
    quality: "starter_demo",
    sourcesUpserted: STARTER_KB_SOURCES.length,
    chunksWritten,
    sourcesRemoved: existing.length,
    embeddingsDeleted,
    embeddingNote: "Call kbReingestAll / embed step to write pgvector embeddings.",
  };
}

/**
 * Full re-ingest: replace starter pack text, then embed all system chunks.
 * Documented idempotency: pack version replace + embedding upsert by owner+model.
 */
export async function kbReingestAll(firmIdForProvider: string): Promise<KbReingestAllResult> {
  const steps: KbReingestAllResult["steps"] = [];

  const pack = await ingestZimbabweStarterPack();
  steps.push({
    step: "load_starter_pack",
    ok: true,
    detail: `sources=${pack.sourcesUpserted} chunks=${pack.chunksWritten} removed=${pack.sourcesRemoved}`,
  });

  const embeddings = await embedSystemKnowledgeChunks({
    firmIdForProvider,
  });

  steps.push({
    step: "embed_chunks",
    ok: embeddings.failed === 0 && !embeddings.errorCode,
    detail: embeddings.message ?? `embedded=${embeddings.embedded}`,
  });

  return { pack, embeddings, steps };
}

export async function getKnowledgePackStats() {
  const db = getDb();

  const [sourceRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeSources)
    .where(and(isNull(knowledgeSources.firmId), eq(knowledgeSources.isActive, true)));

  const [chunkRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeChunks)
    .where(isNull(knowledgeChunks.firmId));

  const [packRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeSources)
    .where(
      and(
        isNull(knowledgeSources.firmId),
        eq(knowledgeSources.versionLabel, STARTER_PACK_VERSION),
        eq(knowledgeSources.isActive, true),
      ),
    );

  const packSources = await db
    .select({
      id: knowledgeSources.id,
      title: knowledgeSources.title,
      citationLabel: knowledgeSources.citationLabel,
      sourceType: knowledgeSources.sourceType,
      ingestedAt: knowledgeSources.ingestedAt,
    })
    .from(knowledgeSources)
    .where(
      and(isNull(knowledgeSources.firmId), eq(knowledgeSources.versionLabel, STARTER_PACK_VERSION)),
    );

  const embeddingCount = await countSystemKnowledgeEmbeddings(GEMINI_EMBEDDINGS_MODEL_ID);
  const chunkCount = chunkRow?.count ?? 0;

  return {
    packVersion: STARTER_PACK_VERSION,
    quality: "starter_demo" as const,
    systemSourceCount: sourceRow?.count ?? 0,
    systemChunkCount: chunkCount,
    starterPackSourceCount: packRow?.count ?? 0,
    embeddingCount,
    embeddingsModel: GEMINI_EMBEDDINGS_MODEL_ID,
    embeddingsReady: chunkCount > 0 && embeddingCount >= chunkCount,
    sources: packSources.map((s) => ({
      id: s.id,
      title: s.title,
      citationLabel: s.citationLabel,
      sourceType: s.sourceType,
      ingestedAt: s.ingestedAt?.toISOString() ?? null,
    })),
  };
}
