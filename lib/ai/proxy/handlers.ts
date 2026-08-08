import "server-only";

import { AuthError } from "@/lib/auth/types";
import { createClaudeProvider } from "@/lib/ai/providers/claude";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenAiProvider } from "@/lib/ai/providers/openai";
import { getManagedApiKey } from "@/lib/ai/secrets";
import {
  DEFAULT_MODELS,
  type ChatMessage,
  type ChatOptions,
  type EmbedOptions,
  type LlmProviderId,
} from "@/lib/ai/types";
import {
  assertProxyQuota,
  authenticateProxyToken,
  incrementProxyCalls,
} from "@/lib/ai/proxy/credentials";
import { canUse } from "@/lib/licensing/policy";

function normalizeProviderId(raw: string | null | undefined): LlmProviderId {
  const id = (raw ?? "gemini").trim().toLowerCase();
  if (id === "claude" || id === "openai" || id === "gemini") return id;
  return "gemini";
}

function buildMasterProvider(id: LlmProviderId) {
  const key = getManagedApiKey(id);
  const defaults = DEFAULT_MODELS[id];
  if (id === "openai") {
    return createOpenAiProvider({
      apiKey: key,
      chatModel: defaults.chat,
      embeddingsModel: defaults.embeddings,
    });
  }
  if (id === "claude") {
    const geminiKey = getManagedApiKey("gemini");
    const embedFallback = geminiKey
      ? createGeminiProvider({
          apiKey: geminiKey,
          embeddingsModel: DEFAULT_MODELS.gemini.embeddings,
        })
      : null;
    return createClaudeProvider({
      apiKey: key,
      chatModel: defaults.chat,
      embedFallback,
    });
  }
  return createGeminiProvider({
    apiKey: key,
    chatModel: defaults.chat,
    embeddingsModel: defaults.embeddings,
  });
}

/**
 * Serve a proxied chat using LexZim master keys (never returned to client).
 * Auth: Bearer firm proxy token.
 */
export async function proxyChat(input: {
  bearerToken: string;
  provider?: string;
  messages: ChatMessage[];
  opts?: ChatOptions;
}) {
  const creds = await authenticateProxyToken(input.bearerToken);
  if (!(await canUse(creds.firmId, "ai_proxy"))) {
    throw new AuthError(
      "feature_disabled",
      "This firm’s edition is not eligible for LexZim AI proxy.",
    );
  }
  await assertProxyQuota(creds);

  const providerId = normalizeProviderId(input.provider);
  const provider = buildMasterProvider(providerId);
  const result = await provider.chat(input.messages, input.opts);
  await incrementProxyCalls(creds.firmId);
  return {
    firmId: creds.firmId,
    text: result.text,
    model: result.model,
    provider: result.provider,
    latencyMs: result.latencyMs,
  };
}

export async function proxyEmbed(input: {
  bearerToken: string;
  provider?: string;
  text: string;
  opts?: EmbedOptions;
}) {
  const creds = await authenticateProxyToken(input.bearerToken);
  if (!(await canUse(creds.firmId, "ai_proxy"))) {
    throw new AuthError(
      "feature_disabled",
      "This firm’s edition is not eligible for LexZim AI proxy.",
    );
  }
  await assertProxyQuota(creds);

  const providerId = normalizeProviderId(input.provider);
  const provider = buildMasterProvider(providerId);
  const result = await provider.embed(input.text, input.opts);
  await incrementProxyCalls(creds.firmId);
  return {
    firmId: creds.firmId,
    embedding: result.embedding,
    model: result.model,
    provider: result.provider,
    dimensions: result.dimensions,
    latencyMs: result.latencyMs,
    fallbackProvider: result.fallbackProvider,
  };
}

export function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) {
    throw new AuthError("unauthorized", "Authorization Bearer token required.");
  }
  return match[1].trim();
}
