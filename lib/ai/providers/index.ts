import "server-only";

import { createClaudeProvider } from "@/lib/ai/providers/claude";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenAiProvider } from "@/lib/ai/providers/openai";
import { getAiSettings } from "@/lib/repos/ai-settings";
import type { LlmProvider, LlmProviderId } from "@/lib/ai/types";

function normalizeProviderId(raw: string | null | undefined): LlmProviderId {
  const id = (raw ?? "gemini").trim().toLowerCase();
  if (id === "claude" || id === "openai" || id === "gemini") return id;
  return "gemini";
}

/**
 * Resolve chat/embed provider from firm ai_settings + server secrets.
 * Phase 2: Gemini is live; Claude/OpenAI throw NotImplementedProviderError.
 */
export async function getProvider(firmId: string): Promise<LlmProvider> {
  const settings = await getAiSettings(firmId);
  const id = normalizeProviderId(settings?.providerDefault);

  if (id === "claude") return createClaudeProvider();
  if (id === "openai") return createOpenAiProvider();

  return createGeminiProvider({
    chatModel: settings?.modelDefault,
    embeddingsModel: settings?.embeddingsModel,
  });
}

export {
  createClaudeProvider,
  createGeminiProvider,
  createOpenAiProvider,
};
