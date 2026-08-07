import "server-only";

/** Exact Gemini model IDs used in Phase 2 (P2-03). */
export const GEMINI_CHAT_MODEL_ID = "gemini-2.0-flash";
export const GEMINI_EMBEDDINGS_MODEL_ID = "text-embedding-004";

/** Re-export aliases used by settings defaults. */
export const DEFAULT_GEMINI_CHAT_MODEL = GEMINI_CHAT_MODEL_ID;
export const DEFAULT_GEMINI_EMBEDDINGS_MODEL = GEMINI_EMBEDDINGS_MODEL_ID;

export type LlmProviderId = "gemini" | "claude" | "openai";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type ChatResult = {
  text: string;
  model: string;
  provider: LlmProviderId;
  latencyMs: number;
};

export type EmbedOptions = {
  model?: string;
};

export type EmbedResult = {
  embedding: number[];
  model: string;
  provider: LlmProviderId;
  dimensions: number;
  latencyMs: number;
};

export type LlmProvider = {
  id: LlmProviderId;
  defaultChatModel: string;
  defaultEmbeddingsModel: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  embed(text: string, opts?: EmbedOptions): Promise<EmbedResult>;
};
