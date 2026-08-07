import "server-only";

import { getProvider } from "@/lib/ai/providers";
import {
  retrieveLegalContext,
  type RetrieveLegalContextResult,
} from "@/lib/ai/rag/retrieve";
import type { AiCitation } from "@/lib/db/ai-types";
import {
  createConversation,
  createMessage,
  getConversation,
} from "@/lib/repos/ai-conversations";
import { getAiSettings } from "@/lib/repos/ai-settings";
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";
import { AiProviderError } from "@/lib/ai/errors";
import {
  formatWebLookupBlock,
  lookupTrustedWeb,
  type WebLookupResult,
} from "@/lib/ai/web/trusted-lookup";

export const LEGAL_DISCLAIMER =
  "Disclaimer: LexZim AI is a research aid for Zimbabwe legal practitioners. It is not final legal advice. Verify all authorities against primary sources (ZimLII, Veritas, official gazettes) before relying on this answer in practice or court.";

export const NOT_FOUND_ANSWER =
  "I could not find sufficiently relevant material in the LexZim Zimbabwe knowledge base for this question.\n\nI will not invent statutes, section numbers, or case names. Please rephrase the question, re-ingest/embed the knowledge pack if embeddings are missing, or consult primary sources directly.\n\n" +
  LEGAL_DISCLAIMER;

const SYSTEM_PROMPT = `You are LexZim's Zimbabwe Legal Intelligence Assistant for licensed practitioners.

STRICT RULES:
1. Jurisdiction: Zimbabwe only. Do not apply foreign law as authority.
2. Prefer LOCAL knowledge-base context as the source of truth for authorities.
3. NEVER invent statutes, section numbers, case names, SI numbers, or court holdings.
4. When you rely on a context block, cite it using its citation label.
5. Any WEB excerpts are labelled [UNVERIFIED]. Treat them as unverified leads only. Never present them as confirmed authority, and never let them override or replace local grounding silently.
6. Prefer cautious language ("the retrieved excerpt indicates…") over definitive claims.
7. End with the mandatory disclaimer exactly as provided in the user message footer instructions.
8. Do not provide matter-specific advice beyond the legal research question asked.`;

export type ConfidenceLabel = "high" | "medium" | "low";

export type LegalAskResult = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  answer: string;
  confidence: ConfidenceLabel;
  confidenceScore: number;
  citations: AiCitation[];
  retrievalMeta: RetrieveLegalContextResult["retrievalMeta"] & {
    webLookupEnabled?: boolean;
    webHitCount?: number;
    webErrorCode?: string | null;
  };
  notFound: boolean;
  disclaimer: string;
  webLookup: Pick<
    WebLookupResult,
    "enabled" | "attempted" | "errorCode" | "message" | "latencyMs"
  > & { hitCount: number };
};

function confidenceFromHits(hitCount: number, topScore: number | null): {
  label: ConfidenceLabel;
  score: number;
} {
  if (hitCount <= 0) return { label: "low", score: 0.2 };
  if (hitCount >= 3 && (topScore ?? 0) >= 0.55) return { label: "high", score: 0.85 };
  if ((topScore ?? 0) >= 0.45) return { label: "medium", score: 0.6 };
  return { label: "low", score: 0.35 };
}

function buildContextBlock(retrieval: RetrieveLegalContextResult): string {
  return retrieval.hits
    .map(
      (h, i) =>
        `[${i + 1}] citation: ${h.citationLabel}\nheading: ${h.headingPath ?? "—"}\nscore: ${h.score.toFixed(3)}\n${h.text}`,
    )
    .join("\n\n---\n\n");
}

function webMeta(web: WebLookupResult) {
  return {
    enabled: web.enabled,
    attempted: web.attempted,
    hitCount: web.hits.length,
    errorCode: web.errorCode,
    message: web.message,
    latencyMs: web.latencyMs,
  };
}

/**
 * Legal research ask: local RAG first → optional UNVERIFIED web → answer.
 * Never invents authorities; web never silently overrides local grounding.
 */
export async function aiLegalAsk(input: {
  firmId: string;
  userId: string;
  question: string;
  conversationId?: string | null;
}): Promise<LegalAskResult> {
  const question = input.question.trim();
  if (!question) {
    throw new Error("question is required");
  }

  let conversationId = input.conversationId?.trim() || null;
  if (conversationId) {
    const existing = await getConversation(input.firmId, conversationId);
    if (!existing || existing.userId !== input.userId) {
      throw new Error("conversation_not_found");
    }
    if (existing.mode !== "legal_research") {
      throw new Error("conversation_mode_mismatch");
    }
  } else {
    const created = await createConversation({
      firmId: input.firmId,
      userId: input.userId,
      mode: "legal_research",
      title: question.slice(0, 80),
    });
    conversationId = created.id;
  }

  const userMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "user",
    content: question,
  });

  const settings = await getAiSettings(input.firmId);
  const webEnabled = Boolean(settings?.webLookupEnabled);

  const retrieval = await retrieveLegalContext({
    firmIdForProvider: input.firmId,
    query: question,
  });

  const web = await lookupTrustedWeb({ query: question, enabled: webEnabled });

  const mergeMeta = {
    ...retrieval.retrievalMeta,
    webLookupEnabled: web.enabled,
    webHitCount: web.hits.length,
    webErrorCode: web.errorCode ?? null,
  };

  // Local empty + no usable web → classic not-found (no invented authorities).
  if (retrieval.hits.length === 0 && web.hits.length === 0) {
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: NOT_FOUND_ANSWER,
      confidence: 0.2,
      citationsJson: [],
      retrievalMetaJson: {
        ...mergeMeta,
        notFound: true,
        confidenceLabel: "low",
        webLookup: webMeta(web),
      },
    });

    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: "gemini",
      model: retrieval.retrievalMeta.embeddingsModel,
      mode: "legal_research",
      success: true,
      errorCode: retrieval.retrievalMeta.errorCode ?? "not_found",
      latencyMs: retrieval.retrievalMeta.latencyMs + web.latencyMs,
    });

    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answer: NOT_FOUND_ANSWER,
      confidence: "low",
      confidenceScore: 0.2,
      citations: [],
      retrievalMeta: mergeMeta,
      notFound: true,
      disclaimer: LEGAL_DISCLAIMER,
      webLookup: webMeta(web),
    };
  }

  const localConf = confidenceFromHits(
    retrieval.hits.length,
    retrieval.hits[0]?.score ?? null,
  );
  // Web-only answers stay low confidence and UNVERIFIED.
  const conf =
    retrieval.hits.length === 0
      ? { label: "low" as const, score: 0.25 }
      : localConf;

  const citations: AiCitation[] = [...retrieval.citations, ...web.citations];
  const contextBlock =
    retrieval.hits.length > 0
      ? buildContextBlock(retrieval)
      : "(No local knowledge-base hits above threshold.)";
  const webBlock = formatWebLookupBlock(web.hits);

  let provider;
  try {
    provider = await getProvider(input.firmId);
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    const fallback =
      retrieval.hits.length > 0
        ? "I retrieved local knowledge-base material, but the answer generator could not complete (provider error). Please try again.\n\n" +
          LEGAL_DISCLAIMER
        : NOT_FOUND_ANSWER;
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: fallback,
      confidence: 0.2,
      citationsJson: citations,
      retrievalMetaJson: {
        ...mergeMeta,
        notFound: retrieval.hits.length === 0,
        generatorError: errorCode,
        confidenceLabel: "low",
        webLookup: webMeta(web),
      },
    });
    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answer: fallback,
      confidence: "low",
      confidenceScore: 0.2,
      citations,
      retrievalMeta: mergeMeta,
      notFound: retrieval.hits.length === 0,
      disclaimer: LEGAL_DISCLAIMER,
      webLookup: webMeta(web),
    };
  }

  let answerText: string;
  let chatLatency = 0;
  try {
    const chat = await provider.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Question:\n${question}\n\nLOCAL Zimbabwe knowledge-base context (primary grounding):\n${contextBlock}\n\nOPTIONAL allowlisted WEB excerpts (all UNVERIFIED; never treat as confirmed authority):\n${webBlock || "(none)"}\n\nInstructions:\n- Ground authorities in LOCAL context when present.\n- If only UNVERIFIED web excerpts exist, say the local KB had no match and list them as unverified leads only.\n- Cite labels exactly, including [UNVERIFIED] where applicable.\n- End with this exact disclaimer paragraph:\n${LEGAL_DISCLAIMER}`,
        },
      ],
      { temperature: 0.2, maxOutputTokens: 1200 },
    );
    answerText = chat.text.trim();
    chatLatency = chat.latencyMs;
    if (!answerText.includes("Disclaimer:")) {
      answerText = `${answerText}\n\n${LEGAL_DISCLAIMER}`;
    }
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    const fallback =
      "I retrieved relevant material, but the answer generator could not complete (provider error). Please try again.\n\n" +
      LEGAL_DISCLAIMER;
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: fallback,
      confidence: 0.2,
      citationsJson: citations,
      retrievalMetaJson: {
        ...mergeMeta,
        notFound: false,
        generatorError: errorCode,
        confidenceLabel: "low",
        webLookup: webMeta(web),
      },
    });
    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: provider.id,
      model: provider.defaultChatModel,
      mode: "legal_research",
      success: false,
      errorCode,
      latencyMs: retrieval.retrievalMeta.latencyMs + web.latencyMs,
    });
    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answer: fallback,
      confidence: "low",
      confidenceScore: 0.2,
      citations,
      retrievalMeta: mergeMeta,
      notFound: false,
      disclaimer: LEGAL_DISCLAIMER,
      webLookup: webMeta(web),
    };
  }

  const notFound = retrieval.hits.length === 0;
  const assistantMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "assistant",
    content: answerText,
    confidence: conf.score,
    citationsJson: citations,
    retrievalMetaJson: {
      ...mergeMeta,
      notFound,
      confidenceLabel: conf.label,
      chatLatencyMs: chatLatency,
      webLookup: webMeta(web),
    },
  });

  await recordAiUsageEvent({
    firmId: input.firmId,
    userId: input.userId,
    provider: provider.id,
    model: provider.defaultChatModel,
    mode: "legal_research",
    success: true,
    latencyMs: retrieval.retrievalMeta.latencyMs + web.latencyMs + chatLatency,
  });

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    answer: answerText,
    confidence: conf.label,
    confidenceScore: conf.score,
    citations,
    retrievalMeta: mergeMeta,
    notFound,
    disclaimer: LEGAL_DISCLAIMER,
    webLookup: webMeta(web),
  };
}
