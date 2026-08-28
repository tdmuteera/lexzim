import "server-only";

import { AiProviderError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/providers";
import { withAiRetry } from "@/lib/ai/retry";
import { resolveProviderApiKey } from "@/lib/ai/secrets";
import type { LlmProviderId } from "@/lib/ai/types";

export type AiConnectivityState =
  | "ready"
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "unreachable"
  | "provider_error"
  | "unknown";

export type AiConnectivityReport = {
  connectivity: AiConnectivityState;
  keyStatus: "missing" | "present";
  provider: LlmProviderId;
  probed: boolean;
  canSendLegalResearch: boolean;
  canSendMatterAssist: boolean;
  sendBlockedReason: string | null;
  message: string;
  corePracticeNote: string;
};

export const CORE_PRACTICE_NOTE =
  "LexZim core practice features (matters, clients, documents, templates, procedures, search, export) work even when AI is unavailable.";

function messageFor(state: AiConnectivityState, provider: LlmProviderId): string {
  switch (state) {
    case "ready":
      return `AI provider (${provider}) is reachable.`;
    case "missing_key":
      return `API key for ${provider} is not configured (server env or firm BYO).`;
    case "invalid_key":
      return `API key for ${provider} was rejected by the provider.`;
    case "rate_limited":
      return "AI provider is rate-limiting requests. Wait and try again.";
    case "unreachable":
      return "Could not reach the AI provider. Check network connectivity.";
    case "provider_error":
      return "AI provider returned an error.";
    default:
      return "AI connectivity has not been verified yet.";
  }
}

/**
 * Classify AI readiness. When probe=true, performs a tiny embed round-trip with retries.
 * Uses the same auto-route as Legal Research when possible (Claude → OpenAI → Gemini).
 */
export async function getAiConnectivityReport(input: {
  firmId: string;
  probe?: boolean;
}): Promise<AiConnectivityReport> {
  const { resolveAiRoute } = await import("@/lib/ai/routing");
  const route = await resolveAiRoute(input.firmId, "legal_research");
  const normalized = route.providerId;

  const resolved = await resolveProviderApiKey(input.firmId, normalized);
  const keyStatus = resolved.key ? ("present" as const) : ("missing" as const);
  const base = {
    keyStatus,
    provider: normalized,
    corePracticeNote: CORE_PRACTICE_NOTE,
  };

  if (keyStatus === "missing") {
    return {
      ...base,
      connectivity: "missing_key",
      probed: false,
      canSendLegalResearch: false,
      canSendMatterAssist: true,
      sendBlockedReason: `AI key missing for ${normalized}. Legal Research needs a working chat+embed path. Matter Assist can still answer from live matter facts.`,
      message: messageFor("missing_key", normalized),
    };
  }

  if (!input.probe) {
    return {
      ...base,
      connectivity: "unknown",
      probed: false,
      canSendLegalResearch: true,
      canSendMatterAssist: true,
      sendBlockedReason: null,
      message: messageFor("unknown", normalized),
    };
  }

  try {
    const provider = await getProvider(input.firmId, { mode: "legal_research" });
    try {
      await withAiRetry(() => provider.embed("lexzim connectivity probe", {}));
    } catch (embedErr) {
      if (provider.id !== "claude") throw embedErr;
      await withAiRetry(() =>
        provider.chat([{ role: "user", content: "ok" }], { maxOutputTokens: 16, temperature: 0 }),
      );
    }
    return {
      ...base,
      connectivity: "ready",
      probed: true,
      canSendLegalResearch: true,
      canSendMatterAssist: true,
      sendBlockedReason: null,
      message: messageFor("ready", normalized),
    };
  } catch (err) {
    const code = err instanceof AiProviderError ? err.code : "provider_error";
    let connectivity: AiConnectivityState = "provider_error";
    if (code === "missing_key") connectivity = "missing_key";
    else if (code === "invalid_key") connectivity = "invalid_key";
    else if (code === "rate_limited") connectivity = "rate_limited";
    else if (code === "network_error") connectivity = "unreachable";

    const canLegal =
      connectivity !== "missing_key" &&
      connectivity !== "invalid_key" &&
      connectivity !== "unreachable" &&
      connectivity !== "rate_limited";

    return {
      ...base,
      connectivity,
      probed: true,
      canSendLegalResearch: canLegal,
      canSendMatterAssist: true,
      sendBlockedReason: canLegal
        ? null
        : `${messageFor(connectivity, normalized)} Legal Research send is disabled until this is fixed. Matter Assist may still use live matter facts.`,
      message: messageFor(connectivity, normalized),
    };
  }
}
