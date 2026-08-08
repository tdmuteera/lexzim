import "server-only";

import { getProvider } from "@/lib/ai/providers";
import { assertAiSoftBudget } from "@/lib/ai/budget";
import { AiProviderError } from "@/lib/ai/errors";
import { retrieveFirmContext } from "@/lib/ai/firm-memory/retrieve";
import { buildMatterAssistSnapshot } from "@/lib/ai/rag/matter-snapshot";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  getAiSettings,
} from "@/lib/repos/ai-settings";
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";

export const AI_DRAFT_BANNER = "AI draft — review before filing or service";

const SYSTEM_PROMPT = `You are LexZim drafting assist for Zimbabwe legal practitioners.

STRICT RULES:
1. Start from the merged template draft provided. Improve clarity and practitioner tone only.
2. Do NOT invent official court forms, statutes, section numbers, case names, or facts not in the draft or matter notes.
3. Do NOT claim the letter was filed, served, or sent.
4. Keep merge-resolved party/matter identifiers intact unless clearly wrong in the draft text.
5. Return ONLY the polished letter body as plain text. No markdown fences. No preamble.`;

export type PolishDraftResult = {
  plainText: string;
  polished: boolean;
  errorCode?: string;
  message?: string;
  latencyMs: number;
};

/**
 * Optional AI polish of a deterministically merged draft.
 * If the provider/key is unavailable, returns the original text (merge-only still works).
 */
export async function polishMergedDraft(input: {
  firmId: string;
  userId: string;
  viewAllMatters: boolean;
  matterId: string;
  plainText: string;
  templateTitle?: string;
}): Promise<PolishDraftResult> {
  const started = Date.now();
  const plainText = input.plainText.trim();
  if (!plainText) {
    return {
      plainText: "",
      polished: false,
      errorCode: "empty_draft",
      message: "Draft text is empty.",
      latencyMs: Date.now() - started,
    };
  }

  let provider;
  try {
    await assertAiSoftBudget(input.firmId);
    provider = await getProvider(input.firmId, { mode: "drafting" });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "budget_exceeded") {
      return {
        plainText,
        polished: false,
        errorCode: "budget_exceeded",
        message: err instanceof Error ? err.message : "AI soft budget exceeded.",
        latencyMs: Date.now() - started,
      };
    }
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    return {
      plainText,
      polished: false,
      errorCode,
      message:
        err instanceof Error
          ? err.message
          : "AI polish unavailable; merge-only draft kept.",
      latencyMs: Date.now() - started,
    };
  }

  const settings = await getAiSettings(input.firmId);
  const maxOutputTokens = Math.min(
    4096,
    Math.max(256, settings?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
  );
  const useMatterContext = settings?.matterContextEnabled !== false;

  const snapshot = useMatterContext
    ? await buildMatterAssistSnapshot(input.firmId, input.matterId)
    : null;
  const firm = useMatterContext
    ? await retrieveFirmContext({
        firmId: input.firmId,
        userId: input.userId,
        viewAllMatters: input.viewAllMatters,
        matterId: input.matterId,
        query: input.templateTitle
          ? `${input.templateTitle} ${plainText.slice(0, 200)}`
          : plainText.slice(0, 280),
        topK: 4,
      })
    : { hits: [] as Awaited<ReturnType<typeof retrieveFirmContext>>["hits"] };

  const notesBlock =
    firm.hits.length > 0
      ? firm.hits.map((h) => `- ${h.citationLabel}: ${h.text.slice(0, 400)}`).join("\n")
      : snapshot?.recentNotesText ?? "(no firm-memory snippets)";

  try {
    const chat = await provider.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Template: ${input.templateTitle ?? "matter template"}\n\nMatter summary:\n${snapshot?.summaryText ?? "(none)"}\n\nMatter notes (optional context only):\n${notesBlock}\n\nMerged draft to polish:\n${plainText}`,
        },
      ],
      { temperature: 0.25, maxOutputTokens },
    );

    let out = chat.text.trim();
    if (out.startsWith("```")) {
      out = out.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
    }

    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: provider.id,
      model: provider.defaultChatModel,
      mode: "drafting",
      success: true,
      latencyMs: Date.now() - started,
    });

    return {
      plainText: out || plainText,
      polished: Boolean(out),
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: provider.id,
      model: provider.defaultChatModel,
      mode: "drafting",
      success: false,
      errorCode,
      latencyMs: Date.now() - started,
    });
    return {
      plainText,
      polished: false,
      errorCode,
      message:
        err instanceof Error
          ? err.message
          : "AI polish failed; merge-only draft kept.",
      latencyMs: Date.now() - started,
    };
  }
}
