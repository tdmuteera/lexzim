import "server-only";

import fs from "fs";
import PDFDocument from "pdfkit";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Table,
  TableCell,
  TableRow,
  WidthType,
  convertInchesToTwip,
} from "docx";
import { moneyUs, TREBUCHET_FONT_FILES, INVOICE_BODY_PT, INVOICE_FIRM_PT, INVOICE_TITLE_PT, formatInvoiceDate, expandInvoiceAddressLines } from "@/lib/export/invoice-letterhead-model";
import { getFirmProfile } from "@/lib/repos/firm-profile";
import { getProforma } from "@/lib/repos/proformas";
import { AuthError } from "@/lib/auth/types";

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
    throw new Error("Trebuchet MS font files are missing from assets/fonts.");
  }
  doc.registerFont(FONT.regular, files.regular);
  doc.registerFont(FONT.bold, files.bold);
  doc.registerFont(FONT.italic, files.italic);
  doc.registerFont(FONT.boldItalic, files.boldItalic);
}

async function loadModel(firmId: string, id: string) {
  const row = await getProforma(firmId, id);
  if (!row) throw new AuthError("not_found", "Pro forma not found.");
  const profile = await getFirmProfile(firmId);
  const addressLines = expandInvoiceAddressLines(
    [
      profile?.addressLine1,
      profile?.addressLine2,
      [profile?.city, profile?.country].filter(Boolean).join(", "),
    ].filter((x): x is string => Boolean(x && String(x).trim())),
  );

  const included = row.lines.filter((l) => l.included);
  const subjectRaw = (row.proforma.subject || "RE: PRO FORMA INVOICE").trim();
  const subjectLine = subjectRaw.toUpperCase().startsWith("RE")
    ? subjectRaw.toUpperCase()
    : `RE: ${subjectRaw.toUpperCase()}`;

  return {
    firmName: (profile?.name || "Law Firm").toUpperCase(),
    addressLines,
    dateLabel: `Date: ${formatInvoiceDate(row.proforma.createdAt)}`,
    clientLabel: row.clientDisplayLabel,
    subjectLine,
    proformaNumber: row.proforma.proformaNumber,
    currency: row.proforma.currency,
    lines: included.map((l) => ({
      description: l.description,
      amountLabel: moneyUs(l.lineTotalCents, row.proforma.currency),
      moneyClass: l.moneyClass,
    })),
    firmIncomeCents: row.firmIncomeCents,
    clientCollectibleCents: row.clientCollectibleCents,
    totalCents: row.totalCents,
    notes: row.proforma.notes,
  };
}

export async function exportProformaPdf(firmId: string, id: string): Promise<Buffer> {
  const model = await loadModel(firmId, id);

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

    doc.font(FONT.bold).fontSize(INVOICE_TITLE_PT).text("PRO FORMA INVOICE", MARGIN, y, {
      width: pageWidth,
      align: "right",
    });
    doc.font(FONT.bold).fontSize(INVOICE_FIRM_PT).text(model.firmName, MARGIN, y, {
      width: pageWidth * 0.55,
    });
    y = Math.max(doc.y, y + INVOICE_TITLE_PT + 2) + 4;

    for (const line of model.addressLines) {
      doc.font(FONT.regular).fontSize(INVOICE_BODY_PT).text(line, MARGIN, y, {
        width: pageWidth * 0.55,
      });
      y = doc.y;
    }

    doc.font(FONT.regular).fontSize(INVOICE_BODY_PT).text(model.dateLabel, MARGIN + pageWidth * 0.55, MARGIN + INVOICE_TITLE_PT + 6, {
      width: pageWidth * 0.45,
      align: "right",
    });
    doc.text(model.proformaNumber, MARGIN + pageWidth * 0.55, doc.y + 2, {
      width: pageWidth * 0.45,
      align: "right",
    });

    y = Math.max(y, doc.y) + 14;
    doc.font(FONT.bold).fontSize(INVOICE_BODY_PT).text("Bill to:", MARGIN, y);
    y = doc.y + 4;
    doc.font(FONT.bold).text(model.clientLabel, MARGIN + 12, y, { width: pageWidth * 0.7 });
    y = doc.y + 12;

    doc.font(FONT.bold).text(model.subjectLine, MARGIN, y, { width: pageWidth });
    const ruleY = doc.y + 2;
    doc.moveTo(MARGIN, ruleY).lineTo(MARGIN + pageWidth, ruleY).strokeColor("#000").lineWidth(1).stroke();
    y = ruleY + 10;

    const amtW = 100;
    const descW = pageWidth - amtW;
    doc.font(FONT.bold).fontSize(INVOICE_BODY_PT);
    doc.text("Description", MARGIN, y, { width: descW });
    doc.text("Amount", MARGIN + descW, y, { width: amtW, align: "right" });
    y = doc.y + 6;

    doc.font(FONT.regular);
    for (const line of model.lines) {
      const startY = y;
      doc.text(line.description, MARGIN, y, { width: descW });
      const afterDesc = doc.y;
      doc.text(line.amountLabel, MARGIN + descW, startY, { width: amtW, align: "right" });
      y = Math.max(afterDesc, startY + INVOICE_BODY_PT) + 4;
      if (y > doc.page.height - MARGIN - 80) {
        doc.addPage();
        y = MARGIN;
      }
    }

    y += 10;
    doc.font(FONT.regular).text(
      `Firm fees (earnings): ${moneyUs(model.firmIncomeCents, model.currency)}`,
      MARGIN,
      y,
      { width: pageWidth, align: "right" },
    );
    y = doc.y + 2;
    doc.text(
      `Collectibles (pay onward): ${moneyUs(model.clientCollectibleCents, model.currency)}`,
      MARGIN,
      y,
      { width: pageWidth, align: "right" },
    );
    y = doc.y + 4;
    doc.font(FONT.bold).text(`Total: ${moneyUs(model.totalCents, model.currency)}`, MARGIN, y, {
      width: pageWidth,
      align: "right",
    });

    y = doc.y + 14;
    doc.font(FONT.italic).fontSize(9).fillColor("#444").text(
      "This is a pro forma estimate and is subject to change. It is not a tax invoice and does not create a ledger balance until converted.",
      MARGIN,
      y,
      { width: pageWidth },
    );

    if (model.notes) {
      y = doc.y + 10;
      doc.font(FONT.regular).fontSize(INVOICE_BODY_PT).fillColor("#000").text("Notes", MARGIN, y);
      y = doc.y + 2;
      doc.text(model.notes, MARGIN, y, { width: pageWidth });
    }

    doc.end();
  });
}

export async function exportProformaDocx(firmId: string, id: string): Promise<Buffer> {
  const model = await loadModel(firmId, id);
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "PRO FORMA INVOICE", bold: true, font: "Trebuchet MS", size: 24 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: model.firmName, bold: true, font: "Trebuchet MS", size: 24 })],
    }),
    ...model.addressLines.map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, font: "Trebuchet MS", size: 23 })],
        }),
    ),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: model.dateLabel, font: "Trebuchet MS", size: 23 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: model.proformaNumber, font: "Trebuchet MS", size: 23 })],
    }),
    new Paragraph({ children: [] }),
    new Paragraph({
      children: [new TextRun({ text: "Bill to:", bold: true, font: "Trebuchet MS", size: 23 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: model.clientLabel, bold: true, font: "Trebuchet MS", size: 23 })],
    }),
    new Paragraph({ children: [] }),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      },
      children: [new TextRun({ text: model.subjectLine, bold: true, font: "Trebuchet MS", size: 23 })],
    }),
    new Paragraph({ children: [] }),
  ];

  const tableRows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 7000, type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [new TextRun({ text: "Description", bold: true, font: "Trebuchet MS", size: 23 })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 2000, type: WidthType.DXA },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "Amount", bold: true, font: "Trebuchet MS", size: 23 })],
            }),
          ],
        }),
      ],
    }),
    ...model.lines.map(
      (line) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 7000, type: WidthType.DXA },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: line.description, font: "Trebuchet MS", size: 23 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 2000, type: WidthType.DXA },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: line.amountLabel, font: "Trebuchet MS", size: 23 })],
                }),
              ],
            }),
          ],
        }),
    ),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.7),
              bottom: convertInchesToTwip(0.7),
              left: convertInchesToTwip(0.7),
              right: convertInchesToTwip(0.7),
            },
          },
        },
        children: [
          ...children,
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            rows: tableRows,
          }),
          new Paragraph({ children: [] }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `Firm fees (earnings): ${moneyUs(model.firmIncomeCents, model.currency)}`,
                font: "Trebuchet MS",
                size: 23,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `Collectibles (pay onward): ${moneyUs(model.clientCollectibleCents, model.currency)}`,
                font: "Trebuchet MS",
                size: 23,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `Total: ${moneyUs(model.totalCents, model.currency)}`,
                bold: true,
                font: "Trebuchet MS",
                size: 23,
              }),
            ],
          }),
          new Paragraph({ children: [] }),
          new Paragraph({
            children: [
              new TextRun({
                text: "This is a pro forma estimate and is subject to change. It is not a tax invoice and does not create a ledger balance until converted.",
                italics: true,
                font: "Trebuchet MS",
                size: 18,
              }),
            ],
          }),
          ...(model.notes
            ? [
                new Paragraph({ children: [] }),
                new Paragraph({
                  children: [new TextRun({ text: "Notes", bold: true, font: "Trebuchet MS", size: 23 })],
                }),
                new Paragraph({
                  children: [new TextRun({ text: model.notes, font: "Trebuchet MS", size: 23 })],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
