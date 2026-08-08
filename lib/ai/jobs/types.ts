/**
 * AI background job types (KB / firm memory). Stay on pgvector; no external vector SaaS.
 */
export const AI_JOB_TYPES = [
  "kb_reingest_all",
  "kb_embed",
  "firm_memory_reindex_all",
  "firm_memory_reindex_matter",
] as const;

export type AiJobType = (typeof AI_JOB_TYPES)[number];

export const AI_JOB_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

export function isAiJobType(raw: string): raw is AiJobType {
  return (AI_JOB_TYPES as readonly string[]).includes(raw);
}
