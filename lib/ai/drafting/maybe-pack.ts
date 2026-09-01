import "server-only";

import { putAiDraft } from "@/lib/ai/draft-store";
import { packInstructionDocx } from "@/lib/ai/drafting/instruction-docx";
import { HOUSE_STYLE_FONT, HOUSE_STYLE_LINE_SPACING } from "@/lib/ai/drafting/house-style";
import { wantsExplicitWordFile } from "@/lib/ai/intent";

export type PackedChatDocument = {
  id: string;
  fileName: string;
  font: string;
  lineSpacing: number;
};

/** Model said it would send a file later / cannot upload — not packable as body. */
export function isPromiseOnlyDraft(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) {
    return /\b(moment|shortly|prepare|downloadable|link|upload|cannot|can't|copy and paste)\b/i.test(
      t,
    );
  }
  if (
    /\b(i('ll| will)\s+(prepare|send|create|generate)|send you a downloadable|can't directly upload|cannot directly upload|copy (and|&) paste)\b/i.test(
      t,
    ) &&
    t.length < 900
  ) {
    return true;
  }
  return false;
}

/** Model gave UI/export instructions instead of document body. */
export function isExportInstructionText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /\b(download button|copy the entire text|paste it into (microsoft )?word|document export feature|lexzim interface|use the download)\b/i.test(
    t,
  );
}

/** Model obeyed "chat summary only" instead of outputting document body. */
export function isMetaChatSummary(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isExportInstructionText(t)) return true;
  if (
    /^(i('|')ve|i have)\s+(drafted|prepared|created|written)\s+(a\s+)?\d*[- ]?page/i.test(t)
  ) {
    return true;
  }
  if (/formatted in trebuchet|download it below|download below|spacing\)\s*$/im.test(t)) {
    return true;
  }
  if (
    t.length < 500 &&
    /\b(i('|')ve|i have)\s+(drafted|prepared|created|written)\b/i.test(t) &&
    !/\b(whereas|agreement|clause|party|hereinafter|witness)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export function isSubstantialDocumentDraft(text: string): boolean {
  const t = text.trim();
  if (!t || isPromiseOnlyDraft(t) || isMetaChatSummary(t) || isExportInstructionText(t)) {
    return false;
  }
  if (t.length >= 1200) {
    return /\b(signature|witness|whereas|hereinafter|domicilium)\b/i.test(t);
  }
  if (t.length < 280) return false;
  const paragraphs = t.split(/\n\n+/).filter((p) => p.trim().length > 25);
  const hasStructure =
    /\b(whereas|agreement|clause|party|hereinafter|witness|dear\s|re:|between)\b/i.test(t);
  return paragraphs.length >= 3 || (hasStructure && t.length >= 400);
}

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

function titleFromDraftBody(body: string): string | null {
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim().replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").trim();
    if (line.length < 8 || line.length > 120) continue;
    if (/^(whereas|now therefore|signed|between|seller|purchaser|and$|or$)/i.test(line)) continue;
    if (/^[-_*]{3,}$/.test(line)) continue;
    if (/^[A-Z0-9]/.test(line)) return line.slice(0, 80);
  }
  return null;
}

function fileTitleFromQuestion(question: string, draftBody?: string | null): string {
  const fromDraft = draftBody ? titleFromDraftBody(draftBody) : null;
  if (fromDraft) return fromDraft;
  const q = question.trim();
  if (/advisory letter/i.test(q)) return "Client advisory letter";
  return q.slice(0, 80) || "LexZim draft";
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

  const body = pickBestDraftBody(input.answerText, input.priorDraftText);
  if (!body.trim() || !isSubstantialDocumentDraft(body)) return null;

  try {
    const packed = await packInstructionDocx({
      title: fileTitleFromQuestion(q, body),
      body,
      question: q.includes("trebuchet") || q.includes("times new roman")
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
