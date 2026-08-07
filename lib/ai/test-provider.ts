import "server-only";

import { AiProviderError } from "@/lib/ai/errors";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { getGeminiApiKey } from "@/lib/ai/secrets";
import {
  DEFAULT_GEMINI_CHAT_MODEL,
  DEFAULT_GEMINI_EMBEDDINGS_MODEL,
} from "@/lib/ai/types";

export { DEFAULT_GEMINI_CHAT_MODEL, DEFAULT_GEMINI_EMBEDDINGS_MODEL };

export type AiConnectionStatus = "connected" | "missing" | "invalid";

export type AiTestProviderResult = {
  status: AiConnectionStatus;
  provider: "gemini";
  model: string;
  latencyMs: number;
  errorCode?: string;
  message?: string;
};

/**
 * Tiny Gemini health check via provider.chat(). Never logs or returns the API key.
 */
export async function aiTestProvider(opts?: {
  model?: string;
}): Promise<AiTestProviderResult> {
  const model = opts?.model?.trim() || DEFAULT_GEMINI_CHAT_MODEL;

  if (!getGeminiApiKey()) {
    return {
      status: "missing",
      provider: "gemini",
      model,
      latencyMs: 0,
      errorCode: "missing_key",
      message: "GEMINI_API_KEY is not set on the server.",
    };
  }

  const provider = createGeminiProvider({ chatModel: model });

  try {
    const result = await provider.chat(
      [{ role: "user", content: "Reply with the single word OK." }],
      { model, maxOutputTokens: 8, temperature: 0 },
    );
    return {
      status: "connected",
      provider: "gemini",
      model: result.model,
      latencyMs: result.latencyMs,
      message: "Gemini connection OK.",
    };
  } catch (err) {
    if (err instanceof AiProviderError) {
      const status: AiConnectionStatus =
        err.code === "missing_key" ? "missing" : "invalid";
      return {
        status,
        provider: "gemini",
        model,
        latencyMs: 0,
        errorCode: err.code,
        message: err.message,
      };
    }
    return {
      status: "invalid",
      provider: "gemini",
      model,
      latencyMs: 0,
      errorCode: "provider_error",
      message: "Gemini health check failed.",
    };
  }
}
