/**
 * Display titles and download names for AI Word drafts.
 * Names should look like a file a lawyer would attach to an email, not a slug of the prompt.
 */

const TYPE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bletter of demand\b/i, label: "Letter of Demand" },
  { re: /\bnotice of termination of lease\b|\btermination of lease\b/i, label: "Notice of Termination of Lease" },
  { re: /\bnotice of termination\b/i, label: "Notice of Termination" },
  { re: /\bnon[- ]disclosure\b|\bnda\b/i, label: "Non-Disclosure Agreement" },
  { re: /\bsale of goods\b|\bagreement for sale of goods\b/i, label: "Sale of Goods Agreement" },
  { re: /\bagreement of sale\b|\bsale agreement\b/i, label: "Agreement of Sale" },
  { re: /\baffidavit\b/i, label: "Affidavit" },
  { re: /\bheads of argument\b/i, label: "Heads of Argument" },
  { re: /\bsummons\b/i, label: "Summons" },
  { re: /\blegal opinion\b|\bopinion letter\b/i, label: "Legal Opinion" },
  { re: /\blease\b/i, label: "Lease" },
];

const SKIP_TITLE_LINE =
  /^(whereas|now therefore|signed|between|seller|purchaser|and$|or$|to:|from:|dear |re:|date:|clause\s+\d)/i;

function firstTitleLine(body: string): string | null {
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim().replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").trim();
    if (line.length < 8 || line.length > 90) continue;
    if (SKIP_TITLE_LINE.test(line)) continue;
    if (/^[-_*]{3,}$/.test(line)) continue;
    if (/^\[/.test(line)) continue;
    if (/^[A-Z0-9]/.test(line)) return line.replace(/[:.]+$/, "").slice(0, 80);
  }
  return null;
}

function detectType(title: string, body: string, question: string): string {
  const blob = `${title}\n${body.slice(0, 1200)}\n${question}`;
  for (const row of TYPE_PATTERNS) {
    if (row.re.test(blob)) return row.label;
  }
  const fromTitle = firstTitleLine(body);
  if (fromTitle && fromTitle.length <= 70 && !/\?$/.test(fromTitle)) return fromTitle;
  if (title.trim() && title.trim().length <= 70 && !/\?$/.test(title)) return title.trim();
  return "Legal document";
}

function tidyParty(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\bof\b[\s\S]*/i, "")
    .replace(/\b(private\s+)?limited\b/gi, "Ltd")
    .replace(/\b\(pty\)\b/gi, "(Pvt)")
    .replace(/\bpty\b/gi, "Pvt")
    .trim()
    .replace(/[.,;:]+$/, "");
}

function companyHead(line: string): string {
  return prettyParty(tidyParty(line.split(",")[0] || line));
}

function prettyParty(name: string): string {
  return name
    .split(" ")
    .map((w) => {
      if (!w) return w;
      if (/^\(.*\)$/.test(w)) return w;
      if (w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      if (w === w.toUpperCase() && /[A-Z]{5,}/.test(w)) {
        return w.charAt(0) + w.slice(1).toLowerCase();
      }
      return w;
    })
    .join(" ")
    .trim();
}

function addressNameAfterDate(text: string): string | undefined {
  const m = text.match(
    /\b\d{1,2}\s+[A-Za-z]+\s+20\d{2}\s*\n+([A-Z][A-Za-z'-]+(?:[ \t]+[A-Z][A-Za-z'-]+){0,3})\s*\n+\d+/,
  );
  return m?.[1];
}

function extractParties(body: string): { left?: string; right?: string; mode: "to" | "and" } {
  const text = body.replace(/\r\n/g, "\n");

  const toFrom = text.match(
    /(?:^|\n)\s*(?:\*{0,2}TO:\*{0,2}|To:)\s*([^\n]+)\s*(?:\n[\s\S]{0,400}?)(?:^|\n)\s*(?:\*{0,2}FROM:\*{0,2}|From:)\s*([^\n]+)/im,
  );
  if (toFrom) {
    return { left: companyHead(toFrom[2]), right: companyHead(toFrom[1]), mode: "to" };
  }

  const between = text.match(
    /\bBETWEEN:\s*\n+([^\n]{3,220})\s*\n+AND:?\s*\n+([^\n]{3,220})/i,
  );
  if (between) {
    return { left: companyHead(between[1]), right: companyHead(between[2]), mode: "and" };
  }

  const weAct = text.match(
    /we act for\s+((?:Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+|Dr\.?\s+)?[A-Z][A-Za-z'-]+(?:[ \t]+[A-Z][A-Za-z'-]+){0,3})(?=\s+(in|of|from)\b|[.,]|$)/i,
  );
  const dear = text.match(
    /\bdear\s+(?:mr|mrs|ms|dr)\.?\s+([A-Z][A-Za-z'-]+(?:[ \t]+[A-Z][A-Za-z'-]+){0,2})/i,
  );
  const addressee = dear?.[1] || addressNameAfterDate(text);
  if (weAct) {
    return {
      left: companyHead(weAct[1]),
      right: addressee ? companyHead(addressee) : undefined,
      mode: "to",
    };
  }

  return { mode: "and" };
}

function shortParty(name: string): string {
  const cut = name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\b(the\s+)?(landlord|tenant|seller|buyer|purchaser|company)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = prettyParty(cut).split(" ").filter(Boolean);
  if (words.length <= 4) return words.join(" ").slice(0, 42);
  return words.slice(0, 3).join(" ").slice(0, 42);
}

export function windowsSafeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const base = cleaned.slice(0, 110) || "Legal document";
  return base.toLowerCase().endsWith(".docx") ? base : `${base}.docx`;
}

/** Human title used as the first line of the Word file when the body has no title. */
export function draftDisplayTitle(input: {
  question: string;
  body: string;
  fallback?: string;
}): string {
  const fromBody = firstTitleLine(input.body);
  if (fromBody) return fromBody;
  return detectType(input.fallback || "", input.body, input.question);
}

/** Download / attachment name. */
export function draftFileName(input: {
  question: string;
  body: string;
  title?: string;
}): string {
  const type = detectType(input.title || "", input.body, input.question);
  const parties = extractParties(input.body);
  let suffix = "";
  if (parties.left && parties.right) {
    const a = prettyParty(shortParty(parties.left));
    const b = prettyParty(shortParty(parties.right));
    suffix = parties.mode === "to" ? ` - ${a} to ${b}` : ` - ${a} and ${b}`;
  } else if (parties.right) {
    suffix = ` - ${shortParty(parties.right)}`;
  } else if (parties.left) {
    suffix = ` - ${shortParty(parties.left)}`;
  }
  return windowsSafeFileName(`${type}${suffix}`);
}
