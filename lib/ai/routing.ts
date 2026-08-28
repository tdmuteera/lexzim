import "server-only";

import { resolveProviderApiKey } from "@/lib/ai/secrets";
import {
  CLAUDE_CHAT_MODEL_ID,
  GEMINI_CHAT_MODEL_ID,
  GEMINI_EMBEDDINGS_MODEL_ID,
  OPENAI_EMBEDDINGS_MODEL_ID,
  type LlmProviderId,
} from "@/lib/ai/types";
import type { AiConversationMode } from "@/lib/db/ai-types";
import {
  getAiSettings,
  normalizeRoutingMode,
  type AiRoutingMode,
} from "@/lib/repos/ai-settings";

export type ResolvedAiRoute = {
  providerId: LlmProviderId;
  chatModel: string;
  embeddingsModel: string;
  routingMode: AiRoutingMode;
  /** Why this provider was chosen. */
  reason: string;
};

function normalizeProviderId(raw: string | null | undefined): LlmProviderId {
  const id = (raw ?? "gemini").trim().toLowerCase();
  if (id === "claude" || id === "openai" || id === "gemini") return id;
  return "gemini";
}

/**
 * Resolve chat provider for a mode.
 * Auto (default): legal_research prefers Claude → OpenAI → Gemini (first key present).
 * Manual: always firm providerDefault + modelDefault.
 */
export async function resolveAiRoute(
  firmId: string,
  mode?: AiConversationMode | string | null,
): Promise<ResolvedAiRoute> {
  const settings = await getAiSettings(firmId);
  const routingMode = normalizeRoutingMode(settings?.routingMode);
  const providerDefault = normalizeProviderId(settings?.providerDefault);
  const embeddingsModel =
    settings?.embeddingsModel?.trim() ||
    (providerDefault === "openai" ? OPENAI_EMBEDDINGS_MODEL_ID : GEMINI_EMBEDDINGS_MODEL_ID);

  if (routingMode === "manual") {
    return {
      providerId: providerDefault,
      chatModel: settings?.modelDefault?.trim() || defaultChat(providerDefault),
      embeddingsModel,
      routingMode,
      reason: "manual_provider_default",
    };
  }

  if (mode === "legal_research") {
    const claude = await resolveProviderApiKey(firmId, "claude");
    if (claude.key) {
      return {
        providerId: "claude",
        chatModel: CLAUDE_CHAT_MODEL_ID,
        embeddingsModel,
        routingMode,
        reason: "auto_legal_prefers_claude",
      };
    }
    const openai = await resolveProviderApiKey(firmId, "openai");
    if (openai.key) {
      // Prefer firm embeddings model when set (often Gemini pack vectors).
      const embed =
        settings?.embeddingsModel?.trim() ||
        OPENAI_EMBEDDINGS_MODEL_ID;
      return {
        providerId: "openai",
        chatModel: settings?.modelDefault?.trim()?.startsWith("gpt")
          ? settings.modelDefault.trim()
          : defaultChat("openai"),
        embeddingsModel: embed,
        routingMode,
        reason: "auto_legal_prefers_openai",
      };
    }
    return {
      providerId: "gemini",
      chatModel: GEMINI_CHAT_MODEL_ID,
      embeddingsModel: settings?.embeddingsModel?.trim() || GEMINI_EMBEDDINGS_MODEL_ID,
      routingMode,
      reason: "auto_legal_gemini_fallback",
    };
  }

  return {
    providerId: providerDefault,
    chatModel: settings?.modelDefault?.trim() || defaultChat(providerDefault),
    embeddingsModel,
    routingMode,
    reason: "auto_non_legal_provider_default",
  };
}

function defaultChat(id: LlmProviderId): string {
  if (id === "claude") return CLAUDE_CHAT_MODEL_ID;
  if (id === "openai") return "gpt-4.1";
  return GEMINI_CHAT_MODEL_ID;
}
