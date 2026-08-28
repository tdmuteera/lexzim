/**
 * OpenAI model escalation ladder.
 *
 * Philosophy: default to the cheap GPT-4 family for ordinary work, then escalate
 * QUIETLY to stronger models only when a task is complex or a model fails/blocks.
 * The ladder is ordered cheapest → strongest. We start at a tier chosen by task
 * complexity, walk UP the ladder on failure, and finally fall back to cheaper
 * tiers so that something always answers (as long as one model is allowed).
 *
 * Pro / Sora / image / audio / realtime models are intentionally excluded to
 * protect the budget — those are configured (allowed/blocked) on the OpenAI side.
 *
 * Dated-snapshot fallbacks (verified P-AI-reset): some OpenAI projects restrict
 * access to specific dated model snapshots and block the rolling "latest" alias
 * for the same family (live-tested: this project 403s on `gpt-4o-mini`,
 * `gpt-4.1`, `gpt-4.1-mini`, `gpt-5-mini`, `gpt-5`, `gpt-5.2`, but allows
 * `gpt-4o-mini-2024-07-18`, `gpt-4.1-mini-2025-04-14`, `gpt-4o`, `gpt-5.1`).
 * Each alias is followed immediately by its known-good dated snapshot so a
 * blocked alias costs one quick failed call, not a walk through several.
 */

/** Cheapest → strongest chat models we are willing to spend on. */
export const OPENAI_CHAT_LADDER = [
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4o",
  "gpt-4.1",
  "gpt-5-mini",
  "gpt-5",
  "gpt-5.1",
  "gpt-5.2",
] as const;

export type OpenAiChatQuality = "budget" | "standard" | "capable" | "max";

/** Where each quality level starts on the ladder (index into OPENAI_CHAT_LADDER). */
const QUALITY_START_INDEX: Record<OpenAiChatQuality, number> = {
  budget: 0, // gpt-4o-mini (dated fallback right after if blocked)
  standard: 2, // gpt-4.1-mini (dated fallback right after if blocked)
  capable: 4, // gpt-4o (broadly available; then gpt-4.1 as an upgrade attempt)
  max: 8, // gpt-5.1 (gpt-5 / gpt-5-mini are often restricted; gpt-5.1 verified)
};

function ladderIndexOf(model: string): number {
  return OPENAI_CHAT_LADDER.findIndex((m) => m === model);
}

/**
 * Build the ordered list of models to try.
 *
 * Complexity (quality) chooses the START tier, so simple work stays cheap even
 * if the firm configured a stronger default. We then escalate UP the ladder on
 * failure and finally wrap down to cheaper tiers so something always answers.
 *
 * The firm's configured model is used as a first-try hint ONLY when it is at
 * least as strong as the complexity tier (or a custom id not on the ladder).
 */
export function buildOpenAiChatCandidates(
  preferred: string,
  quality: OpenAiChatQuality = "standard",
): string[] {
  const primary = preferred.trim();
  const startIndex = QUALITY_START_INDEX[quality] ?? 1;
  const preferredIndex = ladderIndexOf(primary);

  const order: string[] = [];

  // Honor an explicit preference first when it is not weaker than the task tier,
  // or when it is a custom model id we do not know how to rank.
  if (primary && (preferredIndex < 0 || preferredIndex >= startIndex)) {
    order.push(primary);
  }

  // Escalate upward (stronger) from the complexity start tier.
  for (let i = startIndex; i < OPENAI_CHAT_LADDER.length; i += 1) {
    order.push(OPENAI_CHAT_LADDER[i]);
  }
  // Then wrap down to cheaper tiers as a last resort (keeps something working).
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    order.push(OPENAI_CHAT_LADDER[i]);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of order) {
    const id = m.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : ["gpt-4o-mini"];
}

/**
 * Newer OpenAI models (gpt-5*, o1/o3/o4 reasoning) use the Responses-style
 * chat schema: `max_completion_tokens` instead of `max_tokens`, and they only
 * accept the default temperature. Detect them so requests do not 400.
 */
export function isNewSchemaModel(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/i.test(model.trim());
}

/** True when the project/org blocked the model or the model id is unknown. */
export function isOpenAiModelUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = "message" in err ? String((err as { message?: unknown }).message ?? "") : "";
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const httpStatus =
    "httpStatus" in err ? Number((err as { httpStatus?: unknown }).httpStatus ?? 0) : 0;
  const lower = message.toLowerCase();

  if (code === "model_not_found") return true;
  if (/does not have access to model|model_not_found|invalid model|unknown model|model .* not (found|available)/i.test(lower)) {
    return true;
  }
  if ((httpStatus === 403 || httpStatus === 404) && /model/i.test(lower)) return true;
  return false;
}

/** Worth trying another OpenAI model before giving up. */
export function shouldTryNextOpenAiModel(err: unknown): boolean {
  if (isOpenAiModelUnavailableError(err)) return true;
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  const message = "message" in err ? String((err as { message?: unknown }).message ?? "") : "";
  if (code === "rate_limited") return true;
  if (/empty chat response|empty response|unsupported (parameter|value)|max_tokens/i.test(message)) {
    return true;
  }
  return false;
}
