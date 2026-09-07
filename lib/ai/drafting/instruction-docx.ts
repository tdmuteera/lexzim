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
  let text = stripChatPreamble(stripFormatLine(body)).replace(/\r\n/g, "\n");

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
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

type Line =
  | { kind: "heading"; text: string; level: 1 | 2 }
  | { kind: "bullet"; text: string }
  | { kind: "number"; text: string }
  | { kind: "blank" }
  | { kind: "meta"; text: string }
  | { kind: "body"; text: string };

const STREET_OR_ENTITY =
  /\b(avenue|street|road|drive|close|crescent|shop|harare|bulawayo|mutare|gweru|pvt|pty|ltd|limited|cc)\b/i;

function isLetterMeta(line: string): boolean {
  return /^(to|from|date|dear\b|re:|re\b|yours\b|kind regards|best regards|dated at|take notice|take further notice)\b/i.test(
    line,
  );
}

function classifyLine(raw: string): Line {
  const line = raw.trim();
  if (!line) return { kind: "blank" };

  const md = line.match(/^(#{1,6})\s+(.*)$/);
  if (md) {
    return { kind: "heading", text: md[2].trim(), level: md[1].length <= 2 ? 1 : 2 };
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

  const numbered = line.match(/^\d+[.)]\s+(.*)$/);
  if (numbered) return { kind: "number", text: numbered[1].trim() };

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
  },
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: {
      before: opts.before ?? 0,
      after: opts.after ?? 120,
      line: opts.line,
      lineRule: LineRuleType.AUTO,
    },
    ...(opts.bullet ? { bullet: { level: 0 } } : {}),
    ...(opts.numbering ? { numbering: { reference: "lexzim-numbers", level: 0 } } : {}),
    children,
  });
}

/**
 * Build a Word file from AI draft text using LexZim house style
 * (Trebuchet MS, 12pt, 1.5, justified, plain black) unless the user
 * explicitly requested another font/size/spacing.
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
  const rawLines = text.split("\n");
  const line = houseLineSpacingTwips(style.lineSpacing);
  const sizeHalfPoints = houseFontSizeHalfPoints(style.fontSizePt);
  const bodyAlign = style.justified ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;

  const firstMeaningful = rawLines.find((l) => l.trim())?.trim().replace(/\*\*/g, "").replace(/^#+\s+/, "") ?? "";
  const skipTitle = firstMeaningful.toLowerCase() === displayTitle.trim().toLowerCase();

  const children: Paragraph[] = [];
  if (!skipTitle) {
    children.push(
      para(
        [
          new TextRun({
            text: displayTitle,
            ...houseRunOptions({
              font: style.font,
              fontSizePt: style.fontSizePt + 3,
              color: style.color,
              bold: true,
            }),
          }),
        ],
        { align: AlignmentType.CENTER, after: 240, line },
      ),
    );
  }

  for (const raw of rawLines) {
    const item = classifyLine(raw);
    if (item.kind === "blank") {
      children.push(
        new Paragraph({
          spacing: { after: 60, line, lineRule: LineRuleType.AUTO },
          children: [],
        }),
      );
      continue;
    }

    if (item.kind === "heading") {
      children.push(
        para(inlineRuns(item.text, style, { bold: true, fontSizePt: style.fontSizePt + (item.level === 1 ? 2 : 1) }), {
          align: AlignmentType.CENTER,
          before: 200,
          after: 80,
          line,
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
      children.push(para(inlineRuns(item.text, style), { align: bodyAlign, after: 60, line, bullet: true }));
      continue;
    }

    if (item.kind === "number") {
      children.push(para(inlineRuns(item.text, style), { align: bodyAlign, after: 60, line, numbering: true }));
      continue;
    }

    children.push(para(inlineRuns(item.text, style), { align: bodyAlign, after: 120, line }));
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
    lineSpacing: style.lineSpacing,
    plainText: text,
  };
}
