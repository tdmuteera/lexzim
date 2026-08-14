import "server-only";

import {
  AlignmentType,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { parseDocxStyle } from "@/lib/ai/intent";

function stripFormatLine(body: string): string {
  return body.replace(/^FORMAT:.*\n+/i, "").trim();
}

/**
 * Build a Word file from AI draft text, honouring font and line-spacing instructions.
 */
export async function packInstructionDocx(input: {
  title: string;
  body: string;
  question: string;
}): Promise<{ bytes: Buffer; fileName: string; font: string; lineSpacing: number }> {
  const style = parseDocxStyle(input.question);
  const text = stripFormatLine(input.body);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const line = Math.round(style.lineSpacing * 240);
  const sizeHalfPoints = style.fontSizePt * 2;

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 200, line, lineRule: LineRuleType.AUTO },
      children: [
        new TextRun({
          text: input.title,
          bold: true,
          font: style.font,
          size: sizeHalfPoints + 4,
        }),
      ],
    }),
  ];

  for (const raw of lines) {
    if (raw.trim() === "") {
      children.push(
        new Paragraph({
          spacing: { after: 80, line, lineRule: LineRuleType.AUTO },
          children: [],
        }),
      );
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { after: 120, line, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({
            text: raw.replace(/^#+\s+/, "").replace(/\*\*/g, ""),
            font: style.font,
            size: sizeHalfPoints,
            bold: raw.startsWith("#"),
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: style.font, size: sizeHalfPoints },
        },
      },
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
