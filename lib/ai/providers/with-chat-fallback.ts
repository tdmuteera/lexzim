import "server-only";

import { AiProviderError } from "@/lib/ai/errors";
import { isOpenAiModelUnavailableError } from "@/lib/ai/providers/model-fallback";
import type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  LlmProvider,
} from "@/lib/ai/types";

function shouldFallToNextProvider(err: unknown): boolean {
  if (isOpenAiModelUnavailableError(err)) return true;
  if (!(err instanceof AiProviderError)) return false;
  if (
    err.code === "rate_limited" ||
    err.code === "provider_error" ||
    err.code === "invalid_key" ||
    err.code === "missing_key" ||
    err.code === "network_error"
  ) {
    return true;
  }
  if (/empty chat response|all fallback models/i.test(err.message)) return true;
  return false;
}

/**
 * Prefer primary chat; on model/provider failure, try cheaper/other providers in order.
 * Embeddings stay on the primary (with its own embed fallback).
 */
export function withChatProviderFallback(
  primary: LlmProvider,
  fallbacks: LlmProvider[],
): LlmProvider {
  if (fallbacks.length === 0) return primary;

  return {
    id: primary.id,
    defaultChatModel: primary.defaultChatModel,
    defaultEmbeddingsModel: primary.defaultEmbeddingsModel,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
      let lastError: unknown;
      try {
        return await primary.chat(messages, opts);
      } catch (err) {
        lastError = err;
        if (!shouldFallToNextProvider(err)) throw err;
      }

      for (const next of fallbacks) {
        try {
          // Let each provider use its own default model (do not force primary model id).
          const { model: _ignored, ...rest } = opts ?? {};
          void _ignored;
          return await next.chat(messages, rest);
        } catch (err) {
          lastError = err;
          if (!shouldFallToNextProvider(err)) throw err;
        }
      }

      if (lastError instanceof Error) throw lastError;
      throw new AiProviderError(
        "provider_error",
        "All configured AI chat providers failed.",
      );
    },

    embed(text: string, opts?: EmbedOptions): Promise<EmbedResult> {
      return primary.embed(text, opts);
    },
  };
}
