import "server-only";

import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiEmbeddings, documents, matterEvents } from "@/lib/db/schema";
import { AiProviderError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/providers";
import { GEMINI_EMBEDDINGS_MODEL_ID } from "@/lib/ai/types";
import type { AiCitation } from "@/lib/db/ai-types";
import {
  composeDocumentMetaText,
  composeMatterNoteText,
  composeMatterSummaryText,
} from "@/lib/ai/firm-memory/build-text";
import {
  RAG_DEFAULT_CANDIDATE_K,
  RAG_DEFAULT_TOP_K,
  RAG_MIN_SIMILARITY,
} from "@/lib/ai/rag/retrieve";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";

export type FirmMemoryHit = {
  ownerType: "matter_summary" | "matter_note" | "document";
  ownerId: string;
  matterId: string;
  score: number;
  text: string;
  citationLabel: string;
  title: string;
};

export type FirmMemoryRetrievalMeta = {
  query: string;
  matterId: string;
  embeddingsModel: string;
  topK: number;
  candidateK: number;
  minSimilarity: number;
  candidateCount: number;
  hitCount: number;
  empty: boolean;
  emptyReason: string | null;
  latencyMs: number;
  errorCode?: string;
};

export type RetrieveFirmContextResult = {
  hits: FirmMemoryHit[];
  citations: AiCitation[];
  retrievalMeta: FirmMemoryRetrievalMeta;
};

function excerpt(text: string, max = 180): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Retrieve firm-memory snippets for ONE matter only.
 * Enforces firm_id + userCanAccessMatter. Never returns other matters' text.
 * Only retrieved snippets are returned (never whole DB).
 */
export async function retrieveFirmContext(input: {
  firmId: string;
  userId: string;
  viewAllMatters: boolean;
  matterId: string;
  query: string;
  topK?: number;
  candidateK?: number;
  minSimilarity?: number;
}): Promise<RetrieveFirmContextResult> {
  const started = Date.now();
  const query = input.query.trim();
  const topK = input.topK ?? RAG_DEFAULT_TOP_K;
  const candidateK = Math.max(topK, input.candidateK ?? RAG_DEFAULT_CANDIDATE_K);
  const minSimilarity = input.minSimilarity ?? RAG_MIN_SIMILARITY;

  const baseMeta: FirmMemoryRetrievalMeta = {
    query,
    matterId: input.matterId,
    embeddingsModel: GEMINI_EMBEDDINGS_MODEL_ID,
    topK,
    candidateK,
    minSimilarity,
    candidateCount: 0,
    hitCount: 0,
    empty: true,
    emptyReason: null,
    latencyMs: 0,
  };

  const allowed = await userCanAccessMatter(
    input.firmId,
    input.matterId,
    input.userId,
    input.viewAllMatters,
  );
  if (!allowed) {
    return {
      hits: [],
      citations: [],
      retrievalMeta: {
        ...baseMeta,
        emptyReason: "matter_forbidden",
        errorCode: "forbidden",
        latencyMs: Date.now() - started,
      },
    };
  }

  if (!query) {
    return {
      hits: [],
      citations: [],
      retrievalMeta: {
        ...baseMeta,
        emptyReason: "empty_query",
        latencyMs: Date.now() - started,
      },
    };
  }

  let provider;
  try {
    provider = await getProvider(input.firmId);
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    return {
      hits: [],
      citations: [],
      retrievalMeta: {
        ...baseMeta,
        emptyReason: "provider_error",
        errorCode,
        latencyMs: Date.now() - started,
      },
    };
  }

  const embeddingsModel = provider.defaultEmbeddingsModel || GEMINI_EMBEDDINGS_MODEL_ID;
  baseMeta.embeddingsModel = embeddingsModel;

  let queryEmbedding: number[];
  try {
    const embedded = await provider.embed(query, { model: embeddingsModel });
    queryEmbedding = embedded.embedding;
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    return {
      hits: [],
      citations: [],
      retrievalMeta: {
        ...baseMeta,
        emptyReason: "embed_failed",
        errorCode,
        latencyMs: Date.now() - started,
      },
    };
  }

  const db = getDb();
  const distance = cosineDistance(aiEmbeddings.embedding, queryEmbedding);
  const similarity = sql<number>`(1 - (${distance}))`;

  const matter = await getMatterById(input.firmId, input.matterId);
  if (!matter) {
    return {
      hits: [],
      citations: [],
      retrievalMeta: {
        ...baseMeta,
        emptyReason: "matter_not_found",
        errorCode: "not_found",
        latencyMs: Date.now() - started,
      },
    };
  }

  const summaryRows = await db
    .select({
      ownerId: aiEmbeddings.ownerId,
      score: similarity,
    })
    .from(aiEmbeddings)
    .where(
      and(
        eq(aiEmbeddings.firmId, input.firmId),
        eq(aiEmbeddings.modelName, embeddingsModel),
        eq(aiEmbeddings.ownerType, "matter_summary"),
        eq(aiEmbeddings.ownerId, input.matterId),
      ),
    )
    .orderBy(desc(similarity))
    .limit(1);

  const noteRows = await db
    .select({
      ownerId: matterEvents.id,
      title: matterEvents.title,
      body: matterEvents.body,
      eventType: matterEvents.eventType,
      eventAt: matterEvents.eventAt,
      score: similarity,
    })
    .from(aiEmbeddings)
    .innerJoin(
      matterEvents,
      and(
        eq(matterEvents.id, aiEmbeddings.ownerId),
        eq(aiEmbeddings.ownerType, "matter_note"),
        eq(matterEvents.firmId, input.firmId),
        eq(matterEvents.matterId, input.matterId),
      ),
    )
    .where(
      and(
        eq(aiEmbeddings.firmId, input.firmId),
        eq(aiEmbeddings.modelName, embeddingsModel),
        eq(aiEmbeddings.ownerType, "matter_note"),
      ),
    )
    .orderBy(desc(similarity))
    .limit(candidateK);

  const docRows = await db
    .select({
      ownerId: documents.id,
      title: documents.title,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      docType: documents.docType,
      sizeBytes: documents.sizeBytes,
      score: similarity,
    })
    .from(aiEmbeddings)
    .innerJoin(
      documents,
      and(
        eq(documents.id, aiEmbeddings.ownerId),
        eq(aiEmbeddings.ownerType, "document"),
        eq(documents.firmId, input.firmId),
        eq(documents.matterId, input.matterId),
      ),
    )
    .where(
      and(
        eq(aiEmbeddings.firmId, input.firmId),
        eq(aiEmbeddings.modelName, embeddingsModel),
        eq(aiEmbeddings.ownerType, "document"),
      ),
    )
    .orderBy(desc(similarity))
    .limit(candidateK);

  const candidates: FirmMemoryHit[] = [];

  for (const row of summaryRows) {
    const text = composeMatterSummaryText({
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
    });
    candidates.push({
      ownerType: "matter_summary",
      ownerId: row.ownerId,
      matterId: input.matterId,
      score: Number(row.score),
      text,
      citationLabel: `Matter: ${matter.matterNumber ?? matter.title}`,
      title: matter.title,
    });
  }

  for (const row of noteRows) {
    const text = composeMatterNoteText({
      title: row.title,
      body: row.body,
      eventType: row.eventType,
      eventAt: row.eventAt,
    });
    candidates.push({
      ownerType: "matter_note",
      ownerId: row.ownerId,
      matterId: input.matterId,
      score: Number(row.score),
      text,
      citationLabel: `Note: ${row.title}`,
      title: row.title,
    });
  }

  for (const row of docRows) {
    const text = composeDocumentMetaText({
      title: row.title,
      fileName: row.fileName,
      mimeType: row.mimeType,
      docType: row.docType,
      sizeBytes: row.sizeBytes,
    });
    candidates.push({
      ownerType: "document",
      ownerId: row.ownerId,
      matterId: input.matterId,
      score: Number(row.score),
      text,
      citationLabel: `Document: ${row.title}`,
      title: row.title,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const candidateCount = candidates.length;
  const above = candidates.filter((c) => Number.isFinite(c.score) && c.score >= minSimilarity);
  const hits = above.slice(0, topK);

  const empty = hits.length === 0;
  let emptyReason: string | null = null;
  if (empty) {
    if (candidateCount === 0) emptyReason = "no_embeddings_or_no_matches";
    else emptyReason = "below_similarity_threshold";
  }

  const citations: AiCitation[] = hits.map((h) => ({
    sourceId: h.matterId,
    chunkId: h.ownerId,
    citationLabel: h.citationLabel,
    title: h.title,
    excerpt: excerpt(h.text),
    verified: true,
  }));

  return {
    hits,
    citations,
    retrievalMeta: {
      query,
      matterId: input.matterId,
      embeddingsModel,
      topK,
      candidateK,
      minSimilarity,
      candidateCount,
      hitCount: hits.length,
      empty,
      emptyReason,
      latencyMs: Date.now() - started,
    },
  };
}
