import "server-only";

import fs from "fs";
import PDFDocument from "pdfkit";
import type { FirmExportBranding } from "@/lib/export/types";
import {
  INVOICE_BODY_PT,
  INVOICE_FIRM_PT,
  INVOICE_FOOTER_PT,
  INVOICE_TITLE_PT,
  TREBUCHET_FONT_FILES,
  buildInvoiceLetterheadModel,
  expandInvoiceAddressLines,
  formatInvoiceDate,
  formatWorkDate,
  moneyUs,
} from "@/lib/export/invoice-letterhead-model";

const MARGIN = 48;

const FONT = {
  regular: "Trebuchet",
  bold: "Trebuchet-Bold",
  italic: "Trebuchet-Italic",
  boldItalic: "Trebuchet-BoldItalic",
} as const;

function registerTrebuchet(doc: PDFKit.PDFDocument) {
  const files = TREBUCHET_FONT_FILES;
  if (
    !fs.existsSync(files.regular) ||
    !fs.existsSync(files.bold) ||
    !fs.existsSync(files.italic) ||
    !fs.existsSync(files.boldItalic)
  ) {
    throw new Error(
      "Trebuchet MS font files are missing from assets/fonts. Expected trebuc.ttf, trebucbd.ttf, trebucit.ttf, trebucbi.ttf.",
    );
  }
  doc.registerFont(FONT.regular, files.regular);
  doc.registerFont(FONT.bold, files.bold);
  doc.registerFont(FONT.italic, files.italic);
  doc.registerFont(FONT.boldItalic, files.boldItalic);
}

function drawAddressLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
): number {
  const trimmed = text.trim();
  if (trimmed.toUpperCase() === "HARARE") {
    doc.font(FONT.bold).fontSize(fontSize).text("HARARE", x, y, {
      width,
      underline: true,
      lineBreak: false,
    });
    return y + fontSize + 4;
  }
  doc.font(FONT.regular).fontSize(fontSize).text(trimmed, x, y, { width });
  return doc.y;
}

/** T Pfigu-style invoice PDF (Trebuchet MS, matches sample letterhead). */
export async function exportInvoiceLetterheadPdf(
  firmId: string,
  invoiceId: string,
  branding: FirmExportBranding,
): Promise<Buffer> {
  const model = await buildInvoiceLetterheadModel(firmId, invoiceId, branding);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    try {
      registerTrebuchet(doc);
    } catch (err) {
      reject(err);
      return;
    }

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - MARGIN * 2;
    let y = MARGIN;

    doc.font(FONT.bold).fontSize(INVOICE_TITLE_PT).text("INVOICE", MARGIN, y, {
      width: pageWidth,
      align: "right",
    });

    doc.font(FONT.bold).fontSize(INVOICE_FIRM_PT).text(model.firmName, MARGIN, y, {
      width: pageWidth * 0.55,
      align: "left",
    });
    y = Math.max(doc.y, y + INVOICE_TITLE_PT + 2) + 4;

    const leftColW = pageWidth * 0.55;
    const rightX = MARGIN + leftColW;
    const rightW = pageWidth - leftColW;

    const addrStartY = y;
    for (const line of model.addressLines) {
      y = drawAddressLine(doc, line, MARGIN, y, leftColW, INVOICE_BODY_PT);
    }

    doc.font(FONT.regular).fontSize(INVOICE_BODY_PT).text(model.invoiceDateLabel, rightX, addrStartY, {
      width: rightW,
      align: "right",
    });

    y = Math.max(y, addrStartY + INVOICE_BODY_PT + 2) + 12;

    if (model.attorneyLine) {
      doc.font(FONT.regular).fontSize(INVOICE_BODY_PT).text(model.attorneyLine, MARGIN, y, {
        width: pageWidth,
      });
      y = doc.y + 10;
    }

    const col1 = MARGIN;
    const col2 = MARGIN + pageWidth * 0.42;
    const col3 = MARGIN + pageWidth * 0.68;
    const headerY = y;
    doc.font(FONT.bold).fontSize(INVOICE_BODY_PT);
    doc.text("Bill to:", col1, headerY);
    doc.text("Payment Terms", col2, headerY, { width: pageWidth * 0.24, align: "center" });
    doc.text("Total Amount", col3, headerY, { width: pageWidth * 0.32, align: "right" });
    y = headerY + INVOICE_BODY_PT + 6;

    const billStartY = y;
    doc.font(FONT.bold).fontSize(INVOICE_BODY_PT).text(model.clientLabel, col1 + 12, y, {
      width: pageWidth * 0.38,
    });
    y = doc.y;
    for (const part of model.clientAddressLines) {
      y = drawAddressLine(doc, part, col1 + 12, y, pageWidth * 0.38, INVOICE_BODY_PT);
    }

    doc.font(FONT.regular).fontSize(INVOICE_BODY_PT);
    doc.text(model.paymentTerms, col2, billStartY, {
      width: pageWidth * 0.24,
      align: "center",
    });
    doc.font(FONT.bold).text(model.totalLabel, col3, billStartY, {
      width: pageWidth * 0.32,
      align: "right",
    });

    y = Math.max(y, billStartY + INVOICE_BODY_PT + 2) + 16;

    if (model.subjectLine) {
      doc.font(FONT.bold).fontSize(INVOICE_BODY_PT).text(model.subjectLine, MARGIN, y, {
        width: pageWidth,
      });
      const ruleY = doc.y + 2;
      doc
        .moveTo(MARGIN, ruleY)
        .lineTo(MARGIN + pageWidth, ruleY)
        .strokeColor("#000000")
        .lineWidth(1)
        .stroke();
      y = ruleY + 8;
    }

    const dateW = 72;
    const amtW = 90;
    const descW = pageWidth - dateW - amtW;
    const dateX = MARGIN;
    const descX = MARGIN + dateW;
    const amtX = MARGIN + dateW + descW;

    doc.font(FONT.bold).fontSize(INVOICE_BODY_PT);
    doc.text("Date", dateX, y, { width: dateW, lineBreak: false });
    doc.text("Description", descX, y, { width: descW, lineBreak: false });
    doc.text("Amount ($)", amtX, y, {
      width: amtW,
      align: "right",
      lineBreak: false,
    });
    y += INVOICE_BODY_PT + 6;

    doc.font(FONT.regular).fontSize(INVOICE_BODY_PT).fillColor("#000000");
    for (const line of model.lines) {
      if (y > doc.page.height - MARGIN - 160) {
        doc.addPage();
        y = MARGIN;
      }
      const rowY = y;
      doc.text(line.workDateLabel, dateX, rowY, { width: dateW });
      doc.text(line.description, descX, rowY, { width: descW - 8 });
      const descBottom = doc.y;
      doc.text(line.amountLabel, amtX, rowY, {
        width: amtW,
        align: "right",
      });
      y = Math.max(descBottom, rowY + INVOICE_BODY_PT + 2) + 6;
    }

    y += 8;
    if (model.discountLabel) {
      doc.font(FONT.regular).fontSize(INVOICE_BODY_PT);
      doc.text("Discount", descX, y, { width: descW - 8 });
      doc.text(model.discountLabel, amtX, y, {
        width: amtW,
        align: "right",
      });
      y += INVOICE_BODY_PT + 6;
    }

    doc.font(FONT.bold).fontSize(INVOICE_BODY_PT);
    doc.text("Total", descX, y, { width: descW - 8 });
    doc.text(model.totalLabel, amtX, y, {
      width: amtW,
      align: "right",
    });
    y += INVOICE_BODY_PT + 10;

    if (model.notes) {
      doc.font(FONT.regular).fontSize(INVOICE_BODY_PT - 1).fillColor("#333333");
      doc.text(model.notes, MARGIN, y, { width: pageWidth });
      y = doc.y + 10;
      doc.fillColor("#000000");
    }

    doc.font(FONT.italic).fontSize(INVOICE_FOOTER_PT);
    doc.text(model.paymentNote, MARGIN, y, { width: pageWidth, align: "justify" });
    y = doc.y + 12;

    if (model.bankingRows.length > 0) {
      doc.font(FONT.bold).fontSize(INVOICE_FOOTER_PT).text("Banking Details:", MARGIN, y);
      y = doc.y + 4;
      doc.font(FONT.bold).fontSize(INVOICE_FOOTER_PT);
      for (const [label, value] of model.bankingRows) {
        doc.text(`${label}: ${value}`, MARGIN, y);
        y = doc.y;
      }
      y += 12;
    }

    doc.font(FONT.italic).fontSize(INVOICE_BODY_PT).text(model.closingNote, MARGIN, y, {
      width: pageWidth,
      align: "left",
    });

    doc.end();
  });
}

export {
  expandInvoiceAddressLines,
  formatInvoiceDate,
  formatWorkDate,
  moneyUs,
};
