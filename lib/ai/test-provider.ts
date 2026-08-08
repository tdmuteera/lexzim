import "server-only";

import { AiProviderError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/providers";
import { resolveProviderApiKey } from "@/lib/ai/secrets";
import {
  DEFAULT_MODELS,
  type LlmProviderId,
} from "@/lib/ai/types";

export {
  DEFAULT_GEMINI_CHAT_MODEL,
  DEFAULT_GEMINI_EMBEDDINGS_MODEL,
} from "@/lib/ai/types";

export type AiConnectionStatus = "connected" | "missing" | "invalid";

export type AiTestProviderResult = {
  status: AiConnectionStatus;
  provider: LlmProviderId;
  model: string;
  latencyMs: number;
  errorCode?: string;
  message?: string;
};

/**
 * Tiny chat health check via getProvider(). Never logs or returns the API key.
 */
export async function aiTestProvider(opts: {
  firmId: string;
  model?: string;
}): Promise<AiTestProviderResult> {
  const provider = await getProvider(opts.firmId);
  const model = opts.model?.trim() || provider.defaultChatModel;
  const key = await resolveProviderApiKey(opts.firmId, provider.id);

  if (!key.key) {
    return {
      status: "missing",
      provider: provider.id,
      model,
      latencyMs: 0,
      errorCode: "missing_key",
      message: `No API key for ${provider.id} (server env or firm BYO).`,
    };
  }

  try {
    const result = await provider.chat(
      [{ role: "user", content: "Reply with the single word OK." }],
      { model, maxOutputTokens: 8, temperature: 0 },
    );
    return {
      status: "connected",
      provider: provider.id,
      model: result.model,
      latencyMs: result.latencyMs,
      message: `${provider.id} connection OK.`,
    };
  } catch (err) {
    if (err instanceof AiProviderError) {
      const status: AiConnectionStatus =
        err.code === "missing_key" ? "missing" : "invalid";
      return {
        status,
        provider: provider.id,
        model,
        latencyMs: 0,
        errorCode: err.code,
        message: err.message,
      };
    }
    return {
      status: "invalid",
      provider: provider.id,
      model,
      latencyMs: 0,
      errorCode: "provider_error",
      message: `${provider.id} health check failed.`,
    };
  }
}

export function defaultChatModelFor(provider: LlmProviderId): string {
  return DEFAULT_MODELS[provider].chat;
}
