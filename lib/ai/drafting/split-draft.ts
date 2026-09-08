/**
 * Separate a filing-ready draft from lawyer-to-user chat (questions, notes).
 * The Word file must never contain the chat half.
 */

const FOLLOW_UP_HEAD =
  /(?:^|\n)[ \t]*(?:#{1,3}[ \t]*)?(?:\*{0,2})(?:QUESTIONS FOR YOU|FOLLOW-?UP QUESTIONS|QUESTIONS(?:\s+FOR\s+THE\s+USER)?|PLEASE CONFIRM(?: THE FOLLOWING)?|CLARIFICATIONS?\s+NEEDED)(?:\*{0,2})[ \t]*:?[ \t]*(?:\n|$)/i;

const FOLLOW_UP_TAIL =
  /\n[ \t]*Once you provide (?:these|those) details[\s\S]*$/i;

const INTERVIEW_LEAK =
  /\n[ \t]*(?:\d+\.\s+)?(?:Do you want to claim|What specific incidents|What specific conduct|Does Mary seek|Please clarify so I can)/i;

const DOC_START =
  /(?:IN THE HIGH COURT|IN THE MAGISTRATES|IN THE LABOUR COURT|LETTER OF DEMAND|NOTICE OF|NON-DISCLOSURE|AGREEMENT FOR SALE|ACKNOWLEDGEMENT OF DEBT|POWER OF ATTORNEY|DEED OF SETTLEMENT|AFFIDAVIT|SUMMONS\b)/i;

export function isCourtPleading(text: string): boolean {
  if (/\bLETTER OF DEMAND\b/i.test(text) && !/\bIN THE HIGH COURT\b/i.test(text)) return false;
  return /\bIN THE HIGH COURT\b|\bIN THE MAGISTRATES(?:'|’) COURT\b|\bPARTICULARS OF CLAIM\b|\bCASE NO\.?\b/i.test(
    text,
  );
}

export function splitDraftFromChat(raw: string): { draft: string; followUp: string } {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { draft: "", followUp: "" };

  let draft = text;
  let followUp = "";

  const head = text.split(FOLLOW_UP_HEAD);
  if (head.length >= 2) {
    draft = head[0].trim();
    followUp = text.slice(text.search(FOLLOW_UP_HEAD)).replace(FOLLOW_UP_HEAD, "").trim();
  } else {
    const once = text.search(FOLLOW_UP_TAIL);
    if (once >= 0) {
      followUp = text.slice(once).trim();
      draft = text.slice(0, once).trim();
    }
  }

  followUp = followUp.trim();

  if (!followUp) {
    const leak = draft.search(INTERVIEW_LEAK);
    if (leak >= 0) {
      followUp = draft.slice(leak).trim();
      draft = draft.slice(0, leak).trim();
    }
  }

  const start = draft.search(DOC_START);
  if (start > 0 && start < 400) {
    const preamble = draft.slice(0, start).trim();
    draft = draft.slice(start).trim();
    if (preamble && !followUp) followUp = preamble;
    else if (preamble) followUp = `${preamble}\n\n${followUp}`.trim();
  }

  const harvested = harvestLectures(draft);
  draft = harvested.draft;
  if (harvested.notes.length) {
    const extra = harvested.notes.map((n) => n.replace(/^[ \t]*\d+\.\s+/, "").trim()).filter(Boolean);
    followUp = followUp ? `${followUp}\n\n${extra.join("\n")}` : extra.join("\n");
  }

  return { draft: stripAdultCustodyClaims(draft.trim()), followUp: followUp.trim() };
}

function harvestLectures(draft: string): { draft: string; notes: string[] } {
  const notes: string[] = [];
  const cleaned = draft.replace(/\[(?:TO BE CONFIRMED|PLACEHOLDER):\s*([^\]]+)\]/gi, (_, inner) => {
    const s = String(inner).trim();
    if (s) notes.push(s);
    return "";
  });
  return { draft: cleaned, notes };
}

/** Custody of a 19-year-old / major child is not a competent High Court prayer. */
export function stripAdultCustodyClaims(draft: string): string {
  let text = draft;
  const hadAdultCustody =
    /custody of the (?:major|adult) child/i.test(text) ||
    /child now aged 19/i.test(text) ||
    /(?:aged|age)\s+19\s+years/i.test(text);
  text = text.replace(/^[ \t]*\d+\.\s+[^\n]*custody of the (?:major|adult) child[^\n]*\n?/gim, "");
  text = text.replace(
    /The Plaintiff is a fit and proper person to be awarded custody of the (?:major|adult) child[\s\S]*?(?=\n(?:\d+\.|WHEREFORE|DATED)\b)/gi,
    "",
  );
  text = text.replace(
    /There is one child born of the marriage[^\n]*?(?:19|nineteen)[^\n]*/gi,
    "There are no minor children born of the marriage.",
  );
  if (hadAdultCustody && !/no minor children born of the marriage/i.test(text)) {
    text = text.replace(
      /(PARTICULARS OF CLAIM\s*\n)/i,
      "$1There are no minor children born of the marriage.\n",
    );
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** Collapse lawyer essays inside [TO BE CONFIRMED: …] so they do not print as pleadings. */
export function tightenPlaceholders(draft: string): string {
  return draft
    .replace(/\[TO BE CONFIRMED:[^\]]*\]/gi, "")
    .replace(/\[PLACEHOLDER:[^\]]*\]/gi, "")
    .replace(/,?\s*including\s*\./gi, ".")
    .replace(/\[TO BE ALLOCATED BY REGISTRY\]/gi, "[TO BE ALLOCATED]")
    .replace(/^[ \t]*\[(?:Firm name|Physical address|Telephone|Email|Your firm name\/signature)\][ \t]*$/gim, "")
    .replace(/\[[^\]]*(?:firm name|your name|signature|attorney name)[^\]]*\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Chat-only questions, numbered from 1. Never part of the Word file. */
export function formatFollowUpForChat(followUp: string): string {
  let t = followUp.replace(/^(?:#{1,3}\s*)?(?:QUESTIONS FOR YOU|FOLLOW-?UP QUESTIONS)\s*:?\s*/i, "").trim();
  if (!t) return "";
  let n = 1;
  t = t.replace(/^[ \t]*\d+\.[ \t]+/gm, () => `${n++}. `);
  return `FOLLOW-UP QUESTIONS (not in the Word file)\n${t}`;
}
