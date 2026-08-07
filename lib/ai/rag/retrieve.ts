import "server-only";

import { and, cosineDistance, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiEmbeddings, knowledgeChunks, knowledgeSources } from "@/lib/db/schema";
import { AiProviderError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/providers";
import { GEMINI_EMBEDDINGS_MODEL_ID } from "@/lib/ai/types";
import type { AiCitation } from "@/lib/db/ai-types";

export const RAG_DEFAULT_TOP_K = 6;
export const RAG_DEFAULT_CANDIDATE_K = 12;
/** Cosine similarity threshold (1 - distance). Below this → empty hits. */
export const RAG_MIN_SIMILARITY = 0.42;

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  score: number;
  headingPath: string | null;
  text: string;
  citationLabel: string;
  title: string;
  sourceUrl: string | null;
  sourceType: string;
  publisher: string | null;
};

export type RetrievalMeta = {
  query: string;
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

export type RetrieveLegalContextResult = {
  hits: RetrievedChunk[];
  citations: AiCitation[];
  retrievalMeta: RetrievalMeta;
  /** Present for Managing Partner diagnostics only. */
  diagnostic?: {
    candidates: Array<{
      chunkId: string;
      sourceId: string;
      score: number;
      title: string;
      headingPath: string | null;
      excerpt: string;
      aboveThreshold: boolean;
    }>;
  };
};

function excerpt(text: string, max = 180): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * RAG retrieve: embed query → pgvector cosine search → threshold filter → dedupe by source.
 * Returns EMPTY hits (no filler) when nothing clears the similarity threshold.
 */
export async function retrieveLegalContext(input: {
  firmIdForProvider: string;
  query: string;
  topK?: number;
  candidateK?: number;
  minSimilarity?: number;
  includeDiagnostic?: boolean;
}): Promise<RetrieveLegalContextResult> {
  const started = Date.now();
  const query = input.query.trim();
  const topK = input.topK ?? RAG_DEFAULT_TOP_K;
  const candidateK = Math.max(topK, input.candidateK ?? RAG_DEFAULT_CANDIDATE_K);
  const minSimilarity = input.minSimilarity ?? RAG_MIN_SIMILARITY;

  const baseMeta = {
    query,
    embeddingsModel: GEMINI_EMBEDDINGS_MODEL_ID,
    topK,
    candidateK,
    minSimilarity,
    candidateCount: 0,
    hitCount: 0,
    empty: true,
    emptyReason: null as string | null,
    latencyMs: 0,
  };

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
    provider = await getProvider(input.firmIdForProvider);
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

  const rows = await db
    .select({
      chunkId: knowledgeChunks.id,
      sourceId: knowledgeChunks.sourceId,
      headingPath: knowledgeChunks.headingPath,
      text: knowledgeChunks.text,
      score: similarity,
      title: knowledgeSources.title,
      citationLabel: knowledgeSources.citationLabel,
      sourceUrl: knowledgeSources.sourceUrl,
      sourceType: knowledgeSources.sourceType,
      publisher: knowledgeSources.publisher,
    })
    .from(aiEmbeddings)
    .innerJoin(
      knowledgeChunks,
      and(
        eq(knowledgeChunks.id, aiEmbeddings.ownerId),
        eq(aiEmbeddings.ownerType, "knowledge_chunk"),
      ),
    )
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeChunks.sourceId))
    .where(
      and(
        eq(aiEmbeddings.modelName, embeddingsModel),
        isNull(aiEmbeddings.firmId),
        isNull(knowledgeChunks.firmId),
        eq(knowledgeSources.isActive, true),
      ),
    )
    .orderBy(desc(similarity))
    .limit(candidateK);

  const candidates = rows.map((row) => ({
    chunkId: row.chunkId,
    sourceId: row.sourceId,
    score: Number(row.score),
    headingPath: row.headingPath,
    text: row.text,
    citationLabel: row.citationLabel,
    title: row.title,
    sourceUrl: row.sourceUrl,
    sourceType: row.sourceType,
    publisher: row.publisher,
  }));

  const above = candidates.filter((c) => Number.isFinite(c.score) && c.score >= minSimilarity);

  // Dedupe by source: keep highest-scoring chunk per source, then take topK.
  const bestBySource = new Map<string, RetrievedChunk>();
  for (const hit of above) {
    const prev = bestBySource.get(hit.sourceId);
    if (!prev || hit.score > prev.score) {
      bestBySource.set(hit.sourceId, hit);
    }
  }
  const hits = [...bestBySource.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const empty = hits.length === 0;
  let emptyReason: string | null = null;
  if (empty) {
    if (candidates.length === 0) emptyReason = "no_embeddings_or_no_matches";
    else emptyReason = "below_similarity_threshold";
  }

  const citations: AiCitation[] = hits.map((h) => ({
    sourceId: h.sourceId,
    chunkId: h.chunkId,
    citationLabel: h.citationLabel,
    title: h.title,
    excerpt: excerpt(h.text),
    sourceUrl: h.sourceUrl,
    verified: true,
  }));

  const result: RetrieveLegalContextResult = {
    hits,
    citations,
    retrievalMeta: {
      query,
      embeddingsModel,
      topK,
      candidateK,
      minSimilarity,
      candidateCount: candidates.length,
      hitCount: hits.length,
      empty,
      emptyReason,
      latencyMs: Date.now() - started,
    },
  };

  if (input.includeDiagnostic) {
    result.diagnostic = {
      candidates: candidates.map((c) => ({
        chunkId: c.chunkId,
        sourceId: c.sourceId,
        score: c.score,
        title: c.title,
        headingPath: c.headingPath,
        excerpt: excerpt(c.text, 140),
        aboveThreshold: c.score >= minSimilarity,
      })),
    };
  }

  return result;
}
