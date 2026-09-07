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
}): Promise<PackedChatDocument | null> {
  const q = input.question;
  const attached = Boolean(input.attachmentContext?.trim());
  const asked =
    wantsExplicitWordFile(q) ||
    (attached && /\b(word|docx|document|letter|convert|times new roman|line spacing)\b/i.test(q));
  if (!asked) return null;

  const body = repairRestartedNumberedLists(
    pickBestDraftBody(input.answerText, input.priorDraftText),
  );
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
    const stored = putAiDraft({
      firmId: input.firmId,
      userId: input.userId,
      fileName: packed.fileName,
      bytes: packed.bytes,
    });
    return {
      id: stored.id,
      fileName: packed.fileName,
      font: packed.font || HOUSE_STYLE_FONT,
      lineSpacing: packed.lineSpacing || HOUSE_STYLE_LINE_SPACING,
    };
  } catch {
    return null;
  }
}
