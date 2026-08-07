import "server-only";

import { getProvider } from "@/lib/ai/providers";
import { AiProviderError } from "@/lib/ai/errors";
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
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";
import { userCanAccessMatter } from "@/lib/repos/matters";

export const MATTER_ASSIST_DISCLAIMER =
  "Disclaimer: LexZim Matter Assist is a read-only research aid for this matter file. It is not final legal advice and does not change the matter record. Verify facts and authorities before relying on this answer in practice or court.";

const SYSTEM_PROMPT = `You are LexZim Matter Assist for Zimbabwe legal practitioners.

STRICT RULES:
1. You may only use the matter facts and retrieved snippets provided below for THIS matter.
2. Never invent timeline notes, procedures, documents, statutes, section numbers, or case names.
3. If matter facts are insufficient, say what is missing. Do not guess.
4. When citing Zimbabwe law, only use the optional legal knowledge snippets; if none are provided, do not invent authorities.
5. Read-only: do not claim you filed, emailed, updated, or saved anything.
6. Prefer concise practitioner language.
7. End with the mandatory disclaimer exactly as provided.`;

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
  return `${body}\n\n${MATTER_ASSIST_DISCLAIMER}`;
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
}): Promise<MatterAskResult> {
  const started = Date.now();
  const question = input.question.trim();
  const matterId = input.matterId.trim();
  if (!question) throw new Error("question is required");
  if (!matterId) throw new Error("matter_id_required");

  const allowed = await userCanAccessMatter(
    input.firmId,
    matterId,
    input.userId,
    input.viewAllMatters,
  );
  if (!allowed) throw new Error("matter_forbidden");

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

  const userMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "user",
    content: question,
  });

  const firm = await retrieveFirmContext({
    firmId: input.firmId,
    userId: input.userId,
    viewAllMatters: input.viewAllMatters,
    matterId,
    query: question,
  });

  let legalHits: Awaited<ReturnType<typeof retrieveLegalContext>>["hits"] = [];
  let legalCitations: AiCitation[] = [];
  let legalError: string | undefined;
  if (input.includeLegal !== false) {
    const legal = await retrieveLegalContext({
      firmIdForProvider: input.firmId,
      query: question,
      topK: 3,
    });
    legalHits = legal.hits;
    legalCitations = legal.citations;
    legalError = legal.retrievalMeta.errorCode;
  }

  const citations: AiCitation[] = [
    {
      citationLabel: `Matter: ${snapshot.header.matterNumber ?? snapshot.header.title}`,
      title: snapshot.header.title,
      excerpt: snapshot.summaryText.slice(0, 160),
      verified: true,
      sourceId: matterId,
    },
    ...firm.citations,
    ...legalCitations,
  ];

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
    provider = await getProvider(input.firmId);
  } catch (err) {
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
      provider: "gemini",
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
  try {
    const chat = await provider.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Matter question:\n${question}\n\nLive matter facts (source of truth for this file):\n${snapshot.combinedText}\n\nRetrieved firm-memory snippets:\n${firmBlock}\n\nOptional Zimbabwe legal snippets:\n${legalBlock}\n\nEnd with this exact disclaimer:\n${MATTER_ASSIST_DISCLAIMER}`,
        },
      ],
      { temperature: 0.2, maxOutputTokens: 1400 },
    );
    answerText = chat.text.trim();
    chatLatency = chat.latencyMs;
    if (!answerText.includes("Disclaimer:")) {
      answerText = `${answerText}\n\n${MATTER_ASSIST_DISCLAIMER}`;
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
  };
}
