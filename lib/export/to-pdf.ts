import "server-only";

import PDFDocument from "pdfkit";
import type { ExportRenderOptions } from "@/lib/export/types";

const PAGE_MARGIN = 48;
const ROWS_PER_PAGE_HINT = 28;

function drawHeader(doc: InstanceType<typeof PDFDocument>, opts: ExportRenderOptions) {
  const { branding, document } = opts;
  doc.font("Helvetica-Bold").fontSize(16).text(branding.firmName, { align: "left" });
  doc.font("Helvetica").fontSize(9).fillColor("#444444");
  for (const line of branding.addressLines) {
    doc.text(line);
  }
  if (branding.contactEmail) doc.text(branding.contactEmail);
  if (branding.contactPhone) doc.text(branding.contactPhone);
  doc.moveDown(0.6);
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(14).text(document.title);
  if (document.subtitle) {
    doc.font("Helvetica").fontSize(10).fillColor("#333333").text(document.subtitle);
  }
  if (document.asOf) {
    doc.fontSize(9).text(`As of ${document.asOf}`);
  }
  if (document.note) {
    doc.moveDown(0.3).fontSize(8).fillColor("#555555").text(document.note, { width: 500 });
  }
  doc.moveDown(0.5).fillColor("#000000");
  if (document.summaryLines?.length) {
    doc.font("Helvetica").fontSize(9);
    for (const line of document.summaryLines) {
      doc.text(line);
    }
    doc.moveDown(0.4);
  }
}

function drawTable(doc: InstanceType<typeof PDFDocument>, opts: ExportRenderOptions) {
  const { columns, rows } = opts.document;
  if (!columns.length) return;

  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidth = tableWidth / columns.length;
  const startX = PAGE_MARGIN;
  let y = doc.y;

  const drawRow = (cells: string[], bold = false) => {
    if (y > doc.page.height - PAGE_MARGIN - 40) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    let x = startX;
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i]!;
      const text = cells[i] ?? "";
      const align = col.align === "right" ? "right" : "left";
      doc.text(text, x + 2, y, {
        width: colWidth - 4,
        align,
        lineBreak: false,
        ellipsis: true,
      });
      x += colWidth;
    }
    y += 14;
    doc.y = y;
  };

  drawRow(columns.map((c) => c.header), true);
  doc.moveTo(startX, y - 2).lineTo(startX + tableWidth, y - 2).strokeColor("#cccccc").stroke();
  doc.strokeColor("#000000");

  for (let i = 0; i < rows.length; i += 1) {
    if (i > 0 && i % ROWS_PER_PAGE_HINT === 0) {
      doc.addPage();
      y = PAGE_MARGIN;
      drawRow(columns.map((c) => c.header), true);
    }
    const row = rows[i]!;
    drawRow(columns.map((c) => row[c.key] ?? ""));
  }
}

function drawFooter(doc: InstanceType<typeof PDFDocument>, footer: string) {
  const bottom = doc.page.height - PAGE_MARGIN + 12;
  doc.font("Helvetica").fontSize(8).fillColor("#777777");
  doc.text(footer, PAGE_MARGIN, bottom, {
    width: doc.page.width - PAGE_MARGIN * 2,
    align: "center",
  });
  doc.fillColor("#000000");
}

/** Render a structured export document to PDF bytes (pdfkit). */
export async function exportToPdf(opts: ExportRenderOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, opts);
    drawTable(doc, opts);
    drawFooter(doc, opts.branding.footerNote);

    doc.end();
  });
}
