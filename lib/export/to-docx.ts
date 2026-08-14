import "server-only";

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ExportRenderOptions } from "@/lib/export/types";

function p(text: string, opts?: { bold?: boolean; size?: number; color?: string }) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 22,
        color: opts?.color,
        font: "Calibri",
      }),
    ],
  });
}

/** Render a structured export document to Word (.docx). */
export async function exportToDocx(opts: ExportRenderOptions): Promise<Buffer> {
  const { branding, document } = opts;
  const blocks: Array<Paragraph | Table> = [];

  blocks.push(p(branding.firmName, { bold: true, size: 28 }));
  for (const line of branding.addressLines) {
    blocks.push(p(line, { size: 20, color: "444444" }));
  }
  if (branding.contactEmail) blocks.push(p(branding.contactEmail, { size: 20, color: "444444" }));
  if (branding.contactPhone) blocks.push(p(branding.contactPhone, { size: 20, color: "444444" }));

  blocks.push(p(document.title, { bold: true, size: 26 }));
  if (document.subtitle) blocks.push(p(document.subtitle, { size: 22, color: "333333" }));
  if (document.asOf) blocks.push(p(`As of ${document.asOf}`, { size: 20 }));
  if (document.note) blocks.push(p(document.note, { size: 18, color: "555555" }));
  if (document.summaryLines?.length) {
    for (const line of document.summaryLines) {
      blocks.push(p(line, { size: 20 }));
    }
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: document.columns.map(
      (col) =>
        new TableCell({
          children: [p(col.header, { bold: true, size: 18 })],
        }),
    ),
  });

  const dataRows = document.rows.map(
    (row) =>
      new TableRow({
        children: document.columns.map(
          (col) =>
            new TableCell({
              children: [p(row[col.key] ?? "", { size: 18 })],
            }),
        ),
      }),
  );

  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  );
  blocks.push(p(branding.footerNote, { size: 16, color: "777777" }));

  const doc = new Document({
    sections: [{ children: blocks }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
