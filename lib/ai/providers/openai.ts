import "server-only";

import { AI_EMBEDDING_DIMENSIONS } from "@/lib/db/schema";
import {
  InvalidKeyError,
  MissingKeyError,
  NetworkError,
  ProviderError,
  RateLimitedError,
} from "@/lib/ai/errors";
import { withAiRetry } from "@/lib/ai/retry";
import {
  OPENAI_CHAT_MODEL_ID,
  OPENAI_EMBEDDINGS_MODEL_ID,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type EmbedOptions,
  type EmbedResult,
  type LlmProvider,
} from "@/lib/ai/types";

function mapHttpError(status: number, fallback: string): never {
  if (status === 401 || status === 403) throw new InvalidKeyError();
  if (status === 429) throw new RateLimitedError();
  throw new ProviderError(fallback, status);
}

export function createOpenAiProvider(opts?: {
  apiKey?: string | null;
  chatModel?: string;
  embeddingsModel?: string;
}): LlmProvider {
  const defaultChatModel = opts?.chatModel?.trim() || OPENAI_CHAT_MODEL_ID;
  const defaultEmbeddingsModel =
    opts?.embeddingsModel?.trim() || OPENAI_EMBEDDINGS_MODEL_ID;

  function requireKey(): string {
    const key = opts?.apiKey?.trim();
    if (!key) {
      throw new MissingKeyError(
        "OPENAI_API_KEY is not set (server env or firm BYO).",
      );
    }
    return key;
  }

  return {
    id: "openai",
    defaultChatModel,
    defaultEmbeddingsModel,

    async chat(messages: ChatMessage[], chatOpts?: ChatOptions): Promise<ChatResult> {
      return withAiRetry(async () => {
        const started = Date.now();
        const key = requireKey();
        const model = chatOpts?.model?.trim() || defaultChatModel;

        const apiMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        if (!apiMessages.some((m) => m.role === "user")) {
          throw new ProviderError("At least one user message is required.");
        }

        let res: Response;
        try {
          res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              temperature: chatOpts?.temperature ?? 0.2,
              max_tokens: chatOpts?.maxOutputTokens ?? 1024,
            }),
          });
        } catch {
          throw new NetworkError();
        }

        if (!res.ok) {
          mapHttpError(res.status, `OpenAI chat failed (HTTP ${res.status}).`);
        }

        const body = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = body.choices?.[0]?.message?.content?.trim() ?? "";
        if (!text) {
          throw new ProviderError("OpenAI returned an empty chat response.");
        }

        return {
          text,
          model,
          provider: "openai",
          latencyMs: Date.now() - started,
        };
      });
    },

    async embed(text: string, embedOpts?: EmbedOptions): Promise<EmbedResult> {
      return withAiRetry(async () => {
        const started = Date.now();
        const key = requireKey();
        const model = embedOpts?.model?.trim() || defaultEmbeddingsModel;
        const input = text.trim();
        if (!input) {
          throw new ProviderError("Embedding text must not be empty.");
        }

        let res: Response;
        try {
          res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model,
              input,
              // Match LexZim pgvector column ai_embeddings.embedding vector(768)
              dimensions: AI_EMBEDDING_DIMENSIONS,
            }),
          });
        } catch {
          throw new NetworkError();
        }

        if (!res.ok) {
          mapHttpError(res.status, `OpenAI embed failed (HTTP ${res.status}).`);
        }

        const body = (await res.json()) as {
          data?: Array<{ embedding?: number[] }>;
        };
        const embedding = body.data?.[0]?.embedding ?? [];
        if (embedding.length === 0) {
          throw new ProviderError("OpenAI returned an empty embedding.");
        }

        return {
          embedding,
          model,
          provider: "openai",
          dimensions: embedding.length || AI_EMBEDDING_DIMENSIONS,
          latencyMs: Date.now() - started,
        };
      });
    },
  };
}
