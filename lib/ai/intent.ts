/**
 * Lightweight intent for LexZim chat: greetings vs law vs document drafting.
 */
export type ChatIntent = "chat" | "legal" | "document";

const GREETING_RE =
  /^(hi+|h[ei]llo+|hey+|howdy|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|thanks?\b|thank\s+you|ok+|okay|cheers|bye+|good\s*night)([\s,!.].*)?$/i;

const SMALLTALK_RE =
  /\b(weather|joke|how are you|who are you|your name|what can you do|help me think|random|bored|how's it going|what time|news)\b/i;

const DOCUMENT_RE =
  /\b(draft|write|prepare|generate|produce|create|convert)\b.{0,80}\b(letter|affidavit|notice|agreement|contract|opinion|memo|memorandum|word|docx|document|heads of argument|plea|summons)\b/i;

const FORMAT_RE =
  /\b(times new roman|arial|calibri|font|line spacing|1\.5|double.?spac|letterhead)\b/i;

const LEGAL_RE =
  /\b(act|statute|section|s\.?\s*\d|statutory instrument|\bsi\b|constitution|high court|magistrate|divorce|custody|maintenance|conveyanc|labour|criminal|civil procedure|case law|precedent|plaintiff|defendant|applicant|respondent|injunction|interdict|damages|contract law|delict|estate|will|probate|company law|companies act|copac|zimlii|veritas)\b/i;

export function classifyChatIntent(question: string): ChatIntent {
  const q = question.trim();
  if (!q) return "chat";
  if (GREETING_RE.test(q) || (q.length < 80 && SMALLTALK_RE.test(q))) return "chat";
  if (DOCUMENT_RE.test(q) || (FORMAT_RE.test(q) && /\b(document|letter|word|draft)\b/i.test(q))) {
    return "document";
  }
  if (LEGAL_RE.test(q) || q.length > 140) return "legal";
  if (q.split(/\s+/).length <= 6 && !LEGAL_RE.test(q)) return "chat";
  return "legal";
}

export function wantsDocumentExport(question: string): boolean {
  return classifyChatIntent(question) === "document" || FORMAT_RE.test(question);
}

export function parseDocxStyle(question: string): {
  font: string;
  lineSpacing: number;
  fontSizePt: number;
} {
  const q = question.toLowerCase();
  let font = "Calibri";
  if (q.includes("times new roman")) font = "Times New Roman";
  else if (q.includes("arial")) font = "Arial";
  else if (q.includes("georgia")) font = "Georgia";
  else if (q.includes("calibri")) font = "Calibri";

  let lineSpacing = 1.15;
  if (/\b1\.5\b/.test(q) || /one and a half/.test(q)) lineSpacing = 1.5;
  else if (/\bdouble\b/.test(q) || /2\.0/.test(q)) lineSpacing = 2;
  else if (/\bsingle\b/.test(q) || /1\.0/.test(q)) lineSpacing = 1;

  let fontSizePt = 12;
  const size = q.match(/\b(\d{1,2})\s*pt\b/);
  if (size) fontSizePt = Math.min(18, Math.max(10, Number(size[1])));

  return { font, lineSpacing, fontSizePt };
}
