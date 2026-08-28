import "server-only";

import type { AiCitation } from "@/lib/db/ai-types";
import { explorationRelevanceScore } from "@/lib/ai/citations/relevance";
import type { VerifyResult } from "@/lib/ai/rag/verify";

/**
 * Splits a verify pass's kept/rejected citations into the three source tiers
 * the chat UI already renders (Primary sources / Other sources consulted /
 * Further reading), and computes the honest research-status flags shown next
 * to each answer. Shared by `answer.ts` (legal research) and `matter-ask.ts`
 * (Matter Assist) so both behave identically.
 */

export type ExploreSourceCategory = "statute" | "case_law" | "treaty" | "secondary";

export type ExploreSource = {
  category: ExploreSourceCategory;
  title: string;
  relevance: string;
  sourceUrl: string;
};

export type ResearchStatus = {
  /** At least one live web result was found and used this turn. */
  webConsulted: boolean;
  /** Web search ran but returned nothing usable (key present, no hits). */
  webUnavailable: boolean;
  /** A live web check was actually attempted this turn. */
  currentnessChecked: boolean;
  /** No live web check ran (disabled, no key, or chat-only turn). */
  currentnessUnverified: boolean;
  /** At least one candidate citation was rejected as unsupported/fabricated-looking. */
  fabricatedRejected: boolean;
  /** At least one citation is a verified local knowledge-base authority. */
  verifiedPrimary: boolean;
};

export type SourceTiers = {
  primary: AiCitation[];
  supporting: AiCitation[];
  furtherReading: ExploreSource[];
};

const MAX_FURTHER_READING = 4;

/** Local knowledge-base authorities are primary; relevant web finds are supporting. */
function isPrimaryCitation(c: AiCitation): boolean {
  if (c.sourceKind === "primary") return true;
  if (c.sourceKind === "secondary" || c.sourceKind === "general") return false;
  return c.verified === true;
}

function categorizeExplore(label: string): ExploreSourceCategory {
  if (/\b[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)*\s+v[s]?\.?\s+[A-Z]/.test(label)) {
    return "case_law";
  }
  if (/\b(act|chapter\s*[\d:]+|statutory instrument|\bsi\b|constitution)\b/i.test(label)) {
    return "statute";
  }
  if (/\btreaty|convention|protocol\b/i.test(label)) return "treaty";
  return "secondary";
}

export function buildSourceTiers(input: {
  verified: Pick<VerifyResult, "citations" | "rejectedCitations" | "summary">;
  question: string;
  answer: string;
  webAttempted: boolean;
  webHitCount: number;
}): { tiers: SourceTiers; researchStatus: ResearchStatus } {
  const primary: AiCitation[] = [];
  const supporting: AiCitation[] = [];
  for (const c of input.verified.citations) {
    if (isPrimaryCitation(c)) primary.push(c);
    else supporting.push(c);
  }

  const furtherReading: ExploreSource[] = input.verified.rejectedCitations
    .map((c) => ({
      citation: c,
      score: explorationRelevanceScore({
        label: c.citationLabel,
        question: input.question,
        answer: input.answer,
        chunkText: c.excerpt ?? null,
      }),
    }))
    .filter((x) => x.score > 0 && Boolean(x.citation.sourceUrl))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_FURTHER_READING)
    .map(({ citation }) => ({
      category: categorizeExplore(citation.citationLabel),
      title: citation.citationLabel,
      relevance:
        "Related to your question but not directly relied on for this answer — worth checking.",
      sourceUrl: citation.sourceUrl as string,
    }));

  const researchStatus: ResearchStatus = {
    webConsulted: input.webHitCount > 0,
    webUnavailable: input.webAttempted && input.webHitCount === 0,
    currentnessChecked: input.webAttempted,
    currentnessUnverified: !input.webAttempted,
    fabricatedRejected: input.verified.summary.droppedCitationCount > 0,
    verifiedPrimary: primary.length > 0,
  };

  return { tiers: { primary, supporting, furtherReading }, researchStatus };
}
