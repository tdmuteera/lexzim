import "server-only";

import { getProvider } from "@/lib/ai/providers";
import { assertAiSoftBudget } from "@/lib/ai/budget";
import { loadChatHistory } from "@/lib/ai/chat-history";
import { maybePackChatDocument } from "@/lib/ai/drafting/maybe-pack";
import { classifyChatIntent } from "@/lib/ai/intent";
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
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  getAiSettings,
} from "@/lib/repos/ai-settings";
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";
import { AiProviderError } from "@/lib/ai/errors";
import {
  formatWebLookupBlock,
  lookupTrustedWeb,
  type WebLookupResult,
} from "@/lib/ai/web/trusted-lookup";

export const LEGAL_DISCLAIMER =
  "Disclaimer: LexZim AI is a research aid for Zimbabwe legal practitioners. It is not final legal advice. Verify all authorities against primary sources (ZimLII, Veritas, official gazettes) before relying on this answer in practice or court.";

const SYSTEM_PROMPT = `You are LexZim, a Zimbabwe-focused assistant for legal practitioners. Talk like a capable modern chat AI: natural, clear, and useful.

Voice
- Answer greetings and ordinary conversation normally (weather, how you are, general knowledge, brainstorming).
- Write in clean Markdown: short paragraphs, bullets when they help, bold for key terms. Do not stack many headings. Never output a wall of # hashes.
- Do not lecture about being an AI, about "verification", or about disclaimers on casual chat.

Legal caution (quiet)
- When the user asks about law, procedure, rights, a case, or a filing: stay careful. Prefer Zimbabwe law. Never invent statute numbers, SI numbers, case names, or holdings.
- If you are unsure, say so in one short sentence and give practical next steps. Do not refuse ordinary chat because the knowledge pack had no hit.
- After a legal or case-specific answer, do not dump excerpts or a Disclaimer paragraph. The app may attach a short source list separately.

Documents
- If asked to draft a letter, notice, affidavit, or Word document, write the full document body. Follow font and spacing requests.`;

export type ConfidenceLabel = "high" | "medium" | "low";

export type LegalAskDocument = {
  id: string;
  fileName: string;
  font: string;
  lineSpacing: number;
};

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
    intent?: string;
    showCitations?: boolean;
  };
  notFound: boolean;
  disclaimer: string;
  document?: LegalAskDocument | null;
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
        `[${i + 1}] ${h.citationLabel}\n${h.text}`,
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

function isAuthorityCitation(c: AiCitation): boolean {
  const label = `${c.citationLabel} ${c.title ?? ""}`;
  if (c.sourceUrl) return true;
  return /\b(act|si\b|constitution|court|v\.|versus|cap\.|chapter|zimlii|veritas)\b/i.test(
    label,
  );
}

function slimCitation(c: AiCitation): AiCitation {
  return {
    citationLabel: c.citationLabel,
    title: c.title,
    sourceUrl: c.sourceUrl ?? null,
  };
}

function citationsForUi(intent: string, citations: AiCitation[]): AiCitation[] {
  if (intent !== "legal") return [];
  return citations.filter(isAuthorityCitation).slice(0, 6).map(slimCitation);
}

/**
 * Conversational ask with optional Zimbabwe grounding. Greetings never 404.
 */
export async function aiLegalAsk(input: {
  firmId: string;
  userId: string;
  question: string;
  conversationId?: string | null;
  attachmentContext?: string | null;
}): Promise<LegalAskResult> {
  const question = input.question.trim();
  if (!question) {
    throw new Error("question is required");
  }

  const intent = classifyChatIntent(question);
  const attachmentContext = input.attachmentContext?.trim() || "";

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

  const storedUser = attachmentContext
    ? `${question}\n\n[Attached files]\n${attachmentContext.slice(0, 20_000)}`
    : question;

  const userMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "user",
    content: storedUser,
  });

  const settings = await getAiSettings(input.firmId);
  const webEnabled = Boolean(settings?.webLookupEnabled) && intent === "legal";
  const maxOutputTokens = Math.min(
    4096,
    Math.max(256, settings?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
  );

  let retrieval: RetrieveLegalContextResult = {
    hits: [],
    citations: [],
    retrievalMeta: {
      query: question,
      embeddingsModel: "",
      topK: 6,
      candidateK: 12,
      minSimilarity: 0.42,
      candidateCount: 0,
      hitCount: 0,
      empty: true,
      emptyReason: intent === "chat" ? "skipped_for_chat" : "not_attempted",
      latencyMs: 0,
    },
  };

  if (intent !== "chat") {
    try {
      retrieval = await retrieveLegalContext({
        firmIdForProvider: input.firmId,
        query: question,
      });
    } catch {
      /* chat still proceeds without RAG */
    }
  }

  const web = await lookupTrustedWeb({
    query: question,
    enabled: webEnabled,
  });

  const mergeMeta = {
    ...retrieval.retrievalMeta,
    webLookupEnabled: web.enabled,
    webHitCount: web.hits.length,
    webErrorCode: web.errorCode ?? null,
    intent,
  };

  const localConf = confidenceFromHits(
    retrieval.hits.length,
    retrieval.hits[0]?.score ?? null,
  );
  const conf =
    intent === "chat"
      ? { label: "high" as const, score: 0.9 }
      : retrieval.hits.length === 0
        ? { label: "medium" as const, score: 0.5 }
        : localConf;

  const rawCitations: AiCitation[] = [...retrieval.citations, ...web.citations];
  const citations = citationsForUi(intent, rawCitations);
  const contextBlock =
    retrieval.hits.length > 0
      ? buildContextBlock(retrieval)
      : "(No matching pack excerpt. Answer from general knowledge; do not invent Zimbabwe authorities.)";
  const webBlock = formatWebLookupBlock(web.hits);

  let provider;
  try {
    await assertAiSoftBudget(input.firmId);
    provider = await getProvider(input.firmId, { mode: "legal_research" });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "budget_exceeded") {
      throw err;
    }
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    const fallback =
      "I cannot reach the language model right now. Check the API key under Settings → AI, then try again.";
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: fallback,
      confidence: 0.2,
      citationsJson: [],
      retrievalMetaJson: {
        ...mergeMeta,
        notFound: false,
        generatorError: errorCode,
        confidenceLabel: "low",
        showCitations: false,
        webLookup: webMeta(web),
      },
    });
    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: settings?.providerDefault ?? "gemini",
      model: retrieval.retrievalMeta.embeddingsModel,
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
      citations: [],
      retrievalMeta: { ...mergeMeta, showCitations: false },
      notFound: false,
      disclaimer: LEGAL_DISCLAIMER,
      webLookup: webMeta(web),
    };
  }

  const history = await loadChatHistory({
    firmId: input.firmId,
    conversationId,
    limit: 12,
  });

  const grounding =
    intent === "chat"
      ? "This turn is ordinary conversation. Reply naturally. Do not add citations or a disclaimer."
      : `Optional Zimbabwe pack excerpts (use if relevant; do not invent citations):\n${contextBlock}\n\nOptional web excerpts (unverified):\n${webBlock || "(none)"}`;

  const attachmentBlock = attachmentContext
    ? `\n\nUser attached file text (OCR or extracted). Use it when answering or converting to Word:\n${attachmentContext.slice(0, 24_000)}`
    : "";

  let answerText: string;
  let chatLatency = 0;
  try {
    const chat = await provider.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.slice(0, -1),
        {
          role: "user",
          content: `${question}${attachmentBlock}\n\n${grounding}`,
        },
      ],
      { temperature: intent === "chat" ? 0.6 : 0.3, maxOutputTokens },
    );
    answerText = chat.text.trim();
    chatLatency = chat.latencyMs;
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    const fallback = "The model did not finish that reply. Please try again in a moment.";
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: fallback,
      confidence: 0.2,
      citationsJson: [],
      retrievalMetaJson: {
        ...mergeMeta,
        notFound: false,
        generatorError: errorCode,
        confidenceLabel: "low",
        showCitations: false,
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
      citations: [],
      retrievalMeta: { ...mergeMeta, showCitations: false },
      notFound: false,
      disclaimer: LEGAL_DISCLAIMER,
      webLookup: webMeta(web),
    };
  }

  const document = await maybePackChatDocument({
    firmId: input.firmId,
    userId: input.userId,
    question,
    answerText,
    attachmentContext,
  });

  const showCitations = citations.length > 0 && intent === "legal";
  const assistantMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "assistant",
    content: answerText,
    confidence: conf.score,
    citationsJson: showCitations ? citations : [],
    retrievalMetaJson: {
      ...mergeMeta,
      notFound: false,
      confidenceLabel: conf.label,
      chatLatencyMs: chatLatency,
      showCitations,
      webLookup: webMeta(web),
      document,
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
    citations: showCitations ? citations : [],
    retrievalMeta: { ...mergeMeta, showCitations },
    notFound: false,
    disclaimer: LEGAL_DISCLAIMER,
    document,
    webLookup: webMeta(web),
  };
}
