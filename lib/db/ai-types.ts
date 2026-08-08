/** Phase 2 AI domain types (P2-01). */

export type AiProviderCode = "gemini" | "claude" | "openai";

export type AiConversationMode = "legal_research" | "matter_assist" | "drafting";

export type AiMessageRole = "user" | "assistant" | "system";

export type KnowledgeSourceType =
  | "statute"
  | "constitution"
  | "rules"
  | "commentary"
  | "firm_doc"
  | "other";

export type AiEmbeddingOwnerType =
  | "knowledge_chunk"
  | "matter_summary"
  | "matter_note"
  | "document"
  | "other";

/** Firm-scoped embedding owners used by Matter Assist (P2-08). */
export const FIRM_MEMORY_OWNER_TYPES = [
  "matter_summary",
  "matter_note",
  "document",
] as const satisfies readonly AiEmbeddingOwnerType[];

export type AiCitation = {
  sourceId?: string;
  chunkId?: string;
  citationLabel: string;
  title?: string;
  excerpt?: string;
  sourceUrl?: string | null;
  verified?: boolean;
};

export type AiSettings = {
  firmId: string;
  providerDefault: AiProviderCode | string;
  modelDefault: string;
  embeddingsModel: string;
  webLookupEnabled: boolean;
  routingMode: "auto" | "manual" | string;
  monthlySoftBudget: number | null;
  maxOutputTokens: number;
  matterContextEnabled: boolean;
  updatedAt: Date;
};

export type AiConversation = {
  id: string;
  firmId: string;
  userId: string;
  mode: AiConversationMode | string;
  matterId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type AiMessage = {
  id: string;
  conversationId: string;
  firmId: string;
  role: AiMessageRole | string;
  content: string;
  confidence: number | null;
  citationsJson: AiCitation[] | unknown[];
  retrievalMetaJson: Record<string, unknown>;
  createdAt: Date;
};

export type KnowledgeSource = {
  id: string;
  firmId: string | null;
  title: string;
  sourceType: KnowledgeSourceType | string;
  citationLabel: string;
  jurisdiction: string;
  publisher: string | null;
  sourceUrl: string | null;
  licenseNote: string | null;
  versionLabel: string | null;
  effectiveDate: string | null;
  ingestedAt: Date | null;
  contentHash: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type KnowledgeChunk = {
  id: string;
  sourceId: string;
  firmId: string | null;
  chunkIndex: number;
  headingPath: string | null;
  text: string;
  tokenEstimate: number | null;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};
