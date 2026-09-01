import "server-only";

import {
  InvalidKeyError,
  MissingKeyError,
  NetworkError,
  ProviderError,
  RateLimitedError,
} from "@/lib/ai/errors";
import { withAiRetry } from "@/lib/ai/retry";
import { getAnthropicWorkspaceId } from "@/lib/ai/secrets";
import {
  CLAUDE_CHAT_MODEL_ID,
  GEMINI_EMBEDDINGS_MODEL_ID,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type EmbedOptions,
  type EmbedResult,
  type LlmProvider,
} from "@/lib/ai/types";

function mapHttpError(status: number, detail: string): never {
  const lower = detail.toLowerCase();
  if (status === 401 || status === 403) throw new InvalidKeyError(detail);
  if (status === 429) throw new RateLimitedError();
  if (lower.includes("anthropic-workspace-id is required")) {
    throw new ProviderError(
      "Anthropic key needs ANTHROPIC_WORKSPACE_ID (wrkspc_…) in server env, or use a single-workspace API key from console.anthropic.com.",
      status,
    );
  }
  throw new ProviderError(detail, status);
}

async function readAnthropicError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; type?: string };
    };
    const msg = body.error?.message?.trim();
    if (msg) return msg;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Anthropic Messages API (chat). Embeddings: Claude has no embed API;
 * callers should pass embedFallback (typically Gemini) via createClaudeProvider.
 */
export function createClaudeProvider(opts?: {
  apiKey?: string | null;
  chatModel?: string;
  embedFallback?: LlmProvider | null;
}): LlmProvider {
  const defaultChatModel = opts?.chatModel?.trim() || CLAUDE_CHAT_MODEL_ID;
  const embedFallback = opts?.embedFallback ?? null;

  function requireKey(): string {
    const key = opts?.apiKey?.trim();
    if (!key) {
      throw new MissingKeyError(
        "ANTHROPIC_API_KEY is not set (server env or firm BYO).",
      );
    }
    return key;
  }

  return {
    id: "claude",
    defaultChatModel,
    defaultEmbeddingsModel: embedFallback?.defaultEmbeddingsModel || GEMINI_EMBEDDINGS_MODEL_ID,

    async chat(messages: ChatMessage[], chatOpts?: ChatOptions): Promise<ChatResult> {
      return withAiRetry(async () => {
        const started = Date.now();
        const key = requireKey();
        const model = chatOpts?.model?.trim() || defaultChatModel;

        const system = messages
          .filter((m) => m.role === "system")
          .map((m) => m.content.trim())
          .filter(Boolean)
          .join("\n\n");
        const apiMessages = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        if (apiMessages.length === 0) {
          throw new ProviderError("At least one user/assistant message is required.");
        }

        const workspaceId = getAnthropicWorkspaceId();
        let res: Response;
        try {
          res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
            },
            body: JSON.stringify({
              model,
              max_tokens: chatOpts?.maxOutputTokens ?? 1024,
              temperature: chatOpts?.temperature ?? 0.2,
              ...(system ? { system } : {}),
              messages: apiMessages,
            }),
          });
        } catch {
          throw new NetworkError();
        }

        if (!res.ok) {
          const detail = await readAnthropicError(
            res,
            `Claude chat failed (HTTP ${res.status}).`,
          );
          mapHttpError(res.status, detail);
        }

        const body = (await res.json()) as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const text =
          body.content
            ?.filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("")
            .trim() ?? "";

        if (!text) {
          throw new ProviderError("Claude returned an empty chat response.");
        }

        return {
          text,
          model,
          provider: "claude",
          latencyMs: Date.now() - started,
        };
      });
    },

    async embed(text: string, embedOpts?: EmbedOptions): Promise<EmbedResult> {
      if (!embedFallback) {
        throw new MissingKeyError(
          "Claude has no embeddings API. Configure Gemini for embeddings (fallback).",
        );
      }
      const result = await embedFallback.embed(text, embedOpts);
      return {
        ...result,
        fallbackProvider: result.provider,
      };
    },
  };
}
