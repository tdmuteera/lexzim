import "server-only";

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

/**
 * Pack edited plain text into a simple .docx for matter document save.
 * Used after merge preview / AI polish (not a round-trip of original template layout).
 */
export async function packPlainTextDocx(input: {
  title: string;
  body: string;
  aiAssisted?: boolean;
}): Promise<Buffer> {
  const lines = input.body.replace(/\r\n/g, "\n").split("\n");
  const children: Paragraph[] = [];

  if (input.aiAssisted) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "AI draft — review before filing or service",
            bold: true,
            color: "A85345",
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: input.title, bold: true, size: 28 })],
    }),
  );

  for (const line of lines) {
    if (line.trim() === "") {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    } else {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: line })],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
