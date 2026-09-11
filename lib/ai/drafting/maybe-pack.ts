import "server-only";

import { putAiDraft } from "@/lib/ai/draft-store";
import { packInstructionDocx } from "@/lib/ai/drafting/instruction-docx";
import { draftDisplayTitle } from "@/lib/ai/drafting/draft-file-name";
import { HOUSE_STYLE_FONT, HOUSE_STYLE_LINE_SPACING } from "@/lib/ai/drafting/house-style";
import { repairRestartedNumberedLists } from "@/lib/ai/chat-format";
import {
  isMetaChatSummary,
  isPromiseOnlyDraft,
  isSubstantialDocumentDraft,
} from "@/lib/ai/drafting/draft-detect";
import { splitDraftFromChat } from "@/lib/ai/drafting/split-draft";
import { wantsExplicitWordFile } from "@/lib/ai/intent";

export type PackedChatDocument = {
  id: string;
  fileName: string;
  font: string;
  lineSpacing: number;
};

export {
  isExportInstructionText,
  isMetaChatSummary,
  isPromiseOnlyDraft,
  isSubstantialDocumentDraft,
} from "@/lib/ai/drafting/draft-detect";

function pickBestDraftBody(answerText: string, priorDraftText?: string | null): string {
  const current = answerText.trim();
  const prior = priorDraftText?.trim() || "";
  // Prefer a real instrument already in the thread over a short "Word is ready" reply.
  if (isMetaChatSummary(current) && isSubstantialDocumentDraft(prior)) return prior;
  if (isSubstantialDocumentDraft(current) && isSubstantialDocumentDraft(prior)) {
    // Prefer the longer polished draft when both look real (follow-up packs).
    return current.length >= prior.length * 0.85 ? current : prior;
  }
  if (isSubstantialDocumentDraft(current)) return current;
  if (isSubstantialDocumentDraft(prior)) return prior;
  if (current && !isPromiseOnlyDraft(current) && !isMetaChatSummary(current) && current.length >= 200) {
    return current;
  }
  if (prior && !isPromiseOnlyDraft(prior) && !isMetaChatSummary(prior) && prior.length >= 200) {
    return prior;
  }
  if (current.length >= prior.length) return current;
  return prior || current;
}

/** Pack a Word file when the user asked for a document or conversion. */
export async function maybePackChatDocument(input: {
  firmId: string;
  userId: string;
  question: string;
  answerText: string;
  attachmentContext?: string | null;
  /** Prior assistant draft in the same thread (for “yes send the Word file”). */
  priorDraftText?: string | null;
  /** Caller already decided packing is required (e.g. revision with no questions). */
  forcePack?: boolean;
}): Promise<PackedChatDocument | null> {
  const q = input.question;
  const attached = Boolean(input.attachmentContext?.trim());
  const asked =
    input.forcePack ||
    wantsExplicitWordFile(q) ||
    (attached &&
      /\b(word|docx|document|letter|convert|times new roman|line spacing|correct|fix|edit|revise|format|spacing|font|grammatical|proper legal)\b/i.test(
        q,
      ));
  if (!asked) return null;

  const split = splitDraftFromChat(pickBestDraftBody(input.answerText, input.priorDraftText));
  const body = repairRestartedNumberedLists(split.draft);
  if (!body.trim() || !isSubstantialDocumentDraft(body)) return null;

  try {
    const packed = await packInstructionDocx({
      title: draftDisplayTitle({ question: q, body }),
      body,
      question:
        q.includes("trebuchet") || q.includes("times new roman")
          ? q
          : `${q}\n\nUse Trebuchet MS 12pt 1.5 spacing.`,
    });
    const stored = await putAiDraft({
      firmId: input.firmId,
      userId: input.userId,
      fileName: packed.fileName,
      bytes: packed.bytes,
    });
    return {
      id: stored.id,
      fileName: stored.fileName,
      font: packed.font || HOUSE_STYLE_FONT,
      lineSpacing: packed.lineSpacing || HOUSE_STYLE_LINE_SPACING,
    };
  } catch {
    return null;
  }
}
