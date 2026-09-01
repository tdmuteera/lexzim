import "server-only";

import type { AiCitation } from "@/lib/db/ai-types";
import {
  explorationRelevanceScore,
  isCitationRelevantToAnswer,
  pinpointCitationLabel,
  validateCitationStatuteSectionPair,
} from "@/lib/ai/citations/relevance";
import type { ExploreSource, ResearchStatus, SourceTiers } from "@/lib/ai/citations/tiers";

export type SourceCandidate = {
  citation: AiCitation;
  chunkText?: string | null;
  fromKb: boolean;
};

function categorizeExplore(label: string): ExploreSource["category"] {
  if (/\b[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)*\s+v[s]?\.?\s+[A-Z]/.test(label)) {
    return "case_law";
  }
  if (/\b(act|chapter\s*[\d:]+|statutory instrument|\bsi\b|constitution)\b/i.test(label)) {
    return "statute";
  }
  if (/\btreaty|convention|protocol\b/i.test(label)) return "treaty";
  return "secondary";
}

/**
 * Build Show sources + Sources worth looking into from retrieval logs (not from model memory).
 */
export function buildSourcePanel(input: {
  question: string;
  answer: string;
  candidates: SourceCandidate[];
  webAttempted: boolean;
  webHitCount: number;
}): { tiers: SourceTiers; researchStatus: ResearchStatus } {
  const primary: AiCitation[] = [];
  const supporting: AiCitation[] = [];
  const explorePool: Array<{ citation: AiCitation; score: number }> = [];
  let dropped = 0;

  for (const row of input.candidates) {
    const chunkText = row.chunkText ?? row.citation.excerpt ?? "";
    let label = row.citation.citationLabel?.trim() ?? "";
    if (!label) continue;

    if (row.fromKb) {
      label = pinpointCitationLabel(label, chunkText, input.answer);
      const validated = validateCitationStatuteSectionPair(label, chunkText);
      if (!validated) {
        dropped += 1;
        continue;
      }
      label = validated;
    }

    const citation: AiCitation = { ...row.citation, citationLabel: label };

    if (
      isCitationRelevantToAnswer({
        citation,
        answer: input.answer,
        question: input.question,
        chunkText,
      })
    ) {
      if (row.fromKb || citation.sourceKind === "primary") {
        primary.push(citation);
      } else {
        supporting.push(citation);
      }
      continue;
    }

    const exploreScore = explorationRelevanceScore({
      label,
      question: input.question,
      answer: input.answer,
      chunkText,
    });
    if (exploreScore > 0 && citation.sourceUrl) {
      explorePool.push({ citation, score: exploreScore });
    } else if (exploreScore <= 0) {
      dropped += 1;
    }
  }

  const seenUrl = new Set<string>();
  const dedupe = (list: AiCitation[]) => {
    const out: AiCitation[] = [];
    for (const c of list) {
      const key = (c.sourceUrl ?? c.citationLabel).toLowerCase();
      if (seenUrl.has(key)) continue;
      seenUrl.add(key);
      out.push(c);
    }
    return out;
  };

  const furtherReading: ExploreSource[] = explorePool
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ citation }) => ({
      category: categorizeExplore(citation.citationLabel),
      title: citation.citationLabel,
      relevance:
        "Related to your question but not directly relied on for this answer. Worth checking.",
      sourceUrl: citation.sourceUrl as string,
    }));

  const researchStatus: ResearchStatus = {
    webConsulted: input.webHitCount > 0,
    webUnavailable: input.webAttempted && input.webHitCount === 0,
    currentnessChecked: input.webAttempted,
    currentnessUnverified: !input.webAttempted,
    fabricatedRejected: dropped > 0,
    verifiedPrimary: primary.some((c) => c.verified === true || c.sourceKind === "primary"),
  };

  return {
    tiers: {
      primary: dedupe(primary),
      supporting: dedupe(supporting),
      furtherReading,
    },
    researchStatus,
  };
}
