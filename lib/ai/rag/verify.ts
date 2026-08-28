/**
 * Deterministic post-generation verify pass (P10-15).
 * Scores claim/citation overlap vs retrieved sources; never invents authorities.
 * Citations must also be relevant to the answer (not every RAG neighbour).
 *
 * Honesty: only pack/retrieved primary chunks can support "strong" grounding.
 * Unverified web snippets cannot upgrade confidence to high.
 */

import type { AiCitation } from "@/lib/db/ai-types";
import { deepenAuthorityUrl } from "@/lib/ai/citations/authority-urls";
import {
  isCitationRelevantToAnswer,
  pinpointCitationLabel,
  distinctiveCitationWords,
  validateCitationStatuteSectionPair,
} from "@/lib/ai/citations/relevance";

export type VerifyGrounding = "strong" | "weak" | "unsupported";

export type VerifyChunk = {
  text: string;
  citationLabel?: string | null;
};

export type VerifyInput = {
  answer: string;
  /** Original user question — used to keep only on-topic citations. */
  question?: string;
  retrievedChunks: VerifyChunk[];
  webExcerpts?: VerifyChunk[];
  citations: AiCitation[];
};

export type VerifyResult = {
  answer: string;
  citations: AiCitation[];
  /** Retrieved hits that failed the Sources gate (candidates for explore). */
  rejectedCitations: AiCitation[];
  confidence: number;
  grounding: VerifyGrounding;
  hedgeNote?: string;
  summary: {
    claimTokenCount: number;
    supportedClaimCount: number;
    droppedCitationCount: number;
    overlapScore: number;
    foreignFillDetected: boolean;
    packChunkCount: number;
    webChunkCount: number;
  };
};

const HEDGE_NOTE =
  "Grounding is limited for this answer. Treat authorities as provisional and verify against primary sources before relying on them.";

/** Comparative / foreign fill that should not stand in for Zimbabwe law. */
export function detectsForeignOrGenericFill(text: string): boolean {
  return /\b(in most (legal )?systems|most jurisdictions|under (english|uk|u\.k\.|south african|sa|united states|u\.s\.|american|canadian|australian) law|common[- ]law countries typically|as in other common[- ]law jurisdictions|generally across common law)\b/i.test(
    text,
  );
}

/** Act / section / case-like tokens from answer text. */
export function extractClaimTokens(text: string): string[] {
  const tokens = new Set<string>();
  const sources = text;

  const sectionRe =
    /\b(?:s(?:ection)?\.?\s*|sec\.?\s*)(\d+[A-Za-z]?(?:\([a-z0-9]+\))*)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(sources)) !== null) {
    tokens.add(`s${m[1].toLowerCase()}`);
  }

  const actRe =
    /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5}\s+Act)\b(?:\s*\[?\s*Chapter\s+[\d:]+\s*\]?)?/g;
  while ((m = actRe.exec(sources)) !== null) {
    tokens.add(m[1].toLowerCase().replace(/\s+/g, " "));
  }

  const siRe = /\b(?:SI|S\.I\.)\s*(\d+\s*(?:of\s*)?\d{4})\b/gi;
  while ((m = siRe.exec(sources)) !== null) {
    tokens.add(`si ${m[1].toLowerCase().replace(/\s+/g, " ")}`);
  }

  const caseRe =
    /\b([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})\s+v\.?\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})\b/g;
  while ((m = caseRe.exec(sources)) !== null) {
    tokens.add(`${m[1]} v ${m[2]}`.toLowerCase().replace(/\s+/g, " "));
  }

  const chapterRe = /\b(?:Chapter|Cap\.?)\s*([\d:]+)\b/gi;
  while ((m = chapterRe.exec(sources)) !== null) {
    tokens.add(`chapter ${m[1].toLowerCase()}`);
  }

  if (/\bCOBEA\b/i.test(sources)) {
    tokens.add("companies and other business entities act");
  }

  return [...tokens];
}

function normalizeCorpus(chunks: VerifyChunk[]): string {
  return chunks
    .map((c) => `${c.citationLabel ?? ""}\n${c.text}`)
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function tokenSupported(token: string, corpus: string): boolean {
  const t = token.toLowerCase().trim();
  if (!t || t.length < 3) return false;
  if (corpus.includes(t)) return true;

  const sec = t.match(/^s(\d+[a-z]?(?:\([a-z0-9]+\))*)$/);
  if (sec) {
    const n = sec[1];
    if (
      corpus.includes(`section ${n}`) ||
      corpus.includes(`s. ${n}`) ||
      corpus.includes(`s.${n}`)
    ) {
      return true;
    }
  }

  if (t.endsWith(" act")) {
    const core = t.replace(/\s+act$/, "");
    if (core.length >= 6 && corpus.includes(core)) return true;
  }

  return false;
}

function chunkTextForCitation(
  citation: AiCitation,
  chunks: VerifyChunk[],
): string {
  const label = (citation.citationLabel ?? "").toLowerCase();
  const words = distinctiveCitationWords(citation.citationLabel ?? "");
  for (const ch of chunks) {
    const cl = (ch.citationLabel ?? "").toLowerCase();
    if (cl && label && (cl.includes(label.slice(0, 24)) || label.includes(cl.slice(0, 24)))) {
      return ch.text;
    }
    if (words.length > 0 && words.every((w) => cl.includes(w) || ch.text.toLowerCase().includes(w))) {
      return ch.text;
    }
  }
  // Soft: first chunk whose label shares a distinctive word
  for (const ch of chunks) {
    const cl = `${ch.citationLabel ?? ""} ${ch.text}`.toLowerCase();
    if (words.some((w) => cl.includes(w))) return ch.text;
  }
  return "";
}

/**
 * Verify answer claims and citations against retrieved + web source text.
 * Irrelevant RAG neighbours are dropped — Sources is never padded to a quota.
 * Strong grounding requires pack/retrieved chunks; web-only never counts as strong.
 */
export function verifyGroundedAnswer(input: VerifyInput): VerifyResult {
  const answer = input.answer.trim();
  const question = (input.question ?? "").trim();
  const packChunks = input.retrievedChunks;
  const webChunks = input.webExcerpts ?? [];
  const allChunks = [...packChunks, ...webChunks];
  const packCorpus = normalizeCorpus(packChunks);
  const claimTokens = extractClaimTokens(answer);
  const focus = `${question}\n${answer}`.toLowerCase();
  const foreignFillDetected = detectsForeignOrGenericFill(answer);
  const userAskedComparative =
    /\b(compar(e|ative)|other jurisdictions|english law|south africa|uk law|foreign law)\b/i.test(
      question,
    );

  let supportedClaimCount = 0;
  for (const token of claimTokens) {
    if (tokenSupported(token, packCorpus)) supportedClaimCount += 1;
  }

  const kept: AiCitation[] = [];
  const rejected: AiCitation[] = [];
  let droppedCitationCount = 0;

  for (const c of input.citations) {
    const chunkText = chunkTextForCitation(c, packChunks.length > 0 ? packChunks : allChunks);
    const relevant = isCitationRelevantToAnswer({
      citation: c,
      answer,
      question,
      chunkText,
    });

    // Not relevant to this question/answer at all → drop (candidate for "further reading" only).
    if (!relevant) {
      droppedCitationCount += 1;
      rejected.push(c);
      continue;
    }

    // Live web result (not from the local verified knowledge base): relevant web
    // sources are kept as "supporting" — real, on-topic, but not primary
    // legislation text, so they skip statute/section pinpointing below.
    const isWebSourced = c.verified === false;
    if (isWebSourced) {
      kept.push({ ...c, verified: false });
      continue;
    }

    const pinpointed = pinpointCitationLabel(c.citationLabel, chunkText, answer);
    const validatedLabel = validateCitationStatuteSectionPair(pinpointed, chunkText);
    if (!validatedLabel) {
      droppedCitationCount += 1;
      rejected.push(c);
      continue;
    }
    kept.push({
      ...c,
      citationLabel: validatedLabel,
      // Keep a usable open link, but citation identity is the Act/label, not the search page.
      sourceUrl: deepenAuthorityUrl(c.sourceUrl, validatedLabel),
      verified: true,
    });
  }

  kept.sort((a, b) => {
    const aw = distinctiveCitationWords(a.citationLabel).filter((w) =>
      focus.includes(w),
    ).length;
    const bw = distinctiveCitationWords(b.citationLabel).filter((w) =>
      focus.includes(w),
    ).length;
    return bw - aw;
  });

  const claimRatio =
    claimTokens.length === 0
      ? packChunks.length > 0
        ? 0.55
        : 0.15
      : supportedClaimCount / claimTokens.length;
  const citationRatio =
    input.citations.length === 0 ? claimRatio : kept.length / Math.max(1, input.citations.length);
  const overlapScore = Math.max(0, Math.min(1, claimRatio * 0.65 + citationRatio * 0.35));

  const looksLikeStatutoryAdvice =
    /\b(must|shall|required|does not require|can be registered|may own|is not required|directors?|compan(?:y|ies)|land|dam|water|incest|offence|wage|labour)\b/i.test(
      answer,
    );

  let grounding: VerifyGrounding;
  let confidence: number;
  if (packChunks.length === 0 && (claimTokens.length > 0 || looksLikeStatutoryAdvice)) {
    grounding = "unsupported";
    confidence = 0.2;
  } else if (
    packChunks.length > 0 &&
    overlapScore >= 0.55 &&
    (claimTokens.length === 0 || supportedClaimCount >= Math.ceil(claimTokens.length * 0.5))
  ) {
    grounding = "strong";
    confidence = Math.min(0.9, 0.55 + overlapScore * 0.4);
  } else if (
    packChunks.length > 0 &&
    (overlapScore >= 0.28 || supportedClaimCount > 0 || kept.length > 0)
  ) {
    grounding = "weak";
    confidence = Math.min(0.55, 0.3 + overlapScore * 0.35);
  } else {
    grounding = "unsupported";
    confidence = 0.2;
  }

  // Foreign/generic fill without pack support (and not asked as comparative) → unverified.
  if (foreignFillDetected && !userAskedComparative && packChunks.length === 0) {
    grounding = "unsupported";
    confidence = Math.min(confidence, 0.18);
  } else if (foreignFillDetected && !userAskedComparative && grounding === "strong") {
    grounding = "weak";
    confidence = Math.min(confidence, 0.45);
  }

  const finalAnswer = answer;
  let hedgeNote: string | undefined;
  if (grounding === "weak" || grounding === "unsupported") {
    hedgeNote = HEDGE_NOTE;
  }

  return {
    answer: finalAnswer,
    citations: kept,
    rejectedCitations: rejected,
    confidence,
    grounding,
    hedgeNote,
    summary: {
      claimTokenCount: claimTokens.length,
      supportedClaimCount,
      droppedCitationCount,
      overlapScore: Math.round(overlapScore * 1000) / 1000,
      foreignFillDetected,
      packChunkCount: packChunks.length,
      webChunkCount: webChunks.length,
    },
  };
}
