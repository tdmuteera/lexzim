import "server-only";

import { AiProviderError } from "@/lib/ai/errors";
import { createClaudeProvider } from "@/lib/ai/providers/claude";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenAiProvider } from "@/lib/ai/providers/openai";
import { resolveAiRoute } from "@/lib/ai/routing";
import { resolveProviderApiKey } from "@/lib/ai/secrets";
import {
  DEFAULT_MODELS,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type LlmProvider,
  type LlmProviderId,
} from "@/lib/ai/types";
import { getAiSettings } from "@/lib/repos/ai-settings";

const CHAT_FAILOVER_ORDER: LlmProviderId[] = ["claude", "openai", "gemini"];

export type ChatFailoverMeta = {
  intendedProvider: LlmProviderId;
  usedProvider: LlmProviderId;
  usedModel: string;
  failoverNotice: string | null;
};

function isBillingOrAuthFailover(err: unknown): boolean {
  if (!(err instanceof AiProviderError)) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    return /credit balance|billing|payment|too low to access/i.test(msg);
  }
  if (err.code === "invalid_key" || err.code === "missing_key") return true;
  if (err.code === "rate_limited") return true;
  const msg = err.message.toLowerCase();
  return (
    /credit balance|billing|payment|too low to access|anthropic-workspace-id/i.test(msg) ||
    err.httpStatus === 401 ||
    err.httpStatus === 403
  );
}

async function buildChatProvider(
  firmId: string,
  providerId: LlmProviderId,
): Promise<LlmProvider | null> {
  const route = await resolveAiRoute(firmId, "legal_research");
  const resolved = await resolveProviderApiKey(firmId, providerId);
  if (!resolved.key) return null;

  const settings = await getAiSettings(firmId);
  const modelDefault = settings?.modelDefault?.trim();
  const chatModel =
    settings?.providerDefault === providerId && modelDefault
      ? modelDefault
      : DEFAULT_MODELS[providerId].chat;

  let embedFallback: LlmProvider | null = null;
  if (providerId === "claude" || providerId === "openai") {
    const geminiResolved = await resolveProviderApiKey(firmId, "gemini");
    if (geminiResolved.key) {
      embedFallback = createGeminiProvider({
        apiKey: geminiResolved.key,
        embeddingsModel: DEFAULT_MODELS.gemini.embeddings,
      });
    }
  }

  if (providerId === "openai") {
    return createOpenAiProvider({
      apiKey: resolved.key,
      chatModel,
      embeddingsModel: route.embeddingsModel || DEFAULT_MODELS.openai.embeddings,
      embedFallback,
    });
  }
  if (providerId === "claude") {
    return createClaudeProvider({
      apiKey: resolved.key,
      chatModel,
      embedFallback,
    });
  }
  return createGeminiProvider({
    apiKey: resolved.key,
    chatModel,
    embeddingsModel: route.embeddingsModel || DEFAULT_MODELS.gemini.embeddings,
  });
}

function failoverLabel(id: LlmProviderId): string {
  if (id === "claude") return "Anthropic (Claude)";
  if (id === "openai") return "OpenAI";
  return "Gemini";
}

/**
 * Chat with Claude → OpenAI → Gemini failover. Returns notice when not on Claude.
 */
export async function chatWithProviderFailover(
  firmId: string,
  messages: ChatMessage[],
  opts?: ChatOptions,
): Promise<{ result: ChatResult; meta: ChatFailoverMeta; provider: LlmProvider }> {
  const intended = "claude" as LlmProviderId;
  let lastError: unknown = null;

  for (const providerId of CHAT_FAILOVER_ORDER) {
    const built = await buildChatProvider(firmId, providerId);
    if (!built) continue;

    try {
      const result = await built.chat(messages, opts);
      const notice =
        providerId !== intended
          ? `${failoverLabel(intended)} is unavailable (credits, billing, or key). This reply used ${failoverLabel(providerId)}.`
          : null;

      return {
        result,
        provider: built,
        meta: {
          intendedProvider: intended,
          usedProvider: result.provider,
          usedModel: result.model,
          failoverNotice: notice,
        },
      };
    } catch (err) {
      lastError = err;
      if (!isBillingOrAuthFailover(err)) throw err;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new AiProviderError(
    "missing_key",
    "No AI chat provider is configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY on the server.",
  );
}
