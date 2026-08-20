import "server-only";

import { getProvider } from "@/lib/ai/providers";
import { assertAiSoftBudget } from "@/lib/ai/budget";
import { AiProviderError } from "@/lib/ai/errors";
import { loadChatHistory } from "@/lib/ai/chat-history";
import { maybePackChatDocument } from "@/lib/ai/drafting/maybe-pack";
import { classifyChatIntent } from "@/lib/ai/intent";
import { retrieveFirmContext } from "@/lib/ai/firm-memory/retrieve";
import { retrieveLegalContext } from "@/lib/ai/rag/retrieve";
import type { ConfidenceLabel } from "@/lib/ai/rag/answer";
import { buildMatterAssistSnapshot } from "@/lib/ai/rag/matter-snapshot";
import type { AiCitation } from "@/lib/db/ai-types";
import {
  createConversation,
  createMessage,
  getConversation,
} from "@/lib/repos/ai-conversations";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  getAiSettings,
} from "@/lib/repos/ai-settings";
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";
import { userCanAccessMatter } from "@/lib/repos/matters";

export const MATTER_ASSIST_DISCLAIMER =
  "Disclaimer: LexZim Matter Assist is a read-only research aid for this matter file. It is not final legal advice and does not change the matter record. Verify facts and authorities before relying on this answer in practice or court.";

const SYSTEM_PROMPT = `You are LexZim Matter Assist. Talk like a capable modern chat AI, using only this matter's live facts plus any snippets provided.

Voice
- Natural, clear Markdown. Short paragraphs. No heading dumps. No boilerplate disclaimer paragraph.
- Greetings and ordinary chat are fine, then offer to help with this file.

Rules
- Do not invent timeline notes, procedures, documents, statute numbers, or case names.
- If facts are missing, say what is missing. Do not guess the file.
- When citing Zimbabwe law, use only the optional legal snippets. Do not dump excerpts or a disclaimer.
- Read-only: do not claim you filed, emailed, or saved anything unless the user asked you to draft a Word file for download.`;

function looksCutOff(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 180) return false;
  if (/[.!?)]["']?\s*$/.test(trimmed)) return false;
  const tail = trimmed.slice(-240);
  if (/[,:;(]\s*$/.test(trimmed)) return true;
  if (/\n(?:-|\d+\.)\s+[^\n.!?]{1,80}$/.test(tail)) return true;
  if (/\([^)]{0,80}$/.test(tail)) return true;
  return true;
}

function mergeContinuation(base: string, continuation: string): string {
  const first = base.trimEnd();
  const second = continuation.trim();
  if (!second) return first;
  if (first.includes(second)) return first;
  return `${first}\n\n${second}`;
}

export type MatterAskResult = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  answer: string;
  confidence: ConfidenceLabel;
  confidenceScore: number;
  citations: AiCitation[];
  matterId: string;
  matterHeader: {
    title: string;
    matterNumber: string | null;
    status: string;
    areaOfLaw: string;
    clientDisplayName: string;
  };
  retrievalMeta: {
    firmHitCount: number;
    legalHitCount: number;
    usedSnapshot: boolean;
    usedLlm: boolean;
    emptyReason: string | null;
    errorCode?: string;
    latencyMs: number;
  };
  notFound: boolean;
  disclaimer: string;
  document?: {
    id: string;
    fileName: string;
    font: string;
    lineSpacing: number;
  } | null;
};

function confidenceLabel(
  firmHits: number,
  legalHits: number,
  hasSnapshot: boolean,
): { label: ConfidenceLabel; score: number } {
  const total = firmHits + legalHits;
  if (total >= 3) return { label: "high", score: 0.85 };
  if (total >= 1 || hasSnapshot) return { label: "medium", score: 0.6 };
  return { label: "low", score: 0.25 };
}

function deterministicAnswer(
  question: string,
  snapshot: NonNullable<Awaited<ReturnType<typeof buildMatterAssistSnapshot>>>,
): string {
  const q = question.toLowerCase();
  let body: string;
  if (q.includes("procedure") || q.includes("pending") || q.includes("deadline")) {
    body = `Pending procedures for this matter:\n${snapshot.pendingProceduresText}`;
  } else if (q.includes("settlement") || q.includes("note") || q.includes("timeline")) {
    body = `Recent timeline notes:\n${snapshot.recentNotesText}`;
  } else if (q.includes("document") || q.includes("file")) {
    body = `Documents on this matter (metadata):\n${snapshot.documentsText}`;
  } else {
    body = `Matter overview:\n${snapshot.summaryText}\n\nPending procedures:\n${snapshot.pendingProceduresText}\n\nRecent notes:\n${snapshot.recentNotesText}`;
  }
  return body;
}

/**
 * Matter Assist: RBAC matter access → live snapshot + firm memory (+ optional legal RAG) → answer.
 * Never invents authorities or other matters' content.
 */
export async function aiMatterAsk(input: {
  firmId: string;
  userId: string;
  viewAllMatters: boolean;
  matterId: string;
  question: string;
  conversationId?: string | null;
  includeLegal?: boolean;
  attachmentContext?: string | null;
}): Promise<MatterAskResult> {
  const started = Date.now();
  const question = input.question.trim();
  const matterId = input.matterId.trim();
  const attachmentContext = input.attachmentContext?.trim() || "";
  if (!question) throw new Error("question is required");
  if (!matterId) throw new Error("matter_id_required");

  const intent = classifyChatIntent(question);

  const allowed = await userCanAccessMatter(
    input.firmId,
    matterId,
    input.userId,
    input.viewAllMatters,
  );
  if (!allowed) throw new Error("matter_forbidden");

  const settings = await getAiSettings(input.firmId);
  if (settings && settings.matterContextEnabled === false) {
    throw new Error("matter_context_disabled");
  }
  const configuredMaxOutputTokens = Math.min(
    4096,
    Math.max(256, settings?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
  );
  const maxOutputTokens = intent === "legal" ? Math.max(1400, configuredMaxOutputTokens) : configuredMaxOutputTokens;

  const snapshot = await buildMatterAssistSnapshot(input.firmId, matterId);
  if (!snapshot) throw new Error("matter_not_found");

  let conversationId = input.conversationId?.trim() || null;
  if (conversationId) {
    const existing = await getConversation(input.firmId, conversationId);
    if (!existing || existing.userId !== input.userId) {
      throw new Error("conversation_not_found");
    }
    if (existing.mode !== "matter_assist") {
      throw new Error("conversation_mode_mismatch");
    }
    if (existing.matterId && existing.matterId !== matterId) {
      throw new Error("conversation_matter_mismatch");
    }
  } else {
    const created = await createConversation({
      firmId: input.firmId,
      userId: input.userId,
      mode: "matter_assist",
      matterId,
      title: `${snapshot.header.matterNumber ?? "Matter"}: ${question.slice(0, 60)}`,
    });
    conversationId = created.id;
  }

  const storedUser = attachmentContext
    ? `${question}\n\n[Attached files]\n${attachmentContext.slice(0, 20_000)}`
    : question;

  const userMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "user",
    content: storedUser,
  });

  const firm =
    intent === "chat"
      ? { hits: [] as Awaited<ReturnType<typeof retrieveFirmContext>>["hits"] }
      : await retrieveFirmContext({
          firmId: input.firmId,
          userId: input.userId,
          viewAllMatters: input.viewAllMatters,
          matterId,
          query: question,
        });

  let legalHits: Awaited<ReturnType<typeof retrieveLegalContext>>["hits"] = [];
  let legalCitations: AiCitation[] = [];
  let legalError: string | undefined;
  if (intent === "legal" && input.includeLegal !== false) {
    try {
      const legal = await retrieveLegalContext({
        firmIdForProvider: input.firmId,
        query: question,
        topK: 3,
      });
      legalHits = legal.hits;
      legalCitations = legal.citations.map((c) => ({
        citationLabel: c.citationLabel,
        title: c.title,
        sourceUrl: c.sourceUrl ?? null,
      }));
      legalError = legal.retrievalMeta.errorCode;
    } catch {
      /* matter chat still proceeds */
    }
  }

  const citations: AiCitation[] = intent === "legal" ? legalCitations.slice(0, 6) : [];

  const conf = confidenceLabel(
    firm.hits.length,
    legalHits.length,
    snapshot.hasContent,
  );

  const firmBlock =
    firm.hits.length === 0
      ? "(No firm-memory embeddings matched for this matter. Live matter facts below still apply.)"
      : firm.hits
          .map(
            (h, i) =>
              `[Firm ${i + 1}] ${h.citationLabel} (score ${h.score.toFixed(3)})\n${h.text}`,
          )
          .join("\n\n");

  const legalBlock =
    legalHits.length === 0
      ? "(No Zimbabwe knowledge-base snippets retrieved. Do not invent statutes or cases.)"
      : legalHits
          .map(
            (h, i) =>
              `[Law ${i + 1}] ${h.citationLabel}\n${h.text}`,
          )
          .join("\n\n");

  // No LLM path: still answer from live snapshot (read-only).
  let provider;
  try {
    await assertAiSoftBudget(input.firmId);
    provider = await getProvider(input.firmId, { mode: "matter_assist" });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "budget_exceeded") {
      throw err;
    }
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    const answer = deterministicAnswer(question, snapshot);
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: answer,
      confidence: conf.score,
      citationsJson: citations,
      retrievalMetaJson: {
        notFound: false,
        confidenceLabel: conf.label,
        firmHitCount: firm.hits.length,
        legalHitCount: legalHits.length,
        usedSnapshot: true,
        usedLlm: false,
        errorCode,
      },
    });
    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: settings?.providerDefault ?? "gemini",
      mode: "matter_assist",
      success: false,
      errorCode,
      latencyMs: Date.now() - started,
    });
    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answer,
      confidence: conf.label,
      confidenceScore: conf.score,
      citations,
      matterId,
      matterHeader: snapshot.header,
      retrievalMeta: {
        firmHitCount: firm.hits.length,
        legalHitCount: legalHits.length,
        usedSnapshot: true,
        usedLlm: false,
        emptyReason: null,
        errorCode,
        latencyMs: Date.now() - started,
      },
      notFound: false,
      disclaimer: MATTER_ASSIST_DISCLAIMER,
    };
  }

  let answerText: string;
  let chatLatency = 0;
  let usedLlm = true;
  const chatTemperature = intent === "chat" ? 0.55 : 0.35;
  try {
    const history = await loadChatHistory({
      firmId: input.firmId,
      conversationId,
      limit: 12,
    });
    const attachmentBlock = attachmentContext
      ? `\n\nUser attached file text (OCR or extracted):\n${attachmentContext.slice(0, 24_000)}`
      : "";
    const grounding =
      intent === "chat"
        ? "This turn is ordinary conversation. Reply naturally. You may offer to help with this matter file."
        : `Live matter facts:\n${snapshot.combinedText}\n\nFirm-memory snippets:\n${firmBlock}\n\nOptional Zimbabwe legal snippets (do not invent authorities beyond these):\n${legalBlock}`;
    const chat = await provider.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.slice(0, -1),
        {
          role: "user",
          content: `${question}${attachmentBlock}\n\n${grounding}`,
        },
      ],
      { temperature: chatTemperature, maxOutputTokens },
    );
    answerText = chat.text.trim();
    chatLatency = chat.latencyMs;

    if (intent === "legal" && looksCutOff(answerText)) {
      const continuation = await provider.chat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.slice(0, -1),
          { role: "assistant", content: answerText },
          {
            role: "user",
            content:
              "Continue exactly where you stopped. Do not repeat earlier text. Finish incomplete lines and steps only.",
          },
        ],
        {
          temperature: chatTemperature,
          maxOutputTokens: Math.max(900, Math.floor(maxOutputTokens / 2)),
        },
      );
      answerText = mergeContinuation(answerText, continuation.text);
      chatLatency += continuation.latencyMs;
    }
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    usedLlm = false;
    answerText = deterministicAnswer(question, snapshot);
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: answerText,
      confidence: conf.score,
      citationsJson: citations,
      retrievalMetaJson: {
        notFound: false,
        confidenceLabel: conf.label,
        firmHitCount: firm.hits.length,
        legalHitCount: legalHits.length,
        usedSnapshot: true,
        usedLlm: false,
        generatorError: errorCode,
        legalError: legalError ?? null,
      },
    });
    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: provider.id,
      model: provider.defaultChatModel,
      mode: "matter_assist",
      success: false,
      errorCode,
      latencyMs: Date.now() - started,
    });
    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answer: answerText,
      confidence: conf.label,
      confidenceScore: conf.score,
      citations,
      matterId,
      matterHeader: snapshot.header,
      retrievalMeta: {
        firmHitCount: firm.hits.length,
        legalHitCount: legalHits.length,
        usedSnapshot: true,
        usedLlm: false,
        emptyReason: null,
        errorCode,
        latencyMs: Date.now() - started,
      },
      notFound: false,
      disclaimer: MATTER_ASSIST_DISCLAIMER,
    };
  }

  const document = await maybePackChatDocument({
    firmId: input.firmId,
    userId: input.userId,
    question,
    answerText,
    attachmentContext,
  });

  const notFound = !snapshot.hasContent && firm.hits.length === 0 && legalHits.length === 0;
  const assistantMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "assistant",
    content: answerText,
    confidence: conf.score,
    citationsJson: citations,
    retrievalMetaJson: {
      notFound,
      confidenceLabel: conf.label,
      firmHitCount: firm.hits.length,
      legalHitCount: legalHits.length,
      usedSnapshot: true,
      usedLlm,
      chatLatencyMs: chatLatency,
      legalError: legalError ?? null,
      document,
    },
  });

  await recordAiUsageEvent({
    firmId: input.firmId,
    userId: input.userId,
    provider: provider.id,
    model: provider.defaultChatModel,
    mode: "matter_assist",
    success: true,
    latencyMs: Date.now() - started,
  });

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    answer: answerText,
    confidence: conf.label,
    confidenceScore: conf.score,
    citations,
    matterId,
    matterHeader: snapshot.header,
    retrievalMeta: {
      firmHitCount: firm.hits.length,
      legalHitCount: legalHits.length,
      usedSnapshot: true,
      usedLlm,
      emptyReason: notFound ? "no_matter_context" : null,
      latencyMs: Date.now() - started,
    },
    notFound,
    disclaimer: MATTER_ASSIST_DISCLAIMER,
    document,
  };
}
