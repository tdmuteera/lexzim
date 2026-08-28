import "server-only";

import { AI_EMBEDDING_DIMENSIONS } from "@/lib/db/schema";
import {
  AiProviderError,
  InvalidKeyError,
  MissingKeyError,
  NetworkError,
  ProviderError,
  RateLimitedError,
} from "@/lib/ai/errors";
import {
  buildOpenAiChatCandidates,
  isNewSchemaModel,
  shouldTryNextOpenAiModel,
} from "@/lib/ai/providers/model-fallback";
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
  if (status === 401) throw new InvalidKeyError();
  if (status === 403 && /api key|unauthorized|authentication/i.test(fallback)) {
    throw new InvalidKeyError(fallback);
  }
  if (status === 429) throw new RateLimitedError();
  throw new ProviderError(fallback, status);
}

type ChatCompletionBody = {
  error?: { message?: string; code?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

async function chatOnce(input: {
  key: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens: number;
}): Promise<ChatResult> {
  const started = Date.now();
  // gpt-5* / o-series use the newer schema (max_completion_tokens, default temp only).
  const newSchema = isNewSchemaModel(input.model);
  const payload: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  };
  if (newSchema) {
    payload.max_completion_tokens = input.maxTokens;
  } else {
    payload.max_tokens = input.maxTokens;
    payload.temperature = input.temperature;
  }

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new NetworkError();
  }

  const body = (await res.json().catch(() => ({}))) as ChatCompletionBody;
  if (!res.ok) {
    const detail =
      body.error?.message?.trim() || `OpenAI chat failed (HTTP ${res.status}).`;
    if (
      res.status === 403 ||
      res.status === 404 ||
      body.error?.code === "model_not_found"
    ) {
      throw new ProviderError(detail, res.status);
    }
    mapHttpError(res.status, detail);
  }

  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new ProviderError("OpenAI returned an empty chat response.");
  }

  return {
    text,
    model: input.model,
    provider: "openai",
    latencyMs: Date.now() - started,
  };
}

export function createOpenAiProvider(opts?: {
  apiKey?: string | null;
  chatModel?: string;
  embeddingsModel?: string;
  /** When KB vectors are Gemini, route embed calls here. */
  embedFallback?: LlmProvider | null;
}): LlmProvider {
  const defaultChatModel = opts?.chatModel?.trim() || OPENAI_CHAT_MODEL_ID;
  const defaultEmbeddingsModel =
    opts?.embeddingsModel?.trim() || OPENAI_EMBEDDINGS_MODEL_ID;
  const embedFallback = opts?.embedFallback ?? null;

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
      const key = requireKey();
      const preferred = chatOpts?.model?.trim() || defaultChatModel;
      const candidates = buildOpenAiChatCandidates(
        preferred,
        chatOpts?.quality ?? "standard",
      );
      const apiMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      if (!apiMessages.some((m) => m.role === "user")) {
        throw new ProviderError("At least one user message is required.");
      }

      const temperature = chatOpts?.temperature ?? 0.2;
      const maxTokens = chatOpts?.maxOutputTokens ?? 4096;
      let lastError: unknown;

      for (const model of candidates) {
        try {
          return await withAiRetry(() =>
            chatOnce({
              key,
              model,
              messages: apiMessages,
              temperature,
              maxTokens,
            }),
          );
        } catch (err) {
          lastError = err;
          if (shouldTryNextOpenAiModel(err)) continue;
          throw err;
        }
      }

      if (lastError instanceof AiProviderError) throw lastError;
      throw new ProviderError(
        lastError instanceof Error
          ? lastError.message
          : "OpenAI chat failed on all fallback models.",
      );
    },

    async embed(text: string, embedOpts?: EmbedOptions): Promise<EmbedResult> {
      const model = embedOpts?.model?.trim() || defaultEmbeddingsModel;
      if (embedFallback && /gemini|embedding-001/i.test(model)) {
        return embedFallback.embed(text, {
          ...embedOpts,
          model: embedFallback.defaultEmbeddingsModel,
        });
      }
      return withAiRetry(async () => {
        const started = Date.now();
        const key = requireKey();
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
