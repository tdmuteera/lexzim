import "server-only";

import { resolveProviderApiKey } from "@/lib/ai/secrets";
import { defaultChatModelForProvider } from "@/lib/ai/model-catalog";
import {
  GEMINI_EMBEDDINGS_MODEL_ID,
  OPENAI_EMBEDDINGS_MODEL_ID,
  type LlmProviderId,
} from "@/lib/ai/types";
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
  const id = (raw ?? "claude").trim().toLowerCase();
  if (id === "claude" || id === "openai" || id === "gemini") return id;
  return "claude";
}

const PROVIDER_FALLBACK_ORDER: LlmProviderId[] = ["claude", "openai", "gemini"];

/** First provider in order with a configured key (BYO or server env). */
async function resolveAvailableProvider(
  firmId: string,
  preferred: LlmProviderId,
): Promise<{ providerId: LlmProviderId; reason: string }> {
  const order = [preferred, ...PROVIDER_FALLBACK_ORDER.filter((id) => id !== preferred)];
  for (const id of order) {
    const resolved = await resolveProviderApiKey(firmId, id);
    if (resolved.key) {
      return {
        providerId: id,
        reason: id === preferred ? `preferred_${id}` : `fallback_${id}`,
      };
    }
  }
  return { providerId: preferred, reason: `missing_${preferred}` };
}

function embeddingsModelFor(
  providerId: LlmProviderId,
  settingsEmbeddings: string | null | undefined,
): string {
  if (settingsEmbeddings?.trim()) return settingsEmbeddings.trim();
  return providerId === "openai" ? OPENAI_EMBEDDINGS_MODEL_ID : GEMINI_EMBEDDINGS_MODEL_ID;
}

function chatModelForProvider(
  providerId: LlmProviderId,
  preferredProvider: LlmProviderId,
  modelDefault: string | null | undefined,
): string {
  const custom = modelDefault?.trim();
  if (providerId === preferredProvider && custom) return custom;
  return defaultChatModelForProvider(providerId);
}

/**
 * Resolve chat provider for the whole firm.
 * Manual: always providerDefault + modelDefault (no provider fallback).
 * Auto: providerDefault when keyed, else Claude → OpenAI → Gemini.
 */
export async function resolveAiRoute(
  firmId: string,
  _mode?: string | null,
): Promise<ResolvedAiRoute> {
  const settings = await getAiSettings(firmId);
  const routingMode = normalizeRoutingMode(settings?.routingMode);
  const providerDefault = normalizeProviderId(settings?.providerDefault);
  const embeddingsModel = embeddingsModelFor(providerDefault, settings?.embeddingsModel);

  if (routingMode === "manual") {
    return {
      providerId: providerDefault,
      chatModel: chatModelForProvider(
        providerDefault,
        providerDefault,
        settings?.modelDefault,
      ),
      embeddingsModel,
      routingMode,
      reason: `manual_${providerDefault}`,
    };
  }

  const { providerId, reason } = await resolveAvailableProvider(firmId, providerDefault);
  return {
    providerId,
    chatModel: chatModelForProvider(providerId, providerDefault, settings?.modelDefault),
    embeddingsModel,
    routingMode,
    reason: `auto_${reason}`,
  };
}
