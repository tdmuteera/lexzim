/**
 * Optional AI second opinion for diagnostics (P8-11).
 * Platform managed keys only. Evidence pack is already redacted.
 * Never asks the model to write code or touch user data.
 */
import "server-only";

import { createClaudeProvider } from "@/lib/ai/providers/claude";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenAiProvider } from "@/lib/ai/providers/openai";
import { getManagedApiKey } from "@/lib/ai/secrets";
import {
  DEFAULT_MODELS,
  type LlmProvider,
  type LlmProviderId,
} from "@/lib/ai/types";
import type { DiagnosticRecommendedAction } from "@/lib/db/diagnostics-types";
import { logWarn } from "@/lib/ops/log";
import type { RuleHit } from "@/lib/diagnostics/rules";

export type AiOpinion = {
  summary: string;
  likelyCause: string;
  confidence: number;
  alternatives: string[];
  recommendedAction: DiagnosticRecommendedAction;
  modelId: string;
};

const ACTIONS = new Set<DiagnosticRecommendedAction>([
  "none",
  "retry",
  "inspect_health",
  "runtime_heal",
  "propose_patch",
]);

function buildManagedProvider(id: LlmProviderId, apiKey: string): LlmProvider {
  const models = DEFAULT_MODELS[id];
  if (id === "openai") {
    return createOpenAiProvider({
      apiKey,
      chatModel: models.chat,
      embeddingsModel: models.embeddings,
    });
  }
  if (id === "claude") {
    return createClaudeProvider({
      apiKey,
      chatModel: models.chat,
      embedFallback: null,
    });
  }
  return createGeminiProvider({
    apiKey,
    chatModel: models.chat,
    embeddingsModel: models.embeddings,
  });
}

/** Prefer Gemini, then OpenAI, then Claude when managed env keys exist. */
export function getPlatformDiagnosticProvider(): {
  provider: LlmProvider;
  modelId: string;
} | null {
  const order: LlmProviderId[] = ["gemini", "openai", "claude"];
  for (const id of order) {
    const key = getManagedApiKey(id);
    if (!key) continue;
    const provider = buildManagedProvider(id, key);
    return { provider, modelId: DEFAULT_MODELS[id].chat };
  }
  return null;
}

function parseAction(raw: unknown): DiagnosticRecommendedAction {
  if (typeof raw === "string" && ACTIONS.has(raw as DiagnosticRecommendedAction)) {
    return raw as DiagnosticRecommendedAction;
  }
  return "inspect_health";
}

function clampConfidence(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Ask the model for a second opinion from the redacted evidence pack only.
 * Returns null if AI is unconfigured or the call fails (rules-only still works).
 */
export async function requestDiagnosticAiOpinion(input: {
  evidencePack: Record<string, unknown>;
  rulesPrimary: RuleHit | null;
}): Promise<AiOpinion | null> {
  const resolved = getPlatformDiagnosticProvider();
  if (!resolved) return null;

  const system = [
    "You are LexZim platform diagnostics. Read ONLY the JSON evidence pack.",
    "Do not invent matter titles, KYC, amounts, SQL, secrets, or document text.",
    "Do not propose editing production source unless recommended_action is propose_patch.",
    "Do not claim you can apply a fix. Diagnose only.",
    "Respond with a single JSON object keys:",
    "summary, likely_cause, confidence (0-100), alternatives (string array),",
    "recommended_action (none|retry|inspect_health|runtime_heal|propose_patch).",
  ].join(" ");

  const user = JSON.stringify({
    rules_primary: input.rulesPrimary
      ? {
          causeCode: input.rulesPrimary.causeCode,
          confidence: input.rulesPrimary.confidence,
          recommendedAction: input.rulesPrimary.recommendedAction,
          summary: input.rulesPrimary.summary,
        }
      : null,
    evidence: input.evidencePack,
  });

  try {
    const chat = await resolved.provider.chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { model: resolved.modelId, temperature: 0, maxOutputTokens: 512 },
    );
    const text = chat.text?.trim() ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const alternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives.filter((a): a is string => typeof a === "string").slice(0, 6)
      : [];
    return {
      summary: String(parsed.summary ?? "AI diagnosis").slice(0, 500),
      likelyCause: String(parsed.likely_cause ?? parsed.likelyCause ?? "").slice(0, 800),
      confidence: clampConfidence(
        parsed.confidence,
        input.rulesPrimary?.confidence ?? 50,
      ),
      alternatives,
      recommendedAction: parseAction(parsed.recommended_action ?? parsed.recommendedAction),
      modelId: chat.model || resolved.modelId,
    };
  } catch (err) {
    logWarn("diagnostics.ai-opinion", "AI second opinion failed; using rules only", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
