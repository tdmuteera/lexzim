/**
 * Lightweight intent for LexZim chat: greetings vs law vs document drafting.
 */
import {
  DEFAULT_HOUSE_STYLE,
  type DocxStyleOptions,
} from "@/lib/ai/drafting/house-style";

export type ChatIntent = "chat" | "legal" | "document";

const GREETING_ONLY_RE =
  /^(hi+|h[ei]llo+|hey+|howdy|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up|thanks?\b|thank\s+you|ok+|okay|cheers|bye+|good\s*night)([\s,!.]*)$/i;

const GREETING_PREFIX_RE =
  /^(hi+|h[ei]llo+|hey+|howdy|good\s+(morning|afternoon|evening)|how\s+are\s+you|what'?s\s+up)([\s,!.]+)/i;

const SMALLTALK_RE =
  /\b(weather|joke|how are you|who are you|your name|what can you do|help me think|random|bored|how's it going|what time|news)\b/i;

const DOCUMENT_RE =
  /\b(draft|write|prepare|generate|produce|create|convert|craft|compose|send|export|download)\b.{0,100}\b(letter|affidavit|notice|agreement|contract|opinion|memo|memorandum|word|docx|document|advisory|heads of argument|plea|summons)\b/i;

/** Broader Word/export asks (craft a 2 page word document, downloadable docx, …). */
const DOCUMENT_EXPORT_RE =
  /\b((?:\d+\s*[- ]?\s*)?page[s]?\s+)?(word\s*doc(?:ument)?s?|\.?docx|downloadable\s+(?:word\s*)?doc(?:ument)?|word\s+file)\b|\b(download|send|give|provide|attach)\b.{0,60}\b(word|docx|document|file|link)\b/i;

/** Short confirmations after a draft was offered in chat. */
const DOC_FOLLOWUP_RE =
  /^(yes|yeah|yep|yup|please|ok|okay|sure)\b[\s,.!]*((send|give|provide|make|prepare|create|download).{0,40})?(the\s+)?(download(?:able)?|word|docx|document|file|link)\b|\bwhere\s+is\s+(the\s+)?(download(?:able)?\s+)?(link|file|document|docx|word)\b|^(send|give|provide)\s+(me\s+)?(the\s+)?(download(?:able)?|link|word|docx|document|file)\b/i;

const FORMAT_RE =
  /\b(times new roman|arial|calibri|trebuchet|font|line spacing|1\.5|double.?spac|letterhead)\b/i;

const LEGAL_RE =
  /\b(act|statute|section|s\.?\s*\d|statutory instrument|\bsi\b|constitution|high court|magistrate|divorce|custody|maintenance|conveyanc|labour|criminal|civil procedure|case law|precedent|plaintiff|defendant|applicant|respondent|injunction|interdict|damages|contract law|delict|estate|will|probate|compan(?:y|ies)|company law|companies act|cobea?\b|copac|zimlii|veritas|director|resident|local director|agricultural land|farm(?:ing)?|offer letter|99[- ]year|zimra|land|plot|dam|water rights?|water act|references?|sources?|cite|citation|authority|authorities|zimbabwean?\b|register(?:ed|ation)?)\b/i;

/** Explicit “give me the sources / references” follow-ups are legal, not chat. */
const CITATION_FOLLOWUP_RE =
  /^(please\s+)?(give|show|list|provide|what\s+are|where\s+(are|did)|share)?\s*(me\s+)?(the\s+)?(references?|sources?|citations?|authorities)\b/i;

function stripGreetingPrefix(q: string): string {
  return q.replace(GREETING_PREFIX_RE, "").trim();
}

export function isDocumentRequest(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (DOCUMENT_RE.test(q) || DOCUMENT_EXPORT_RE.test(q) || DOC_FOLLOWUP_RE.test(q)) {
    return true;
  }
  if (FORMAT_RE.test(q) && /\b(document|letter|word|draft|docx|advisory)\b/i.test(q)) {
    return true;
  }
  return false;
}

export function classifyChatIntent(question: string): ChatIntent {
  const q = question.trim();
  if (!q) return "chat";

  if (CITATION_FOLLOWUP_RE.test(q) || /^(references?|sources?|citations?)\s*[?.!]?\s*$/i.test(q)) {
    return "legal";
  }

  // Word / download requests win over legal keyword matches in the pasted body.
  if (isDocumentRequest(q)) return "document";

  // Legal keywords win over a leading "hello" / "hi" (common user habit).
  if (LEGAL_RE.test(q)) return "legal";

  const afterGreeting = stripGreetingPrefix(q);
  if (GREETING_ONLY_RE.test(q)) return "chat";
  if (afterGreeting !== q && afterGreeting.length > 0) {
    if (isDocumentRequest(afterGreeting)) return "document";
    if (LEGAL_RE.test(afterGreeting) || afterGreeting.length > 60) return "legal";
    if (afterGreeting.split(/\s+/).length <= 6 && !LEGAL_RE.test(afterGreeting)) {
      return "chat";
    }
  }

  if (q.length < 80 && SMALLTALK_RE.test(q)) return "chat";
  if (q.length > 140) return "legal";
  if (q.split(/\s+/).length <= 6 && !LEGAL_RE.test(q)) return "chat";
  return "legal";
}

export function wantsDocumentExport(question: string): boolean {
  return isDocumentRequest(question) || classifyChatIntent(question) === "document";
}

/**
 * House style by default (Trebuchet MS 12pt, 1.5, justified black).
 * Overrides only when the user explicitly names another font/size/spacing.
 */
export function parseDocxStyle(question: string): DocxStyleOptions {
  const q = question.toLowerCase();
  let font = DEFAULT_HOUSE_STYLE.font;
  if (q.includes("times new roman")) font = "Times New Roman";
  else if (q.includes("arial")) font = "Arial";
  else if (q.includes("georgia")) font = "Georgia";
  else if (q.includes("calibri")) font = "Calibri";
  else if (q.includes("trebuchet")) font = "Trebuchet MS";

  let lineSpacing = DEFAULT_HOUSE_STYLE.lineSpacing;
  if (/\b1\.5\b/.test(q) || /one and a half/.test(q)) lineSpacing = 1.5;
  else if (/\bdouble\b/.test(q) || /2\.0/.test(q)) lineSpacing = 2;
  else if (/\bsingle\b/.test(q) || /1\.0/.test(q)) lineSpacing = 1;
  else if (/\b1\.15\b/.test(q)) lineSpacing = 1.15;

  let fontSizePt = DEFAULT_HOUSE_STYLE.fontSizePt;
  const size = q.match(/\b(\d{1,2})\s*pt\b/);
  if (size) fontSizePt = Math.min(18, Math.max(10, Number(size[1])));

  return {
    font,
    lineSpacing,
    fontSizePt,
    color: DEFAULT_HOUSE_STYLE.color,
    justified: DEFAULT_HOUSE_STYLE.justified,
  };
}
