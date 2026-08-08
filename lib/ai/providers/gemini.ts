import "server-only";

import { AI_EMBEDDING_DIMENSIONS } from "@/lib/db/schema";
import {
  InvalidKeyError,
  MissingKeyError,
  NetworkError,
  ProviderError,
  RateLimitedError,
} from "@/lib/ai/errors";
import { getGeminiApiKey } from "@/lib/ai/secrets";
import { withAiRetry } from "@/lib/ai/retry";
import {
  GEMINI_CHAT_MODEL_ID,
  GEMINI_EMBEDDINGS_MODEL_ID,
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

function toGeminiContents(messages: ChatMessage[]) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean);
  const systemInstruction =
    systemParts.length > 0
      ? { parts: [{ text: systemParts.join("\n\n") }] }
      : undefined;

  const contents = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  return { systemInstruction, contents };
}

export function createGeminiProvider(opts?: {
  apiKey?: string | null;
  chatModel?: string;
  embeddingsModel?: string;
}): LlmProvider {
  const defaultChatModel = opts?.chatModel?.trim() || GEMINI_CHAT_MODEL_ID;
  const defaultEmbeddingsModel =
    opts?.embeddingsModel?.trim() || GEMINI_EMBEDDINGS_MODEL_ID;

  function requireKey(): string {
    const key = opts?.apiKey?.trim() || getGeminiApiKey();
    if (!key) throw new MissingKeyError("GEMINI_API_KEY is not set on the server.");
    return key;
  }

  return {
    id: "gemini",
    defaultChatModel,
    defaultEmbeddingsModel,

    async chat(messages: ChatMessage[], chatOpts?: ChatOptions): Promise<ChatResult> {
      return withAiRetry(async () => {
        const started = Date.now();
        const key = requireKey();
        const model = chatOpts?.model?.trim() || defaultChatModel;
        const { systemInstruction, contents } = toGeminiContents(messages);

        if (contents.length === 0) {
          throw new ProviderError("At least one user/assistant message is required.");
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(systemInstruction ? { systemInstruction } : {}),
              contents,
              generationConfig: {
                temperature: chatOpts?.temperature ?? 0.2,
                maxOutputTokens: chatOpts?.maxOutputTokens ?? 1024,
              },
            }),
          });
        } catch {
          throw new NetworkError();
        }

        if (!res.ok) {
          mapHttpError(res.status, `Gemini chat failed (HTTP ${res.status}).`);
        }

        const body = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text =
          body.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("")
            .trim() ?? "";

        if (!text) {
          throw new ProviderError("Gemini returned an empty chat response.");
        }

        return {
          text,
          model,
          provider: "gemini",
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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(key)}`;

        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: `models/${model}`,
              content: { parts: [{ text: input }] },
            }),
          });
        } catch {
          throw new NetworkError();
        }

        if (!res.ok) {
          mapHttpError(res.status, `Gemini embed failed (HTTP ${res.status}).`);
        }

        const body = (await res.json()) as {
          embedding?: { values?: number[] };
        };
        const embedding = body.embedding?.values ?? [];
        if (embedding.length === 0) {
          throw new ProviderError("Gemini returned an empty embedding.");
        }

        return {
          embedding,
          model,
          provider: "gemini",
          dimensions: embedding.length || AI_EMBEDDING_DIMENSIONS,
          latencyMs: Date.now() - started,
        };
      });
    },
  };
}
