import "server-only";

import { putAiDraft } from "@/lib/ai/draft-store";
import { packInstructionDocx } from "@/lib/ai/drafting/instruction-docx";
import { wantsDocumentExport } from "@/lib/ai/intent";

export type PackedChatDocument = {
  id: string;
  fileName: string;
  font: string;
  lineSpacing: number;
};

/** Pack a Word file when the user asked for a document or conversion. */
export async function maybePackChatDocument(input: {
  firmId: string;
  userId: string;
  question: string;
  answerText: string;
  attachmentContext?: string | null;
}): Promise<PackedChatDocument | null> {
  const q = input.question;
  const attached = Boolean(input.attachmentContext?.trim());
  const asked =
    wantsDocumentExport(q) ||
    (attached && /\b(word|docx|document|letter|convert|times new roman|line spacing)\b/i.test(q));
  if (!asked) return null;

  try {
    const packed = await packInstructionDocx({
      title: q.slice(0, 80),
      body: input.answerText,
      question: q,
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
      font: packed.font,
      lineSpacing: packed.lineSpacing,
    };
  } catch {
    return null;
  }
}
