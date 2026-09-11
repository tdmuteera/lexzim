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
  { re: /\backnowledg(?:e)?ment of debt\b/i, label: "Acknowledgement of Debt" },
  { re: /\bpower of attorney\b/i, label: "Power of Attorney" },
  { re: /\bdeed of settlement\b|\bsettlement agreement\b/i, label: "Deed of Settlement" },
  { re: /\bfounding affidavit\b/i, label: "Founding Affidavit" },
  { re: /\baffidavit\b/i, label: "Affidavit" },
  { re: /\blegal opinion\b|\bopinion letter\b/i, label: "Legal Opinion" },
  { re: /\bheads of argument\b/i, label: "Heads of Argument" },
  { re: /\bsummons\b/i, label: "Summons" },
  { re: /\bdivorce\b/i, label: "Divorce summons" },
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

function looksLikePaymentDemand(question: string): boolean {
  return (
    /\b(days to pay|hasn't paid|has not paid|letter of demand|demand letter)\b/i.test(question) &&
    !/\b(summons|high court|magistrates court|divorce|issue (an )?action|court papers|acknowledg(?:e)?ment of debt)\b/i.test(
      question,
    )
  );
}

function detectType(title: string, body: string, question: string): string {
  const head = body.slice(0, 400);
  if (/\bpower of attorney\b/i.test(question) || /^\s*POWER OF ATTORNEY\b/im.test(body)) {
    return "Power of Attorney";
  }
  if (/\backnowledg(?:e)?ment of debt\b/i.test(question) || /^\s*ACKNOWLEDGEMENT OF DEBT\b/im.test(body)) {
    return "Acknowledgement of Debt";
  }
  if (/\b(founding\s+)?affidavit\b/i.test(question) && !/\bsummons\b/i.test(question)) {
    return /\bfounding\b/i.test(`${question}\n${head}`) ? "Founding Affidavit" : "Affidavit";
  }
  if (/\bsummons\b/i.test(question) || (/\bIN THE HIGH COURT\b/i.test(head) && /\bSUMMONS\b/i.test(body))) {
    if (/\bdivorce\b/i.test(`${question}\n${body.slice(0, 800)}`)) return "Divorce summons";
    return "Summons";
  }
  if (looksLikePaymentDemand(question)) return "Letter of Demand";
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
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\b(plaintiff|defendant|applicant|respondent)\b/gi, "")
    .replace(/\bof\b[\s\S]*/i, "")
    .replace(/\b(private\s+)?limited\b/gi, "Ltd")
    .replace(/\b\(pty\)\b/gi, "(Pvt)")
    .replace(/\bpty\b/gi, "Pvt")
    .trim()
    .replace(/[.,;:]+$/, "");
}

function isPlaceholderParty(name: string | undefined): boolean {
  if (!name) return true;
  const t = name.replace(/[.\u2026…⋯・_\-\s]/g, "").trim();
  return t.length < 2;
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
      if (w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      if (w === w.toUpperCase() && /[A-Z]{2,}/.test(w) && !/^(LTD|PVT|AND|THE)$/.test(w)) {
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

function extractParties(body: string): { left?: string; right?: string; mode: "to" | "and" | "v" } {
  const text = body.replace(/\r\n/g, "\n");

  const toLine = text.match(/(?:^|\n)\s*(?:\*{0,2}TO:\*{0,2}|To:)\s*([^\n]+)/im);
  const fromLine = text.match(/(?:^|\n)\s*(?:\*{0,2}FROM:\*{0,2}|From:)\s*([^\n]+)/im);
  if (toLine && fromLine) {
    return { left: companyHead(fromLine[1]), right: companyHead(toLine[1]), mode: "to" };
  }

  const plaintiff = text.match(
    /^([A-Z][A-Za-z '-]{2,50}?)\s+(?:\.{3,}|\s{4,}).*\bPlaintiff\b/im,
  );
  const defendant = text.match(
    /^([A-Z][A-Za-z '-]{2,50}?)\s+(?:\.{3,}|\s{4,}).*\bDefendant\b/im,
  );
  if (plaintiff && defendant) {
    return { left: prettyParty(plaintiff[1].trim()), right: prettyParty(defendant[1].trim()), mode: "v" };
  }

  const aod = text.match(
    /\bI,\s+([A-Z][A-Z '-]{2,50}),[\s\S]{0,280}?indebted to\s+([A-Z][A-Z '-]{2,50})/i,
  );
  if (aod) {
    return { left: prettyParty(aod[1].trim()), right: prettyParty(aod[2].trim()), mode: "and" };
  }

  const poa = text.match(
    /\bI,\s+([A-Z][A-Z '-]{2,50}),[\s\S]{0,220}?appoint\s+([A-Z][A-Z '-]{2,50})/i,
  );
  if (poa) {
    return { left: prettyParty(poa[1].trim()), right: prettyParty(poa[2].trim()), mode: "to" };
  }

  const between = text.match(
    /\bBETWEEN:?\s*\n+([^\n]{3,220})\s*\n+AND:?\s*\n+([^\n]{3,220})/i,
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
  const addressee = dear?.[1] || addressNameAfterDate(text) || (toLine ? tidyParty(toLine[1]) : undefined);
  if (weAct) {
    return {
      left: companyHead(weAct[1]),
      right: addressee ? companyHead(addressee) : undefined,
      mode: "to",
    };
  }
  if (toLine && addressee) {
    return { right: companyHead(addressee), mode: "to" };
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
    .replace(/[.…⋯・]+/g, "")
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
  const leftOk = !isPlaceholderParty(parties.left);
  const rightOk = !isPlaceholderParty(parties.right);
  let suffix = "";
  if (leftOk && rightOk) {
    const a = prettyParty(shortParty(parties.left!));
    const b = prettyParty(shortParty(parties.right!));
    suffix = parties.mode === "to" ? ` - ${a} to ${b}` : parties.mode === "v" ? ` - ${a} v ${b}` : ` - ${a} and ${b}`;
  } else if (rightOk) {
    suffix = ` - ${shortParty(parties.right!)}`;
  } else if (leftOk) {
    suffix = ` - ${shortParty(parties.left!)}`;
  }
  return windowsSafeFileName(`${type}${suffix}`);
}
