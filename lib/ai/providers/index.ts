import "server-only";

import { createClaudeProvider } from "@/lib/ai/providers/claude";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenAiProvider } from "@/lib/ai/providers/openai";
import {
  createProxyProvider,
  resolveProxyBaseUrl,
} from "@/lib/ai/providers/proxy";
import { withChatProviderFallback } from "@/lib/ai/providers/with-chat-fallback";
import { resolveAiRoute } from "@/lib/ai/routing";
import { getProxyClientToken, resolveProviderApiKey } from "@/lib/ai/secrets";
import { MissingKeyError } from "@/lib/ai/errors";
import {
  DEFAULT_MODELS,
  type LlmProvider,
  type LlmProviderId,
} from "@/lib/ai/types";
import type { AiConversationMode } from "@/lib/db/ai-types";
import { assertCanUse } from "@/lib/licensing/policy";
import {
  getAiSettings,
  normalizeRoutingMode,
} from "@/lib/repos/ai-settings";

function buildDirectProvider(opts: {
  id: LlmProviderId;
  apiKey: string | null;
  chatModel: string;
  embeddingsModel: string;
  embedFallback: LlmProvider | null;
}): LlmProvider {
  if (opts.id === "openai") {
    return createOpenAiProvider({
      apiKey: opts.apiKey,
      chatModel: opts.chatModel,
      embeddingsModel: opts.embeddingsModel,
      embedFallback: opts.embedFallback,
    });
  }
  if (opts.id === "claude") {
    return createClaudeProvider({
      apiKey: opts.apiKey,
      chatModel: opts.chatModel,
      embedFallback: opts.embedFallback,
    });
  }
  return createGeminiProvider({
    apiKey: opts.apiKey,
    chatModel: opts.chatModel,
    embeddingsModel: opts.embeddingsModel,
  });
}

/**
 * Resolve chat/embed provider from firm ai_settings + routing + secrets.
 * key_mode=proxy → LexZim AI proxy (Firm edition). Else BYO/managed direct keys.
 */
export async function getProvider(
  firmId: string,
  opts?: { mode?: AiConversationMode | string | null },
): Promise<LlmProvider> {
  const settings = await getAiSettings(firmId);
  const keyMode = settings?.keyMode === "proxy" ? "proxy" : "direct";
  const routingMode = normalizeRoutingMode(settings?.routingMode);
  const route = await resolveAiRoute(firmId, opts?.mode);

  if (keyMode === "proxy") {
    await assertCanUse(firmId, "ai_proxy");
    const token = await getProxyClientToken(firmId);
    if (!token) {
      throw new MissingKeyError(
        "LexZim Proxy mode is on but no proxy token is stored. Issue a token under Settings → AI.",
      );
    }
    return createProxyProvider({
      proxyBaseUrl: resolveProxyBaseUrl(),
      firmProxyToken: token,
      providerId: route.providerId,
      chatModel: route.chatModel,
      embeddingsModel:
        route.embeddingsModel || DEFAULT_MODELS[route.providerId].embeddings,
    });
  }

  const resolved = await resolveProviderApiKey(firmId, route.providerId);

  let embedFallback: LlmProvider | null = null;
  if (route.providerId === "claude" || route.providerId === "openai") {
    const embedModel =
      route.embeddingsModel || DEFAULT_MODELS[route.providerId].embeddings;
    if (route.providerId === "claude" || /gemini|embedding-001/i.test(embedModel)) {
      const geminiResolved = await resolveProviderApiKey(firmId, "gemini");
      embedFallback = geminiResolved.key
        ? createGeminiProvider({
            apiKey: geminiResolved.key,
            embeddingsModel: DEFAULT_MODELS.gemini.embeddings,
          })
        : null;
    }
  }

  const primary = buildDirectProvider({
    id: route.providerId,
    apiKey: resolved.key,
    chatModel: route.chatModel,
    embeddingsModel:
      route.embeddingsModel || DEFAULT_MODELS[route.providerId].embeddings,
    embedFallback,
  });

  // Auto routing only: fall back to Gemini chat when the chosen provider fails.
  const chatFallbacks: LlmProvider[] = [];
  if (routingMode === "auto" && route.providerId !== "gemini") {
    const geminiResolved = await resolveProviderApiKey(firmId, "gemini");
    if (geminiResolved.key) {
      chatFallbacks.push(
        createGeminiProvider({
          apiKey: geminiResolved.key,
          chatModel: DEFAULT_MODELS.gemini.chat,
          embeddingsModel: DEFAULT_MODELS.gemini.embeddings,
        }),
      );
    }
  }

  return withChatProviderFallback(primary, chatFallbacks);
}

export {
  createClaudeProvider,
  createGeminiProvider,
  createOpenAiProvider,
  createProxyProvider,
};
