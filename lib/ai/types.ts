import "server-only";

/** Exact Gemini model IDs used in Phase 2 (P2-03). */
export const GEMINI_CHAT_MODEL_ID = "gemini-3.6-flash";
export const GEMINI_EMBEDDINGS_MODEL_ID = "gemini-embedding-001";

export const CLAUDE_CHAT_MODEL_ID = "claude-sonnet-4-5";
export const OPENAI_CHAT_MODEL_ID = "gpt-4.1";
/** Requested at 768 dims to match ai_embeddings vector(768). */
export const OPENAI_EMBEDDINGS_MODEL_ID = "text-embedding-3-small";

/** Re-export aliases used by settings defaults. */
export const DEFAULT_GEMINI_CHAT_MODEL = GEMINI_CHAT_MODEL_ID;
export const DEFAULT_GEMINI_EMBEDDINGS_MODEL = GEMINI_EMBEDDINGS_MODEL_ID;

export type LlmProviderId = "gemini" | "claude" | "openai";

export const DEFAULT_MODELS: Record<
  LlmProviderId,
  { chat: string; embeddings: string }
> = {
  gemini: { chat: GEMINI_CHAT_MODEL_ID, embeddings: GEMINI_EMBEDDINGS_MODEL_ID },
  claude: { chat: CLAUDE_CHAT_MODEL_ID, embeddings: GEMINI_EMBEDDINGS_MODEL_ID },
  openai: { chat: OPENAI_CHAT_MODEL_ID, embeddings: OPENAI_EMBEDDINGS_MODEL_ID },
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * OpenAI escalation start tier (quiet): budget = cheapest (gpt-4o-mini),
   * standard = gpt-4.1-mini, capable = gpt-4.1, max = gpt-5. On failure the
   * provider escalates up the ladder automatically.
   */
  quality?: "budget" | "standard" | "capable" | "max";
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
  /** True when chat provider has no native embed and Gemini fallback was used. */
  fallbackProvider?: LlmProviderId;
};

export type LlmProvider = {
  id: LlmProviderId;
  defaultChatModel: string;
  defaultEmbeddingsModel: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  embed(text: string, opts?: EmbedOptions): Promise<EmbedResult>;
};
