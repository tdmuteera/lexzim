import {
  AlignmentType,
  Document,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  houseFontSizeHalfPoints,
  houseLineSpacingTwips,
  houseRunOptions,
} from "@/lib/ai/drafting/house-style";
import { draftDisplayTitle, draftFileName } from "@/lib/ai/drafting/draft-file-name";
import { isCourtPleading, splitDraftFromChat, tightenPlaceholders } from "@/lib/ai/drafting/split-draft";
import { parseDocxStyle } from "@/lib/ai/intent";
import type { DocxStyleOptions } from "@/lib/ai/drafting/house-style";

const A4_WIDTH = 11906;
const A4_HEIGHT = 16838;
const MARGIN = 1418; // 25mm

function harareLongDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", {
    timeZone: "Africa/Harare",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function stripFormatLine(body: string): string {
  return body.replace(/^FORMAT:.*\n+/i, "").trim();
}

function stripChatPreamble(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) {
      i += 1;
      continue;
    }
    if (/^(i['’]ve|i have)\s+(drafted|prepared|created|written)\b/i.test(t)) {
      i += 1;
      continue;
    }
    if (/^here is (the|your|a)\b/i.test(t) && t.length < 160) {
      i += 1;
      continue;
    }
    if (/^formatted in\b/i.test(t) || /^download (it )?below\b/i.test(t)) {
      i += 1;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n").trim();
}

/** Remove markdown noise and chat-only blocks that must not print in Word. */
export function cleanDraftBodyForDocx(
  body: string,
  today = harareLongDate(),
  question = "",
): string {
  const split = splitDraftFromChat(stripChatPreamble(stripFormatLine(body)));
  let text = tightenPlaceholders(split.draft).replace(/\r\n/g, "\n");

  text = text.replace(/\n{0,2}\s*\*{0,2}FILE NOTE\*{0,2}:[\s\S]*$/i, "\n");
  text = text.replace(/\n{2,}#{0,4}\s*(sources?|references?)\s*:?\s*\n[\s\S]*$/i, "\n");
  text = text.replace(/\n\s*(-{3,}|\*{3,}|_{3,})\s*(?=\n|$)/g, "\n");
  text = text.replace(/\[(INSERT TODAY'?S DATE|DATE|TODAY'?S DATE)\]/gi, today);
  text = text.replace(/^\[(?:letterhead|attorney name|firm details)[^\]]*\]\s*$/gim, "");
  if (/\b(whereas|now therefore|in witness whereof|now it is hereby agreed)\b/i.test(text)) {
    text = text.replace(/\n+yours faithfully\s*$/i, "");
  }
  if (!/\b(legal practitioners?|attorneys?\s+at\s+law|law firm)\b/i.test(question)) {
    text = text.replace(
      /(yours faithfully)\s*\n[\s\S]*\b(legal practitioners?|attorneys?\s+at\s+law)\b[\s\S]*$/i,
      "$1\n",
    );
  }
  text = text.replace(/\*\*/g, "");
  text = text.replace(/\\_/g, "_");
  text = injectNamedNoticeParties(question, text);
  if (isCourtPleading(text)) {
    text = text.replace(
      /^CASE NO\.?\s*:?\s*HC(?:\s{2,}\/\s*\d{2}|\s*\/\s*\d{2}|)\s*$/gim,
      "CASE NO. [TO BE ALLOCATED]",
    );
    text = text.replace(/CASE NO\.?\s*:?\s*HC\s*\[TO BE ALLOCATED\]/gi, "CASE NO. [TO BE ALLOCATED]");
    text = text.replace(/^\(?\[?TO BE ALLOCATED\]?\)?\s*$/gim, "");
    text = text.replace(/\n{3,}/g, "\n\n");
  } else {
    text = text.replace(/\n{3,}/g, "\n\n");
  }
  return text.trim();
}

/** If the user named a tenant/landlord, the notice must say so. */
export function injectNamedNoticeParties(question: string, text: string): string {
  if (!/\bnotice of termination\b/i.test(`${question}\n${text}`)) return text;
  const tenant = question.match(/\btenant\s+([^,]+)/i)?.[1]?.replace(/\s+/g, " ").trim();
  if (!tenant) return text;
  const key = tenant.replace(/\(pvt\)\s*ltd/i, "").replace(/\s+/g, " ").trim();
  if (key.length >= 8 && text.toLowerCase().includes(key.slice(0, 16).toLowerCase())) return text;
  if (/^TO:/im.test(text)) {
    return text.replace(/^TO:\s*[^\n]*/im, `TO: ${tenant}`);
  }
  if (/^NOTICE OF[^\n]*\n+/i.test(text)) {
    return text.replace(/^(NOTICE OF[^\n]*\n+)/i, `$1TO: ${tenant}\n\n`);
  }
  return `TO: ${tenant}\n\n${text}`;
}

type Line =
  | { kind: "heading"; text: string; level: 1 | 2 }
  | { kind: "bullet"; text: string }
  | { kind: "number"; text: string }
  | { kind: "plead"; num: string; text: string }
  | { kind: "blank" }
  | { kind: "meta"; text: string }
  | { kind: "caption"; text: string }
  | { kind: "party"; text: string }
  | { kind: "body"; text: string };

const STREET_OR_ENTITY =
  /\b(avenue|street|road|drive|close|crescent|shop|harare|bulawayo|mutare|gweru|pvt|pty|ltd|limited|cc)\b/i;

const SECTION_HEAD =
  /^(summons|prayer|particulars of claim|wherefore|declaration|notice of intention|founding affidavit|opposing affidavit)$/i;

function formatPartyLine(line: string): string {
  const m = line.match(/^(.*?)\s+(\.{3,}\s*)?(Plaintiff|Defendant|Applicant|Respondent)\s*$/i);
  if (!m) return line;
  const name = m[1].replace(/\.+$/, "").replace(/\s+/g, " ").trim();
  const role = m[3][0].toUpperCase() + m[3].slice(1).toLowerCase();
  const pad = Math.max(8, 62 - name.length - role.length);
  return `${name} ${".".repeat(pad)} ${role}`;
}

function isLetterMeta(line: string): boolean {
  return /^(to|from|date|dear\b|re:|re\b|yours\b|kind regards|best regards|dated at|take notice|take further notice)\b/i.test(
    line,
  );
}

function classifyLine(raw: string, court: boolean): Line {
  const line = raw.trim();
  if (!line) return { kind: "blank" };

  const md = line.match(/^(#{1,6})\s+(.*)$/);
  if (md) {
    return { kind: "heading", text: md[2].trim(), level: md[1].length <= 2 ? 1 : 2 };
  }

  if (court) {
    if (/^in the (high|magistrates|labour) court/i.test(line) || /^at [A-Z]/i.test(line) && line.length < 40) {
      return { kind: "caption", text: line.replace(/\*\*/g, "") };
    }
    if (/^in the matter between:?$/i.test(line) || /^case no/i.test(line)) {
      return { kind: "caption", text: line.replace(/\*\*/g, "") };
    }
    if (
      (/\.{5,}/.test(line) || /\s{4,}/.test(line)) &&
      /\b(plaintiff|defendant|applicant|respondent)\s*$/i.test(line) &&
      !/[.]$/.test(line)
    ) {
      return { kind: "party", text: formatPartyLine(line.replace(/\*\*/g, "")) };
    }
    if (/^and$/i.test(line)) return { kind: "caption", text: "and" };
    if (/legal practitioners?$/i.test(line) || /^_{8,}/.test(line)) {
      return { kind: "meta", text: line.replace(/\*\*/g, "") };
    }
    if (SECTION_HEAD.test(line.replace(/\*\*/g, ""))) {
      return { kind: "heading", text: line.replace(/\*\*/g, ""), level: 1 };
    }
    const plead = line.match(/^(\d+)\.\s+(.*)$/);
    if (plead) return { kind: "plead", num: plead[1], text: plead[2] };
    const sub = line.match(/^([a-z])\)\s+(.*)$/i);
    if (sub) return { kind: "body", text: `${sub[1]}) ${sub[2]}` };
  }

  const boldOnly = line.match(/^\*\*(.+?):?\*\*:?$/);
  if (boldOnly) {
    const inner = boldOnly[1].trim();
    if (isLetterMeta(inner) || STREET_OR_ENTITY.test(inner) || /\d/.test(inner)) {
      return { kind: isLetterMeta(inner) ? "meta" : "body", text: inner };
    }
    return { kind: "heading", text: inner, level: 2 };
  }

  const bullet = line.match(/^[-*•]\s+(.*)$/);
  if (bullet) return { kind: "bullet", text: bullet[1].trim() };

  if (!court) {
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) return { kind: "number", text: numbered[1].trim() };
  }

  if (isLetterMeta(line)) return { kind: "meta", text: line };

  if (
    line.length <= 60 &&
    !/[.:;,]$/.test(line) &&
    /^[A-Z0-9]/.test(line) &&
    line.split(/\s+/).length <= 8 &&
    !isLetterMeta(line) &&
    !STREET_OR_ENTITY.test(line) &&
    !/\d/.test(line)
  ) {
    return { kind: "heading", text: line, level: 2 };
  }

  return { kind: "body", text: line };
}

const PLACEHOLDER_COLOR = "FF0000";
const INLINE_SPLIT_RE = /(\*\*[^*]+\*\*|\[[^[\]\n]{1,160}\])/g;

function inlineRuns(
  text: string,
  style: DocxStyleOptions,
  opts?: { bold?: boolean; fontSizePt?: number },
): TextRun[] {
  const clean = text.replace(/`/g, "");
  const parts = clean.split(INLINE_SPLIT_RE).filter((p) => p !== "");
  if (parts.length === 0) parts.push("");
  return parts.map((part) => {
    const boldSeg = /^\*\*[^*]+\*\*$/.test(part);
    const placeholderSeg = /^\[[^[\]\n]{1,160}\]$/.test(part);
    const value = part.replace(/\*\*/g, "");
    return new TextRun({
      text: value,
      ...houseRunOptions({
        font: style.font,
        fontSizePt: opts?.fontSizePt ?? style.fontSizePt,
        color: placeholderSeg ? PLACEHOLDER_COLOR : style.color,
        bold: opts?.bold || boldSeg,
      }),
    });
  });
}

function para(
  children: TextRun[],
  opts: {
    align: (typeof AlignmentType)[keyof typeof AlignmentType];
    before?: number;
    after?: number;
    line: number;
    bullet?: boolean;
    numbering?: boolean;
    indentLeft?: number;
    hanging?: number;
  },
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: {
      before: opts.before ?? 0,
      after: opts.after ?? 60,
      line: opts.line,
      lineRule: LineRuleType.AUTO,
    },
    ...(opts.bullet ? { bullet: { level: 0 } } : {}),
    ...(opts.numbering ? { numbering: { reference: "lexzim-numbers", level: 0 } } : {}),
    ...(opts.indentLeft || opts.hanging
      ? { indent: { left: opts.indentLeft ?? 0, hanging: opts.hanging ?? 0 } }
      : {}),
    children,
  });
}

function collapseCourtBlanks(lines: string[]): string[] {
  const out: string[] = [];
  let prevKind: Line["kind"] | "" = "";
  for (const raw of lines) {
    const kind = classifyLine(raw, true).kind;
    if (kind === "blank") {
      if (prevKind === "plead" || prevKind === "party" || prevKind === "caption") continue;
      if (out.length && classifyLine(out[out.length - 1], true).kind === "blank") continue;
    }
    out.push(raw);
    prevKind = kind;
  }
  return out;
}

/**
 * Build a Word file from AI draft text using LexZim house style
 * unless the user explicitly requested another font/size/spacing.
 */
export async function packInstructionDocx(input: {
  title: string;
  body: string;
  question: string;
}): Promise<{
  bytes: Buffer;
  fileName: string;
  font: string;
  lineSpacing: number;
  plainText: string;
}> {
  const style = parseDocxStyle(input.question);
  const text = cleanDraftBodyForDocx(input.body, harareLongDate(), input.question);
  const court = isCourtPleading(text);
  const lineSpacing = court ? 1.15 : style.lineSpacing;
  const displayTitle = draftDisplayTitle({
    question: input.question,
    body: text,
    fallback: input.title,
  });
  const fileName = draftFileName({
    question: input.question,
    body: text,
    title: displayTitle,
  });
  let rawLines = text.split("\n");
  if (court) rawLines = collapseCourtBlanks(rawLines);
  const line = houseLineSpacingTwips(lineSpacing);
  const sizeHalfPoints = houseFontSizeHalfPoints(style.fontSizePt);
  const bodyAlign = court ? AlignmentType.LEFT : style.justified ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;
  const tightAfter = court ? 40 : 60;

  const firstMeaningful = rawLines.find((l) => l.trim())?.trim().replace(/\*\*/g, "").replace(/^#+\s+/, "") ?? "";
  const skipTitle =
    court || firstMeaningful.toLowerCase() === displayTitle.trim().toLowerCase();

  const children: Paragraph[] = [];
  if (!skipTitle) {
    children.push(
      para(
        [
          new TextRun({
            text: displayTitle,
            ...houseRunOptions({
              font: style.font,
              fontSizePt: style.fontSizePt + 2,
              color: style.color,
              bold: true,
            }),
          }),
        ],
        { align: AlignmentType.CENTER, after: 160, line },
      ),
    );
  }

  for (const raw of rawLines) {
    const item = classifyLine(raw, court);
    if (item.kind === "blank") {
      continue;
    }

    if (item.kind === "caption") {
      children.push(
        para(inlineRuns(item.text, style, { bold: true }), {
          align: AlignmentType.CENTER,
          after: 20,
          line,
        }),
      );
      continue;
    }

    if (item.kind === "party") {
      children.push(
        para(inlineRuns(item.text, style), {
          align: AlignmentType.LEFT,
          after: 20,
          line,
        }),
      );
      continue;
    }

    if (item.kind === "heading") {
      children.push(
        para(inlineRuns(item.text, style, { bold: true, fontSizePt: style.fontSizePt + (item.level === 1 ? 1 : 0) }), {
          align: AlignmentType.CENTER,
          before: court ? 120 : 160,
          after: court ? 40 : 80,
          line,
        }),
      );
      continue;
    }

    if (item.kind === "plead") {
      children.push(
        para(inlineRuns(`${item.num}.  ${item.text}`, style), {
          align: AlignmentType.JUSTIFIED,
          after: tightAfter,
          line,
          indentLeft: 360,
          hanging: 360,
        }),
      );
      continue;
    }

    if (item.kind === "meta") {
      children.push(
        para(inlineRuns(item.text, style, { bold: /^(to|from|re:)/i.test(item.text) }), {
          align: AlignmentType.LEFT,
          after: 40,
          line,
        }),
      );
      continue;
    }

    if (item.kind === "bullet") {
      children.push(para(inlineRuns(item.text, style), { align: bodyAlign, after: 40, line, bullet: true }));
      continue;
    }

    if (item.kind === "number") {
      children.push(para(inlineRuns(item.text, style), { align: bodyAlign, after: 40, line, numbering: true }));
      continue;
    }

    children.push(para(inlineRuns(item.text, style), { align: bodyAlign, after: tightAfter, line }));
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: style.font,
            size: sizeHalfPoints,
            color: style.color,
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "lexzim-numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 480, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH, height: A4_HEIGHT },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children,
      },
    ],
  });

  return {
    bytes: Buffer.from(await Packer.toBuffer(doc)),
    fileName,
    font: style.font,
    lineSpacing,
    plainText: text,
  };
}
