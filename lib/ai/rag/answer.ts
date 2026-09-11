import "server-only";

import {
  ATTACH_CONTEXT_FOR_MODEL,
  ATTACH_CONTEXT_FOR_STORE,
} from "@/lib/ai/attachments";
import { chatWithProviderFailover } from "@/lib/ai/chat-router";
import { loadChatHistory } from "@/lib/ai/chat-history";
import { repairRestartedNumberedLists } from "@/lib/ai/chat-format";
import {
  isSubstantialDocumentDraft,
  maybePackChatDocument,
} from "@/lib/ai/drafting/maybe-pack";
import { classifyChatIntent, wantsDocumentExport, wantsExplicitWordFile, isWordExportFollowup } from "@/lib/ai/intent";
import {
  retrieveLegalContext,
  type RetrieveLegalContextResult,
} from "@/lib/ai/rag/retrieve";
import { buildSourcePanel, type SourceCandidate } from "@/lib/ai/rag/source-panel";
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
  listMessages,
} from "@/lib/repos/ai-conversations";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  getAiSettings,
} from "@/lib/repos/ai-settings";
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";
import { AiProviderError } from "@/lib/ai/errors";
import type { VerifyGrounding } from "@/lib/ai/rag/verify";
import type {
  ExploreSource,
  ResearchStatus,
  SourceTiers,
} from "@/lib/ai/citations/tiers";
import { formatFollowUpForChat, splitDraftFromChat } from "@/lib/ai/drafting/split-draft";
import { formatLongDate } from "@/lib/format/dates";
import {
  CHAT_SYSTEM_PROMPT,
  DOCUMENT_INTAKE_ADDENDUM,
  FORCE_FULL_DRAFT_SYSTEM,
  WORD_EXPORT_ADDENDUM,
} from "@/lib/ai/rag/legal-research-prompt";

export const LEGAL_DISCLAIMER = "";

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
    failoverNotice?: string | null;
    usedProvider?: string;
    intendedProvider?: string;
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

function loadPriorDocumentDraft(
  rows: Array<{ role: string; content: string; retrievalMetaJson?: Record<string, unknown> | null }>,
): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const m = rows[i];
    if (m.role !== "assistant") continue;
    const stored = m.retrievalMetaJson?.draftBody;
    if (typeof stored === "string" && isSubstantialDocumentDraft(stored)) return stored;
    const content = m.content.trim();
    if (isSubstantialDocumentDraft(content)) return m.content;
  }
  return null;
}

function buildKbContext(retrieval: RetrieveLegalContextResult): string {
  if (retrieval.hits.length === 0) return "";
  return retrieval.hits
    .map((h, i) => `[${i + 1}] ${h.citationLabel}\n${h.text}`)
    .join("\n\n---\n\n");
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
  followUp?: string,
): string {
  const outline = extractDocumentOutline(body);
  const lead = `The Word file is ready: ${doc?.fileName || "draft.docx"}.`;
  const covers =
    outline.length > 0
      ? `\n\nIt contains:\n${outline.map((t) => `- ${t}`).join("\n")}`
      : "";
  const q = followUp?.trim()
    ? `\n\nThe notes below are for you in this chat. They are not inside the Word file.\n\n${formatFollowUpForChat(followUp)}`
    : "";
  return `${lead}${covers}${q}`;
}

/**
 * LexZim legal chat v2: Claude-first failover, web + KB on legal questions, filtered source panels.
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
  const wantWordFile = wantsExplicitWordFile(question);
  const runResearch = intent === "legal";
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
    ? `${question}\n\n[Attached files]\n${attachmentContext.slice(0, ATTACH_CONTEXT_FOR_STORE)}`
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
      emptyReason: runResearch ? "not_attempted" : "skipped_for_chat",
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

  if (runResearch) {
    try {
      retrieval = await retrieveLegalContext({
        firmIdForProvider: input.firmId,
        query: question,
      });
    } catch {
      /* proceed without KB */
    }

    try {
      web = await lookupTrustedWeb({
        firmId: input.firmId,
        query: question,
        enabled: settings?.webLookupEnabled !== false,
      });
    } catch {
      /* proceed without web */
    }
  }

  const mergeMeta = { ...retrieval.retrievalMeta, intent };

  const history = await loadChatHistory({
    firmId: input.firmId,
    conversationId,
    limit: 16,
  });
  const threadMessages = await listMessages(input.firmId, conversationId);
  const priorDraft = loadPriorDocumentDraft(threadMessages);
  const packablePrior = Boolean(priorDraft && isSubstantialDocumentDraft(priorDraft));
  const wordExportFollowup = Boolean(
    wantWordFile && packablePrior && isWordExportFollowup(question),
  );

  let systemPrompt = CHAT_SYSTEM_PROMPT;
  if (wantWordFile && !wordExportFollowup) {
    systemPrompt = `${CHAT_SYSTEM_PROMPT}\n\n${WORD_EXPORT_ADDENDUM}\n\nToday's date is ${formatLongDate()}. Use it as the document date unless the user specified another date.`;
  } else if (wantDoc && !wantWordFile) {
    systemPrompt = `${CHAT_SYSTEM_PROMPT}\n\n${DOCUMENT_INTAKE_ADDENDUM}`;
  }

  const packContext = runResearch ? buildKbContext(retrieval) : "";
  const webContextBlock = runResearch ? formatWebLookupBlock(web.hits) : "";
  const attachmentBlock = attachmentContext
    ? `\n\n${attachmentContext.slice(0, ATTACH_CONTEXT_FOR_MODEL)}`
    : "";

  let answerText: string;
  let chatLatency = 0;
  let usedProvider = "claude";
  let usedModel = "";
  let failoverNotice: string | null = null;
  let chatProvider;

  if (wordExportFollowup) {
    answerText = priorDraft!;
  } else {
  try {
    const chat = await chatWithProviderFailover(
      input.firmId,
      [
        { role: "system", content: systemPrompt },
        ...history.slice(0, -1),
        {
          role: "user",
          content:
            `${question}${attachmentBlock}` +
            (packContext ? `\n\n[Zimbabwe knowledge pack excerpts]\n${packContext}` : "") +
            (webContextBlock ? `\n\n${webContextBlock}` : ""),
        },
      ],
      {
        temperature: wantDoc ? 0.2 : 0.25,
        maxOutputTokens,
        quality: estimateChatQuality(question, intent, wantDoc),
      },
    );
    answerText = chat.result.text.trim();
    chatLatency = chat.result.latencyMs;
    usedProvider = chat.meta.usedProvider;
    usedModel = chat.meta.usedModel;
    failoverNotice = chat.meta.failoverNotice;
    chatProvider = chat.provider;

    if (wantWordFile && !packablePrior && !isSubstantialDocumentDraft(answerText)) {
      const forced = await chatWithProviderFailover(
        input.firmId,
        [
          { role: "system", content: `${FORCE_FULL_DRAFT_SYSTEM}\n\nToday's date is ${formatLongDate()}.` },
          ...history.slice(0, -1),
          ...(priorDraft
            ? [{ role: "assistant" as const, content: priorDraft.slice(0, 8000) }]
            : []),
          {
            role: "user",
            content: `${question}\n\nOutput the complete document only. No chat preamble.`,
          },
        ],
        {
          temperature: 0.2,
          maxOutputTokens: Math.max(4096, maxOutputTokens),
          quality: "max",
        },
      );
      chatLatency += forced.result.latencyMs;
      const forcedText = forced.result.text.trim();
      if (isSubstantialDocumentDraft(forcedText)) {
        answerText = forcedText;
        usedProvider = forced.meta.usedProvider;
        usedModel = forced.meta.usedModel;
        if (forced.meta.failoverNotice) failoverNotice = forced.meta.failoverNotice;
        chatProvider = forced.provider;
      } else {
        const retry = await chatWithProviderFailover(
          input.firmId,
          [
            { role: "system", content: systemPrompt },
            ...history.slice(0, -1),
            { role: "user", content: question },
          ],
          {
            temperature: 0.3,
            maxOutputTokens: Math.max(4096, maxOutputTokens),
            quality: "max",
          },
        );
        chatLatency += retry.result.latencyMs;
        const retryText = retry.result.text.trim();
        if (isSubstantialDocumentDraft(retryText)) answerText = retryText;
        else if (retryText.length > answerText.length) answerText = retryText;
        usedProvider = retry.meta.usedProvider;
        usedModel = retry.meta.usedModel;
        if (retry.meta.failoverNotice) failoverNotice = retry.meta.failoverNotice;
        chatProvider = retry.provider;
      }
    }
  } catch (err) {
    const errorCode = err instanceof AiProviderError ? err.code : "provider_error";
    const fallback =
      err instanceof Error && err.message
        ? err.message
        : "The model did not finish that reply. Check Settings → AI and Railway keys.";
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
      disclaimer: "",
    };
  }
  }

  answerText = repairRestartedNumberedLists(answerText);
  const split = splitDraftFromChat(answerText);
  const draftForPack = split.draft || answerText;

  const document = wantWordFile
    ? await maybePackChatDocument({
        firmId: input.firmId,
        userId: input.userId,
        question,
        answerText: draftForPack,
        attachmentContext,
        priorDraftText: priorDraft,
      })
    : null;

  const finalAnswer =
    wantWordFile && document
      ? summarizeDocumentForChat(draftForPack, document, split.followUp)
      : answerText;

  let sourceTiers: SourceTiers = EMPTY_TIERS;
  let researchStatus: ResearchStatus = EMPTY_RESEARCH_STATUS;
  let showCitations = false;
  let confidenceScore = 0.9;

  if (runResearch) {
    const candidates: SourceCandidate[] = [];
    for (const h of retrieval.hits) {
      candidates.push({
        citation: {
          citationLabel: h.citationLabel,
          title: h.title,
          excerpt: h.text.slice(0, 240),
          sourceUrl: h.sourceUrl,
          verified: true,
          sourceKind: "primary",
        },
        chunkText: h.text,
        fromKb: true,
      });
    }
    for (const c of web.citations) {
      const hit = web.hits.find((w) => w.url === c.sourceUrl);
      candidates.push({
        citation: c,
        chunkText: hit?.snippet ?? c.excerpt,
        fromKb: false,
      });
    }

    const built = buildSourcePanel({
      question,
      answer: answerText,
      candidates,
      webAttempted: web.attempted,
      webHitCount: web.hits.length,
    });
    sourceTiers = built.tiers;
    researchStatus = built.researchStatus;
    showCitations =
      sourceTiers.primary.length > 0 ||
      sourceTiers.supporting.length > 0 ||
      sourceTiers.furtherReading.length > 0;
    confidenceScore =
      sourceTiers.primary.length > 0 ? 0.85 : web.hits.length > 0 ? 0.65 : 0.55;
  }

  const confidenceLabel: ConfidenceLabel =
    confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.45 ? "medium" : "low";
  const notFound =
    runResearch && retrieval.hits.length === 0 && web.hits.length === 0;

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
      grounding: runResearch ? "weak" : "skipped",
      sourceTiers,
      researchStatus,
      document,
      draftBody: document ? draftForPack : undefined,
      wantDoc,
      notFound,
      failoverNotice,
      usedProvider,
      intendedProvider: "claude",
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
    provider: usedProvider,
    model: usedModel || chatProvider?.defaultChatModel || "export-pack",
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
    grounding: runResearch ? "weak" : "skipped",
    sourceTiers,
    exploreSources: sourceTiers.furtherReading,
    retrievalMeta: {
      ...mergeMeta,
      chatLatencyMs: chatLatency,
      showCitations,
      grounding: runResearch ? "weak" : "skipped",
      researchStatus,
      failoverNotice,
      usedProvider,
      intendedProvider: "claude",
    },
    notFound,
    disclaimer: "",
    document,
  };
}
