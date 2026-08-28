import "server-only";

import { getProvider } from "@/lib/ai/providers";
import { assertAiSoftBudget } from "@/lib/ai/budget";
import { loadChatHistory } from "@/lib/ai/chat-history";
import {
  isPromiseOnlyDraft,
  maybePackChatDocument,
} from "@/lib/ai/drafting/maybe-pack";
import { classifyChatIntent, wantsDocumentExport } from "@/lib/ai/intent";
import {
  retrieveLegalContext,
  type RetrieveLegalContextResult,
} from "@/lib/ai/rag/retrieve";
import { verifyGroundedAnswer, type VerifyGrounding } from "@/lib/ai/rag/verify";
import {
  buildSourceTiers,
  type ExploreSource,
  type ResearchStatus,
  type SourceTiers,
} from "@/lib/ai/citations/tiers";
import {
  formatWebLookupBlock,
  lookupTrustedWeb,
  type WebLookupResult,
} from "@/lib/ai/web/trusted-lookup";
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
  CHAT_SYSTEM_PROMPT,
  DOCUMENT_PROMPT_ADDENDUM,
} from "@/lib/ai/rag/legal-research-prompt";

export const LEGAL_DISCLAIMER =
  "Assistive only. Verify primary sources before relying on this answer.";

export type ConfidenceLabel = "high" | "medium" | "low";

export type LegalAskDocument = {
  id: string;
  fileName: string;
  font: string;
  lineSpacing: number;
};

const EMPTY_TIERS: SourceTiers = { primary: [], supporting: [], furtherReading: [] };
const EMPTY_RESEARCH_STATUS: ResearchStatus = {
  webConsulted: false,
  webUnavailable: false,
  currentnessChecked: false,
  currentnessUnverified: true,
  fabricatedRejected: false,
  verifiedPrimary: false,
};

export type LegalAskResult = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  answer: string;
  confidence: ConfidenceLabel;
  confidenceScore: number;
  citations: AiCitation[];
  grounding: VerifyGrounding | "skipped";
  sourceTiers: SourceTiers;
  exploreSources: ExploreSource[];
  retrievalMeta: RetrieveLegalContextResult["retrievalMeta"] & {
    intent?: string;
    showCitations?: boolean;
    chatLatencyMs?: number;
    grounding?: string;
    researchStatus?: ResearchStatus;
  };
  notFound: boolean;
  disclaimer: string;
  document?: LegalAskDocument | null;
};

type ChatQuality = "budget" | "standard" | "capable" | "max";

function estimateChatQuality(
  question: string,
  intent: string,
  wantDoc: boolean,
): ChatQuality {
  const words = question.split(/\s+/).filter(Boolean).length;
  if (wantDoc || words > 140) return "capable";
  if (intent === "chat") return "budget";
  return "standard";
}

function priorSubstantialAssistantDraft(
  history: Array<{ role: string; content: string }>,
): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    if (m.role !== "assistant") continue;
    if (isPromiseOnlyDraft(m.content)) continue;
    if (m.content.trim().length >= 200) return m.content;
  }
  return null;
}

function extractDocumentOutline(body: string): string[] {
  const titles: string[] = [];
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const md = line.match(/^#{1,4}\s+(.{3,60})$/);
    if (md && !titles.includes(md[1])) titles.push(md[1]);
    if (titles.length >= 6) break;
  }
  return titles;
}

function summarizeDocumentForChat(
  body: string,
  doc: { fileName: string; font: string; lineSpacing: number } | null,
): string {
  const outline = extractDocumentOutline(body);
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const approxPages = Math.max(1, Math.round(wordCount / 500));
  const lead = `I've drafted a ${approxPages}-page document for you.`;
  const covers =
    outline.length > 0
      ? `\n\nIt covers:\n${outline.map((t) => `- ${t}`).join("\n")}`
      : "";
  const style = doc
    ? `\n\nFormatted in ${doc.font}, ${doc.lineSpacing} line spacing. Download it below and edit bracketed placeholders before sending.`
    : "";
  return `${lead}${covers}${style}`;
}

function buildOptionalContext(retrieval: RetrieveLegalContextResult): string {
  if (retrieval.hits.length === 0) return "";
  return retrieval.hits
    .map((h, i) => `[${i + 1}] ${h.citationLabel}\n${h.text}`)
    .join("\n\n---\n\n");
}

/** Ground-truth hint about what retrieval actually found — never shown to the user verbatim. */
function buildGroundingHint(
  intent: string,
  retrieval: RetrieveLegalContextResult,
  web: WebLookupResult,
): string {
  if (intent === "chat") return "";
  const packHits = retrieval.hits.length;
  const webHits = web.hits.length;
  if (packHits === 0 && webHits === 0) {
    return (
      "[Research status: the local knowledge base and a live web search found nothing " +
      "relevant this turn. If your answer depends on a specific Act, section, or case, say " +
      "plainly that you found no verifiable source for that point, then give your best " +
      "general-knowledge answer.]"
    );
  }
  return (
    `[Research status: local knowledge base hits=${packHits}, live web hits=${webHits}. ` +
    "Only name authorities that are actually supported by the excerpts/results provided " +
    "below — do not add others from memory.]"
  );
}

/**
 * LexZim legal chat: history + local knowledge base + live web search + model,
 * with a verify pass gating what reaches "Show sources".
 */
export async function aiLegalAsk(input: {
  firmId: string;
  userId: string;
  question: string;
  conversationId?: string | null;
  attachmentContext?: string | null;
  skipCreateUserMessage?: boolean;
  existingUserMessageId?: string;
}): Promise<LegalAskResult> {
  const question = input.question.trim();
  if (!question) throw new Error("question is required");

  const intent = classifyChatIntent(question);
  const wantDoc = wantsDocumentExport(question) || intent === "document";
  const attachmentContext = input.attachmentContext?.trim() || "";
  const skipUser = Boolean(input.skipCreateUserMessage);

  let conversationId = input.conversationId?.trim() || null;
  if (skipUser && !conversationId) throw new Error("conversation_required");

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

  const userMessage = skipUser
    ? { id: input.existingUserMessageId?.trim() || "existing-user" }
    : await createMessage({
        firmId: input.firmId,
        conversationId,
        role: "user",
        content: storedUser,
      });

  const settings = await getAiSettings(input.firmId);
  const maxOutputTokens = Math.min(
    8192,
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

  let web: WebLookupResult = {
    enabled: false,
    attempted: false,
    hits: [],
    citations: [],
    answerText: "",
    latencyMs: 0,
  };

  if (intent !== "chat") {
    try {
      retrieval = await retrieveLegalContext({
        firmIdForProvider: input.firmId,
        query: question,
      });
    } catch {
      /* proceed without pack */
    }

    try {
      web = await lookupTrustedWeb({
        firmId: input.firmId,
        query: question,
        enabled: settings?.webLookupEnabled !== false,
      });
    } catch {
      /* proceed without live web results */
    }
  }

  const mergeMeta = { ...retrieval.retrievalMeta, intent };

  let provider;
  try {
    await assertAiSoftBudget(input.firmId);
    provider = await getProvider(input.firmId, { mode: "legal_research" });
  } catch (err) {
    const errorCode =
      err && typeof err === "object" && "code" in err && err.code === "budget_exceeded"
        ? "budget_exceeded"
        : err instanceof AiProviderError
          ? err.code
          : "provider_error";
    const fallback =
      "I cannot reach the language model right now. Check Settings → AI, then try again.";
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: fallback,
      confidence: 0.2,
      citationsJson: [],
      retrievalMetaJson: { ...mergeMeta, generatorError: errorCode, grounding: "skipped" },
    });
    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answer: fallback,
      confidence: "low",
      confidenceScore: 0.2,
      citations: [],
      grounding: "skipped",
      sourceTiers: EMPTY_TIERS,
      exploreSources: [],
      retrievalMeta: mergeMeta,
      notFound: false,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }

  const history = await loadChatHistory({
    firmId: input.firmId,
    conversationId,
    limit: 12,
  });
  const priorDraft = priorSubstantialAssistantDraft(history);
  const packContext = intent === "chat" ? "" : buildOptionalContext(retrieval);
  const webContextBlock = intent === "chat" ? "" : formatWebLookupBlock(web.hits);
  const groundingHint = buildGroundingHint(intent, retrieval, web);
  const systemPrompt = wantDoc
    ? `${CHAT_SYSTEM_PROMPT}\n\n${DOCUMENT_PROMPT_ADDENDUM}`
    : CHAT_SYSTEM_PROMPT;
  const attachmentBlock = attachmentContext
    ? `\n\n${attachmentContext.slice(0, 24_000)}`
    : "";

  let answerText: string;
  let chatLatency = 0;
  try {
    const chat = await provider.chat(
      [
        { role: "system", content: systemPrompt },
        ...history.slice(0, -1),
        {
          role: "user",
          content:
            `${question}${attachmentBlock}` +
            (packContext ? `\n\n[Optional firm pack excerpts]\n${packContext}` : "") +
            (webContextBlock ? `\n\n${webContextBlock}` : "") +
            (groundingHint ? `\n\n${groundingHint}` : ""),
        },
      ],
      {
        temperature: 0.7,
        maxOutputTokens,
        quality: estimateChatQuality(question, intent, wantDoc),
      },
    );
    answerText = chat.text.trim();
    chatLatency = chat.latencyMs;

    if (wantDoc && isPromiseOnlyDraft(answerText)) {
      const forced = await provider.chat(
        [
          { role: "system", content: systemPrompt },
          ...history.slice(0, -1),
          ...(priorDraft
            ? [{ role: "assistant" as const, content: priorDraft.slice(0, 8000) }]
            : []),
          { role: "user", content: question },
        ],
        {
          temperature: 0.3,
          maxOutputTokens: Math.max(4096, maxOutputTokens),
          quality: "capable",
        },
      );
      answerText = forced.text.trim() || answerText;
      chatLatency += forced.latencyMs;
    }
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    const fallback = "The model did not finish that reply. Please try again.";
    const assistantMessage = await createMessage({
      firmId: input.firmId,
      conversationId,
      role: "assistant",
      content: fallback,
      confidence: 0.2,
      citationsJson: [],
      retrievalMetaJson: { ...mergeMeta, generatorError: errorCode, grounding: "skipped" },
    });
    await recordAiUsageEvent({
      firmId: input.firmId,
      userId: input.userId,
      provider: provider.id,
      model: provider.defaultChatModel,
      mode: "legal_research",
      success: false,
      errorCode,
      latencyMs: retrieval.retrievalMeta.latencyMs + chatLatency,
    });
    return {
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answer: fallback,
      confidence: "low",
      confidenceScore: 0.2,
      citations: [],
      grounding: "skipped",
      sourceTiers: EMPTY_TIERS,
      exploreSources: [],
      retrievalMeta: mergeMeta,
      notFound: false,
      disclaimer: LEGAL_DISCLAIMER,
    };
  }

  const document = await maybePackChatDocument({
    firmId: input.firmId,
    userId: input.userId,
    question,
    answerText,
    attachmentContext,
    priorDraftText: priorDraft,
  });

  const finalAnswer =
    wantDoc && document
      ? summarizeDocumentForChat(answerText, document)
      : answerText;

  // Verify + tier sources for legal and document intents; plain chat skips grounding entirely.
  let grounding: VerifyGrounding | "skipped" = "skipped";
  let sourceTiers: SourceTiers = EMPTY_TIERS;
  let researchStatus: ResearchStatus = EMPTY_RESEARCH_STATUS;
  let confidenceScore: number;

  if (intent === "chat") {
    confidenceScore = 0.9;
  } else {
    const verified = verifyGroundedAnswer({
      answer: answerText,
      question,
      retrievedChunks: retrieval.hits.map((h) => ({
        text: h.text,
        citationLabel: h.citationLabel,
      })),
      webExcerpts: web.hits.map((h) => ({
        text: h.snippet,
        citationLabel: h.siteLabel ? `${h.siteLabel}: ${h.title}` : h.title,
      })),
      citations: [...retrieval.citations, ...web.citations],
    });
    grounding = verified.grounding;
    confidenceScore = verified.confidence;
    const built = buildSourceTiers({
      verified,
      question,
      answer: answerText,
      webAttempted: web.attempted,
      webHitCount: web.hits.length,
    });
    sourceTiers = built.tiers;
    researchStatus = built.researchStatus;
  }

  const confidenceLabel: ConfidenceLabel =
    confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.45 ? "medium" : "low";
  const showCitations =
    intent !== "chat" &&
    (sourceTiers.primary.length > 0 || sourceTiers.supporting.length > 0);
  const notFound =
    intent !== "chat" && retrieval.hits.length === 0 && web.hits.length === 0;

  const assistantMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "assistant",
    content: finalAnswer,
    confidence: confidenceScore,
    citationsJson: showCitations ? sourceTiers.primary : [],
    retrievalMetaJson: {
      ...mergeMeta,
      confidenceLabel,
      chatLatencyMs: chatLatency,
      showCitations,
      grounding,
      sourceTiers,
      researchStatus,
      document,
      wantDoc,
      notFound,
      webLookup: {
        enabled: web.enabled,
        attempted: web.attempted,
        hitCount: web.hits.length,
        errorCode: web.errorCode,
        message: web.message,
        latencyMs: web.latencyMs,
      },
    },
  });

  await recordAiUsageEvent({
    firmId: input.firmId,
    userId: input.userId,
    provider: provider.id,
    model: provider.defaultChatModel,
    mode: "legal_research",
    success: true,
    latencyMs: retrieval.retrievalMeta.latencyMs + chatLatency,
  });

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    answer: finalAnswer,
    confidence: confidenceLabel,
    confidenceScore,
    citations: showCitations ? sourceTiers.primary : [],
    grounding,
    sourceTiers,
    exploreSources: sourceTiers.furtherReading,
    retrievalMeta: {
      ...mergeMeta,
      chatLatencyMs: chatLatency,
      showCitations,
      grounding,
      researchStatus,
    },
    notFound,
    disclaimer: LEGAL_DISCLAIMER,
    document,
  };
}
