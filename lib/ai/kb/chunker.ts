import "server-only";

import { estimateTokens } from "@/lib/ai/kb/starter-pack";

export type TextChunk = {
  headingPath: string;
  text: string;
  tokenEstimate: number;
};

const TARGET_MIN = 500;
const TARGET_MAX = 800;
const OVERLAP_TOKENS = 100;

function tokenizeWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function joinWords(words: string[]): string {
  return words.join(" ");
}

/**
 * Split text into ~500–800 token windows with overlap.
 * Short texts stay as a single chunk. Heading path is preserved on every window.
 */
export function chunkTextWithOverlap(input: {
  headingPath: string;
  text: string;
  targetMin?: number;
  targetMax?: number;
  overlapTokens?: number;
}): TextChunk[] {
  const headingPath = input.headingPath.trim() || "General";
  const text = input.text.trim();
  if (!text) return [];

  const targetMin = input.targetMin ?? TARGET_MIN;
  const targetMax = input.targetMax ?? TARGET_MAX;
  const overlap = input.overlapTokens ?? OVERLAP_TOKENS;
  const words = tokenizeWords(text);
  const total = estimateTokens(text);

  if (total <= targetMax) {
    return [
      {
        headingPath,
        text,
        tokenEstimate: total,
      },
    ];
  }

  // Aim near the middle of the band for window size.
  const windowSize = Math.min(targetMax, Math.max(targetMin, Math.floor((targetMin + targetMax) / 2)));
  const step = Math.max(1, windowSize - overlap);
  const out: TextChunk[] = [];

  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + windowSize);
    if (slice.length === 0) break;
    const chunkText = joinWords(slice);
    out.push({
      headingPath,
      text: chunkText,
      tokenEstimate: estimateTokens(chunkText),
    });
    if (start + windowSize >= words.length) break;
  }

  return out;
}
