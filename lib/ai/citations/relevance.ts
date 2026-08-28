/**
 * Citation relevance gating.
 * A source may appear under "Sources" only when its authority and chunk content
 * actually support the question/answer — never because it was a RAG neighbour.
 */

import type { AiCitation } from "@/lib/db/ai-types";
import { citationKeywordSet } from "@/lib/ai/citations/authority-urls";

/** Soft topic domains used to reject cross-domain Acts (incest ≠ companies). */
export type LegalDomain =
  | "criminal"
  | "family"
  | "labour"
  | "company"
  | "land"
  | "water"
  | "procedure"
  | "constitutional"
  | "tax"
  | "general";

const DOMAIN_SIGNALS: Record<LegalDomain, RegExp> = {
  criminal:
    /\b(incest|rape|sexual|offence|offense|criminal|murder|theft|assault|codification|penalty|imprison|prosecut|accused|convict)\b/i,
  family:
    /\b(marriage|divorce|custody|maintenance|spouse|child|kinship|family|matrimon|adoption)\b/i,
  labour:
    /\b(labour|labor|employee|employer|wage|salary|dismissal|unfair\s+labour|retrench|overtime|leave\s+pay)\b/i,
  company:
    /\b(compan(?:y|ies)|director|shareholder|incorpora|cobea|business\s+entities|registrar\s+of\s+companies)\b/i,
  land:
    /\b(land|farm|agricultur|deed|title\s+deed|offer\s+letter|conveyanc|plot)\b/i,
  water: /\b(water|dam|zinwa|abstraction|irrigation)\b/i,
  procedure:
    /\b(evidence|procedure|affidavit|summons|plead|hearing|court\s+rules|admissib)\b/i,
  constitutional:
    /\b(constitution|fundamental\s+rights|bill\s+of\s+rights|chapter\s+4)\b/i,
  tax: /\b(tax|zimra|vat|paye|income\s+tax)\b/i,
  general: /\b(zimbabwe|act|statute|law)\b/i,
};

const DOMAIN_OF_LABEL: Array<{ domain: LegalDomain; re: RegExp }> = [
  { domain: "company", re: /\b(compan|cobea|business\s+entities|director)\b/i },
  { domain: "labour", re: /\b(labour|labor)\b/i },
  { domain: "criminal", re: /\b(criminal|codification)\b/i },
  { domain: "family", re: /\b(marriage|matrimon|family)\b/i },
  { domain: "land", re: /\b(deed|land|conveyanc|agricultur)\b/i },
  { domain: "water", re: /\b(water)\b/i },
  { domain: "procedure", re: /\b(evidence|procedure|court\s+rules|high\s+court|magistrate)\b/i },
  { domain: "constitutional", re: /\b(constitution)\b/i },
  { domain: "tax", re: /\b(tax|zimra)\b/i },
];

/** Stop-words that must never count as distinctive Act overlap. */
const WEAK_OVERLAP = new Set([
  "other",
  "related",
  "family", // too often appears as "family statutes" boilerplate
  "statutes",
  "chapter",
  "reform",
  "code",
  "law",
  "act",
  "zimbabwe",
  "starter",
  "pack",
  "excerpts",
  "orientation",
  "caution",
  "note",
  "quality",
  "demo",
  "criminal",
]);

export function detectDomains(text: string): Set<LegalDomain> {
  const out = new Set<LegalDomain>();
  for (const [domain, re] of Object.entries(DOMAIN_SIGNALS) as Array<
    [LegalDomain, RegExp]
  >) {
    if (domain === "general") continue;
    if (re.test(text)) out.add(domain);
  }
  return out;
}

export function labelDomains(label: string): Set<LegalDomain> {
  const out = new Set<LegalDomain>();
  for (const { domain, re } of DOMAIN_OF_LABEL) {
    if (re.test(label)) out.add(domain);
  }
  return out;
}

/** Distinctive keywords from a citation label (drops weak filler). */
export function distinctiveCitationWords(label: string): string[] {
  return citationKeywordSet(label).filter((w) => !WEAK_OVERLAP.has(w) && !/^\d/.test(w));
}

/** Content words from a query for chunk overlap (length > 4). */
export function topicWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !WEAK_OVERLAP.has(w));
}

export type RelevanceChunk = {
  text?: string | null;
  citationLabel?: string | null;
};

/**
 * Strict gate for "Sources" (used to generate the answer).
 * Requires:
 * 1. Domain compatibility (criminal Q cannot cite Companies Act), and
 * 2. Distinctive Act-name overlap with question or answer, or chapter pin in answer, and
 * 3. Prefer chunk-content topic overlap with the question when chunk text is available.
 */
export function isCitationRelevantToAnswer(input: {
  citation: AiCitation;
  answer: string;
  question: string;
  chunkText?: string | null;
}): boolean {
  const label = input.citation.citationLabel ?? "";
  if (!label.trim()) return false;

  const focus = `${input.question}\n${input.answer}`;
  const qDomains = detectDomains(focus);
  const lDomains = labelDomains(label);

  // Cross-domain reject: label has a specific domain that the Q/A does not.
  if (lDomains.size > 0 && qDomains.size > 0) {
    let overlap = false;
    for (const d of lDomains) {
      if (qDomains.has(d)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) return false;
  }

  const distinctive = distinctiveCitationWords(label);
  const focusLower = focus.toLowerCase();
  const distinctiveHits = distinctive.filter((w) => focusLower.includes(w));

  const chapter = label.match(/Chapter\s*([\d:]+)/i);
  const chapterInAnswer =
    Boolean(chapter) && input.answer.toLowerCase().includes(chapter![1].toLowerCase());

  // Need a real Act-name hit in the answer (preferred) or question, or an explicit chapter pin in the answer.
  const answerLower = input.answer.toLowerCase();
  const answerHits = distinctive.filter((w) => answerLower.includes(w));
  const namedInAnswer = answerHits.length >= 1;
  const namedInFocus = distinctiveHits.length >= 1;

  if (!namedInAnswer && !chapterInAnswer) {
    if (!namedInFocus) return false;
  }

  const chunk = (input.chunkText ?? "").toLowerCase();
  if (chunk.length >= 40) {
    const qWords = topicWords(input.question);
    const chunkHits = qWords.filter((w) => chunk.includes(w)).length;
    // Named-in-answer must not override a chunk that does not speak to this question
    // (log: incest s.75 kept for a maintenance/perjury Q because the answer said "criminal").
    if (qWords.length >= 2 && chunkHits === 0) {
      return false;
    }
  }

  return namedInAnswer || chapterInAnswer || (namedInFocus && chunk.length >= 40);
}

/** Soft score for "worth exploring" (related but not necessarily used). */
export function explorationRelevanceScore(input: {
  label: string;
  question: string;
  answer: string;
  chunkText?: string | null;
}): number {
  const focus = `${input.question}\n${input.answer}`;
  const qDomains = detectDomains(focus);
  const lDomains = labelDomains(input.label);
  if (lDomains.size > 0 && qDomains.size > 0) {
    let ok = false;
    for (const d of lDomains) {
      if (qDomains.has(d)) {
        ok = true;
        break;
      }
    }
    if (!ok) return 0;
  }

  const distinctive = distinctiveCitationWords(input.label);
  const focusLower = focus.toLowerCase();
  const nameHits = distinctive.filter((w) => focusLower.includes(w)).length;

  const qWords = topicWords(input.question);
  const chunk = (input.chunkText ?? "").toLowerCase();
  const chunkHits = qWords.filter((w) => chunk.includes(w)).length;

  return nameHits * 2 + chunkHits;
}

/**
 * Extract section numbers that appear in a single source's own text only.
 */
export function extractSectionsFromSourceText(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const sections: string[] = [];
  const seen = new Set<string>();
  const re =
    /\b(?:s(?:ection)?\.?\s*|sec\.?\s*)(\d+[A-Za-z]?(?:\([a-z0-9]+\))*)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[1].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    sections.push(m[1]);
    if (sections.length >= 5) break;
  }
  return sections;
}

/**
 * Pin a section onto a citation label ONLY when that section appears in THIS
 * source's own chunk/heading text. Never borrow a section from the answer or
 * from another statute (that produced "Deeds Registries Act, s.195" bugs).
 */
export function pinpointCitationLabel(
  baseLabel: string,
  chunkText?: string | null,
  _answerText?: string | null,
): string {
  const base = baseLabel.trim();
  if (!base) return base;
  if (/\bs(?:ection)?\.?\s*\d/i.test(base)) {
    // Already has a section — keep only if it belongs to this source text.
    const validated = validateCitationStatuteSectionPair(base, chunkText);
    return validated ?? base.replace(/,\s*s\.\s*[\dA-Za-z().]+/gi, "").replace(/\s*—\s*[^,]*s\.\s*[\dA-Za-z().]+/gi, "").trim();
  }

  const ownSections = extractSectionsFromSourceText(chunkText);
  if (ownSections.length === 0) {
    return base.replace(/\s*—\s*starter pack.*$/i, "").trim();
  }

  // Prefer a section that is already named in the base label/heading path.
  const baseLower = base.toLowerCase();
  let chosen =
    ownSections.find((s) => baseLower.includes(`s.${s.toLowerCase()}`) || baseLower.includes(`section ${s.toLowerCase()}`)) ??
    ownSections[0];

  const cleaned = base.replace(/\s*—\s*starter pack.*$/i, "").trim();
  return `${cleaned}, s.${chosen}`;
}

/**
 * Returns the label if every section pin on it appears in this source's text;
 * otherwise null (caller should drop the citation from Sources).
 * Labels with no section pin are allowed through unchanged.
 */
export function validateCitationStatuteSectionPair(
  citationLabel: string,
  sourceText?: string | null,
): string | null {
  const label = citationLabel.trim();
  if (!label) return null;

  const sectionPins = extractSectionsFromSourceText(label);
  if (sectionPins.length === 0) return label;

  const own = new Set(
    extractSectionsFromSourceText(sourceText).map((s) => s.toLowerCase()),
  );
  // Cannot verify the (statute, section) pair against this source — drop from Sources.
  if (own.size === 0) return null;

  for (const pin of sectionPins) {
    if (!own.has(pin.toLowerCase())) return null;
  }
  return label;
}
