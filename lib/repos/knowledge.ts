/**
 * Knowledge base repository stubs (P2-01).
 * System KB: firmId IS NULL. Firm sources: firmId = session firm.
 */
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { knowledgeChunks, knowledgeSources } from "@/lib/db/schema";

export async function listKnowledgeSources(opts?: {
  firmId?: string | null;
  includeSystem?: boolean;
  activeOnly?: boolean;
}) {
  const db = getDb();
  const conditions = [];
  if (opts?.activeOnly !== false) conditions.push(eq(knowledgeSources.isActive, true));

  if (opts?.firmId) {
    if (opts.includeSystem !== false) {
      conditions.push(
        or(isNull(knowledgeSources.firmId), eq(knowledgeSources.firmId, opts.firmId))!,
      );
    } else {
      conditions.push(eq(knowledgeSources.firmId, opts.firmId));
    }
  } else if (opts?.includeSystem !== false) {
    conditions.push(isNull(knowledgeSources.firmId));
  }

  return db
    .select()
    .from(knowledgeSources)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(knowledgeSources.title));
}

export async function listChunksForSource(sourceId: string) {
  const db = getDb();
  return db
    .select()
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.sourceId, sourceId))
    .orderBy(asc(knowledgeChunks.chunkIndex));
}

/** Embedding writes land in P2-05. */
export async function countKnowledgeStats(firmId?: string | null) {
  const sources = await listKnowledgeSources({
    firmId: firmId ?? undefined,
    includeSystem: true,
    activeOnly: true,
  });
  return { sourceCount: sources.length };
}

export {
  getKnowledgePackStats,
  ingestZimbabweStarterPack,
  kbReingestAll,
} from "@/lib/ai/kb/ingest-starter";
export type { StarterIngestResult, KbReingestAllResult } from "@/lib/ai/kb/ingest-starter";
export { embedSystemKnowledgeChunks } from "@/lib/ai/kb/embed-chunks";


