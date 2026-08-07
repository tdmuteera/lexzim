import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiEmbeddings, documents, matterEvents, matters } from "@/lib/db/schema";
import { AiProviderError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/providers";
import { GEMINI_EMBEDDINGS_MODEL_ID } from "@/lib/ai/types";
import {
  composeDocumentMetaText,
  composeMatterNoteText,
  composeMatterSummaryText,
  type FirmMemoryUnit,
} from "@/lib/ai/firm-memory/build-text";
import { getMatterById, listMatters } from "@/lib/repos/matters";
import { listMatterEvents } from "@/lib/repos/timeline";
import { listDocumentsForMatter } from "@/lib/repos/documents";

export type FirmMemoryEmbedStep = {
  ownerType: string;
  ownerId: string;
  status: "embedded" | "skipped" | "failed";
  errorCode?: string;
};

export type FirmMemoryReindexResult = {
  matterId: string;
  modelName: string;
  attempted: number;
  embedded: number;
  failed: number;
  deletedBefore: number;
  progress: FirmMemoryEmbedStep[];
  errorCode?: string;
  message?: string;
};

export type FirmMemoryReindexAllResult = {
  modelName: string;
  mattersAttempted: number;
  mattersOk: number;
  attempted: number;
  embedded: number;
  failed: number;
  results: FirmMemoryReindexResult[];
  errorCode?: string;
  message?: string;
};

async function collectMatterUnits(
  firmId: string,
  matterId: string,
): Promise<FirmMemoryUnit[]> {
  const matter = await getMatterById(firmId, matterId);
  if (!matter) return [];

  const units: FirmMemoryUnit[] = [
    {
      ownerType: "matter_summary",
      ownerId: matter.id,
      matterId: matter.id,
      citationLabel: `Matter: ${matter.matterNumber ?? matter.title}`,
      title: matter.title,
      text: composeMatterSummaryText({
        title: matter.title,
        description: matter.description,
        areaOfLaw: matter.areaOfLaw,
        status: matter.status,
        matterNumber: matter.matterNumber,
        fileRef: matter.fileRef,
        courtName: matter.courtName,
        caseNumber: matter.caseNumber,
        priority: matter.priority,
        clientDisplayName: matter.clientDisplayName,
      }),
    },
  ];

  const events = await listMatterEvents(firmId, matterId, { sortDir: "desc" });
  for (const event of events) {
    const text = composeMatterNoteText({
      title: event.title,
      body: event.body,
      eventType: event.eventType,
      eventAt: event.eventAt,
    });
    if (!text.trim()) continue;
    units.push({
      ownerType: "matter_note",
      ownerId: event.id,
      matterId,
      citationLabel: `Note: ${event.title}`,
      title: event.title,
      text,
    });
  }

  const docs = await listDocumentsForMatter(firmId, matterId);
  for (const doc of docs) {
    units.push({
      ownerType: "document",
      ownerId: doc.id,
      matterId,
      citationLabel: `Document: ${doc.title}`,
      title: doc.title,
      text: composeDocumentMetaText({
        title: doc.title,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        docType: doc.docType,
        sizeBytes: doc.sizeBytes,
      }),
    });
  }

  return units;
}

/** Delete firm-scoped embeddings belonging to a matter (summary + its notes/docs). */
export async function deleteFirmMemoryForMatter(firmId: string, matterId: string) {
  const db = getDb();

  const noteIds = (
    await db
      .select({ id: matterEvents.id })
      .from(matterEvents)
      .where(and(eq(matterEvents.firmId, firmId), eq(matterEvents.matterId, matterId)))
  ).map((r) => r.id);

  const docIds = (
    await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.firmId, firmId), eq(documents.matterId, matterId)))
  ).map((r) => r.id);

  let deleted = 0;

  const summaryDeleted = await db
    .delete(aiEmbeddings)
    .where(
      and(
        eq(aiEmbeddings.firmId, firmId),
        eq(aiEmbeddings.ownerType, "matter_summary"),
        eq(aiEmbeddings.ownerId, matterId),
      ),
    )
    .returning({ id: aiEmbeddings.id });
  deleted += summaryDeleted.length;

  if (noteIds.length > 0) {
    const noteDeleted = await db
      .delete(aiEmbeddings)
      .where(
        and(
          eq(aiEmbeddings.firmId, firmId),
          eq(aiEmbeddings.ownerType, "matter_note"),
          inArray(aiEmbeddings.ownerId, noteIds),
        ),
      )
      .returning({ id: aiEmbeddings.id });
    deleted += noteDeleted.length;
  }

  if (docIds.length > 0) {
    const docDeleted = await db
      .delete(aiEmbeddings)
      .where(
        and(
          eq(aiEmbeddings.firmId, firmId),
          eq(aiEmbeddings.ownerType, "document"),
          inArray(aiEmbeddings.ownerId, docIds),
        ),
      )
      .returning({ id: aiEmbeddings.id });
    deleted += docDeleted.length;
  }

  return deleted;
}

/**
 * Re-index one matter into firm-scoped ai_embeddings.
 * Always sets firm_id. Only embeds snippets (summary / notes / doc metadata).
 */
export async function firmMemoryReindexMatter(input: {
  firmId: string;
  matterId: string;
  modelName?: string;
}): Promise<FirmMemoryReindexResult> {
  const matter = await getMatterById(input.firmId, input.matterId);
  if (!matter) {
    return {
      matterId: input.matterId,
      modelName: input.modelName ?? GEMINI_EMBEDDINGS_MODEL_ID,
      attempted: 0,
      embedded: 0,
      failed: 0,
      deletedBefore: 0,
      progress: [],
      errorCode: "matter_not_found",
      message: "Matter not found.",
    };
  }

  let provider;
  try {
    provider = await getProvider(input.firmId);
  } catch (err) {
    const code = err instanceof AiProviderError ? err.code : "provider_error";
    return {
      matterId: input.matterId,
      modelName: input.modelName ?? GEMINI_EMBEDDINGS_MODEL_ID,
      attempted: 0,
      embedded: 0,
      failed: 0,
      deletedBefore: 0,
      progress: [],
      errorCode: code,
      message: err instanceof Error ? err.message : "Could not resolve AI provider.",
    };
  }

  const modelName = input.modelName?.trim() || provider.defaultEmbeddingsModel;
  const deletedBefore = await deleteFirmMemoryForMatter(input.firmId, input.matterId);
  const units = await collectMatterUnits(input.firmId, input.matterId);

  const db = getDb();
  const progress: FirmMemoryEmbedStep[] = [];
  let embedded = 0;
  let failed = 0;

  for (const unit of units) {
    try {
      const result = await provider.embed(unit.text, { model: modelName });
      await db
        .insert(aiEmbeddings)
        .values({
          ownerType: unit.ownerType,
          ownerId: unit.ownerId,
          firmId: input.firmId,
          embedding: result.embedding,
          modelName: result.model,
        })
        .onConflictDoUpdate({
          target: [aiEmbeddings.ownerType, aiEmbeddings.ownerId, aiEmbeddings.modelName],
          set: {
            embedding: result.embedding,
            firmId: input.firmId,
            createdAt: new Date(),
          },
        });
      embedded += 1;
      progress.push({
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        status: "embedded",
      });
    } catch (err) {
      failed += 1;
      const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
      progress.push({
        ownerType: unit.ownerType,
        ownerId: unit.ownerId,
        status: "failed",
        errorCode,
      });
      if (errorCode === "missing_key" || errorCode === "invalid_key") {
        return {
          matterId: input.matterId,
          modelName,
          attempted: units.length,
          embedded,
          failed,
          deletedBefore,
          progress,
          errorCode,
          message: err instanceof Error ? err.message : "Embedding failed.",
        };
      }
    }
  }

  return {
    matterId: input.matterId,
    modelName,
    attempted: units.length,
    embedded,
    failed,
    deletedBefore,
    progress,
    errorCode: failed > 0 ? "partial_failure" : undefined,
    message:
      failed > 0
        ? `Embedded ${embedded}/${units.length} firm-memory units; ${failed} failed.`
        : `Embedded ${embedded} firm-memory units for matter.`,
  };
}

/** Re-index all firm matters (Managing Partner / manage_settings). */
export async function firmMemoryReindexAll(input: {
  firmId: string;
  modelName?: string;
}): Promise<FirmMemoryReindexAllResult> {
  const rows = await listMatters(input.firmId, { bucket: "all", viewAll: true });
  const results: FirmMemoryReindexResult[] = [];
  let attempted = 0;
  let embedded = 0;
  let failed = 0;
  let mattersOk = 0;
  let modelName = input.modelName ?? GEMINI_EMBEDDINGS_MODEL_ID;
  let stopCode: string | undefined;

  for (const matter of rows) {
    const result = await firmMemoryReindexMatter({
      firmId: input.firmId,
      matterId: matter.id,
      modelName: input.modelName,
    });
    modelName = result.modelName;
    results.push(result);
    attempted += result.attempted;
    embedded += result.embedded;
    failed += result.failed;
    if (!result.errorCode || result.errorCode === "partial_failure") mattersOk += 1;
    if (result.errorCode === "missing_key" || result.errorCode === "invalid_key") {
      stopCode = result.errorCode;
      break;
    }
  }

  return {
    modelName,
    mattersAttempted: results.length,
    mattersOk,
    attempted,
    embedded,
    failed,
    results,
    errorCode: stopCode ?? (failed > 0 ? "partial_failure" : undefined),
    message: stopCode
      ? `Stopped after key error. Embedded ${embedded} units across ${results.length} matters.`
      : `Embedded ${embedded} units across ${results.length} matters.`,
  };
}

export async function countFirmMemoryEmbeddings(firmId: string, modelName?: string) {
  const db = getDb();
  const conditions = [
    eq(aiEmbeddings.firmId, firmId),
    inArray(aiEmbeddings.ownerType, ["matter_summary", "matter_note", "document"]),
  ];
  if (modelName) conditions.push(eq(aiEmbeddings.modelName, modelName));

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiEmbeddings)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function getFirmMemoryStats(firmId: string) {
  const db = getDb();
  const embeddingCount = await countFirmMemoryEmbeddings(firmId);
  const [matterCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matters)
    .where(eq(matters.firmId, firmId));
  const [summaryCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiEmbeddings)
    .where(
      and(eq(aiEmbeddings.firmId, firmId), eq(aiEmbeddings.ownerType, "matter_summary")),
    );

  return {
    firmId,
    matterCount: matterCountRow?.count ?? 0,
    embeddingCount,
    mattersIndexed: summaryCountRow?.count ?? 0,
    embeddingsReady: embeddingCount > 0,
  };
}
