import "server-only";

import { getProvider } from "@/lib/ai/providers";
import { loadChatHistory } from "@/lib/ai/chat-history";
import {
  isPromiseOnlyDraft,
  maybePackChatDocument,
} from "@/lib/ai/drafting/maybe-pack";
import { wantsDocumentExport } from "@/lib/ai/intent";
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
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/rag/legal-research-prompt";
import type { VerifyGrounding } from "@/lib/ai/rag/verify";
import type {
  ExploreSource,
  ResearchStatus,
  SourceTiers,
} from "@/lib/ai/citations/tiers";

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
  currentnessUnverified: false,
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
  retrievalMeta: {
    query: string;
    intent: string;
    hitCount: number;
    empty: boolean;
    emptyReason: string;
    chatLatencyMs?: number;
    grounding?: string;
    researchStatus?: ResearchStatus;
    showCitations?: boolean;
  };
  notFound: boolean;
  disclaimer: string;
  document?: LegalAskDocument | null;
};

type ChatQuality = "budget" | "standard" | "capable" | "max";

function estimateChatQuality(question: string, wantDoc: boolean): ChatQuality {
  const words = question.split(/\s+/).filter(Boolean).length;
  if (wantDoc || words > 140) return "capable";
  if (words <= 8) return "budget";
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
    ? `\n\nFormatted in ${doc.font}, ${doc.lineSpacing} line spacing. Download it below.`
    : "";
  return `${lead}${covers}${style}`;
}

/**
 * LexZim chat: multi-turn history + LLM reply. No RAG, web lookup, or verify rules.
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

  const wantDoc = wantsDocumentExport(question);
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

  const mergeMeta = {
    query: question,
    intent: "chat",
    hitCount: 0,
    empty: true,
    emptyReason: "basic_mode",
  };

  let provider;
  try {
    provider = await getProvider(input.firmId, { mode: "legal_research" });
  } catch (err) {
    const errorCode =
      err instanceof AiProviderError ? err.code : "provider_error";
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
      disclaimer: "",
    };
  }

  const history = await loadChatHistory({
    firmId: input.firmId,
    conversationId,
    limit: 12,
  });
  const priorDraft = priorSubstantialAssistantDraft(history);
  const attachmentBlock = attachmentContext
    ? `\n\n${attachmentContext.slice(0, 24_000)}`
    : "";

  let answerText: string;
  let chatLatency = 0;
  try {
    const chat = await provider.chat(
      [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...history.slice(0, -1),
        {
          role: "user",
          content: `${question}${attachmentBlock}`,
        },
      ],
      {
        temperature: 0.7,
        maxOutputTokens,
        quality: estimateChatQuality(question, wantDoc),
      },
    );
    answerText = chat.text.trim();
    chatLatency = chat.latencyMs;

    if (wantDoc && isPromiseOnlyDraft(answerText)) {
      const forced = await provider.chat(
        [
          { role: "system", content: CHAT_SYSTEM_PROMPT },
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
      latencyMs: chatLatency,
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

  const document = await maybePackChatDocument({
    firmId: input.firmId,
    userId: input.userId,
    question,
    answerText,
    attachmentContext,
    priorDraftText: priorDraft,
  });

  const finalAnswer =
    wantDoc && document ? summarizeDocumentForChat(answerText, document) : answerText;

  const assistantMessage = await createMessage({
    firmId: input.firmId,
    conversationId,
    role: "assistant",
    content: finalAnswer,
    confidence: 0.9,
    citationsJson: [],
    retrievalMetaJson: {
      ...mergeMeta,
      confidenceLabel: "high",
      chatLatencyMs: chatLatency,
      showCitations: false,
      grounding: "skipped",
      sourceTiers: EMPTY_TIERS,
      researchStatus: EMPTY_RESEARCH_STATUS,
      document,
      wantDoc,
      notFound: false,
    },
  });

  await recordAiUsageEvent({
    firmId: input.firmId,
    userId: input.userId,
    provider: provider.id,
    model: provider.defaultChatModel,
    mode: "legal_research",
    success: true,
    latencyMs: chatLatency,
  });

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    answer: finalAnswer,
    confidence: "high",
    confidenceScore: 0.9,
    citations: [],
    grounding: "skipped",
    sourceTiers: EMPTY_TIERS,
    exploreSources: [],
    retrievalMeta: {
      ...mergeMeta,
      chatLatencyMs: chatLatency,
      showCitations: false,
      grounding: "skipped",
      researchStatus: EMPTY_RESEARCH_STATUS,
    },
    notFound: false,
    disclaimer: "",
    document,
  };
}
