import "server-only";

import { randomInt } from "crypto";

/**
 * Generate a human-friendly temporary password that satisfies the 10-char
 * minimum policy. Shown ONCE to the creator/approver; never stored in the DB.
 * Format: Word-Word-#### (e.g. "Amber-River-4827").
 */
const WORDS = [
  "Amber",
  "River",
  "Cedar",
  "Falcon",
  "Harbor",
  "Meadow",
  "Summit",
  "Willow",
  "Copper",
  "Lantern",
  "Marble",
  "Orchid",
  "Quartz",
  "Timber",
  "Velvet",
  "Cobalt",
];

function pickWord(): string {
  return WORDS[randomInt(WORDS.length)];
}

export function generateTempPassword(): string {
  const digits = String(randomInt(1000, 10000));
  return `${pickWord()}-${pickWord()}-${digits}`;
}
