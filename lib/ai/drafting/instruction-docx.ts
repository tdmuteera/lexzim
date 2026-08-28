import "server-only";

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
import { parseDocxStyle } from "@/lib/ai/intent";
import type { DocxStyleOptions } from "@/lib/ai/drafting/house-style";

function stripFormatLine(body: string): string {
  return body.replace(/^FORMAT:.*\n+/i, "").trim();
}

/** Remove markdown noise the model likes to emit that should not print. */
function cleanBody(body: string): string {
  return stripFormatLine(body)
    .replace(/\r\n/g, "\n")
    // Drop a trailing Sources/References block; the letter carries its own authorities inline.
    .replace(/\n{2,}#{0,4}\s*(sources?|references?)\s*:?\s*\n[\s\S]*$/i, "\n")
    // Drop horizontal rules.
    .replace(/\n\s*(-{3,}|\*{3,}|_{3,})\s*(?=\n|$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Line =
  | { kind: "heading"; text: string; level: 1 | 2 }
  | { kind: "bullet"; text: string }
  | { kind: "number"; text: string }
  | { kind: "blank" }
  | { kind: "body"; text: string };

function classifyLine(raw: string): Line {
  const line = raw.trim();
  if (!line) return { kind: "blank" };

  const md = line.match(/^(#{1,6})\s+(.*)$/);
  if (md) {
    return { kind: "heading", text: md[2].trim(), level: md[1].length <= 2 ? 1 : 2 };
  }

  // A whole line that is just **Heading** or **Heading:** → heading.
  const boldOnly = line.match(/^\*\*(.+?):?\*\*:?$/);
  if (boldOnly) {
    return { kind: "heading", text: boldOnly[1].trim(), level: 2 };
  }

  const bullet = line.match(/^[-*•]\s+(.*)$/);
  if (bullet) return { kind: "bullet", text: bullet[1].trim() };

  const numbered = line.match(/^\d+[.)]\s+(.*)$/);
  if (numbered) return { kind: "number", text: numbered[1].trim() };

  // Short non-terminated Title Case line with no trailing punctuation → heading.
  if (
    line.length <= 60 &&
    !/[.:;,]$/.test(line) &&
    /^[A-Z0-9]/.test(line) &&
    line.split(/\s+/).length <= 8 &&
    !/^(date|to|from|dear|re|best regards|yours|kind regards)/i.test(line)
  ) {
    return { kind: "heading", text: line, level: 2 };
  }

  return { kind: "body", text: line };
}

/** Bracketed placeholder text (e.g. [CLIENT NAME]) prints in red so a lawyer can spot it at a glance. */
const PLACEHOLDER_COLOR = "FF0000";
const INLINE_SPLIT_RE = /(\*\*[^*]+\*\*|\[[^[\]\n]{1,160}\])/g;

/** Split inline markdown bold (**x**) and [BRACKETED PLACEHOLDERS] into docx runs. */
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

/**
 * Build a Word file from AI draft text using LexZim house style
 * (Trebuchet MS, 12pt, 1.5, justified, plain black) unless the user
 * explicitly requested another font/size/spacing.
 */
export async function packInstructionDocx(input: {
  title: string;
  body: string;
  question: string;
}): Promise<{ bytes: Buffer; fileName: string; font: string; lineSpacing: number }> {
  const style = parseDocxStyle(input.question);
  const text = cleanBody(input.body);
  const rawLines = text.split("\n");
  const line = houseLineSpacingTwips(style.lineSpacing);
  const sizeHalfPoints = houseFontSizeHalfPoints(style.fontSizePt);
  const bodyAlign = style.justified ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;

  // Avoid repeating the title if the body already opens with it.
  const firstMeaningful = rawLines.find((l) => l.trim())?.trim().replace(/\*\*/g, "") ?? "";
  const skipTitle =
    firstMeaningful.toLowerCase() === input.title.trim().toLowerCase();

  const children: Paragraph[] = [];
  if (!skipTitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 240, line, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({
            text: input.title,
            ...houseRunOptions({
              font: style.font,
              fontSizePt: style.fontSizePt + 3,
              color: style.color,
              bold: true,
            }),
          }),
        ],
      }),
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
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 160, after: 80, line, lineRule: LineRuleType.AUTO },
          children: inlineRuns(item.text, style, {
            bold: true,
            fontSizePt: style.fontSizePt + (item.level === 1 ? 2 : 1),
          }),
        }),
      );
      continue;
    }

    if (item.kind === "bullet") {
      children.push(
        new Paragraph({
          alignment: bodyAlign,
          bullet: { level: 0 },
          spacing: { after: 60, line, lineRule: LineRuleType.AUTO },
          children: inlineRuns(item.text, style),
        }),
      );
      continue;
    }

    if (item.kind === "number") {
      children.push(
        new Paragraph({
          alignment: bodyAlign,
          numbering: { reference: "lexzim-numbers", level: 0 },
          spacing: { after: 60, line, lineRule: LineRuleType.AUTO },
          children: inlineRuns(item.text, style),
        }),
      );
      continue;
    }

    children.push(
      new Paragraph({
        alignment: bodyAlign,
        spacing: { after: 120, line, lineRule: LineRuleType.AUTO },
        children: inlineRuns(item.text, style),
      }),
    );
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
    sections: [{ children }],
  });

  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return {
    bytes: Buffer.from(await Packer.toBuffer(doc)),
    fileName: `${slug || "lexzim-draft"}.docx`,
    font: style.font,
    lineSpacing: style.lineSpacing,
  };
}
