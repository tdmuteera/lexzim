import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  convertInchesToTwip,
} from "docx";
import type { FirmExportBranding } from "@/lib/export/types";
import {
  INVOICE_BODY_PT,
  INVOICE_FIRM_PT,
  INVOICE_FONT_FAMILY,
  INVOICE_FOOTER_PT,
  INVOICE_TITLE_PT,
  buildInvoiceLetterheadModel,
  type InvoiceLetterheadModel,
} from "@/lib/export/invoice-letterhead-model";

/** Match PDFKit A4 + 48pt margins. */
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = convertInchesToTwip(48 / 72); // 48pt
const CONTENT_W = PAGE_W - MARGIN * 2;

/** docx half-points (Word size unit). */
const BODY = Math.round(INVOICE_BODY_PT * 2);
const TITLE = Math.round(INVOICE_TITLE_PT * 2);
const FIRM = Math.round(INVOICE_FIRM_PT * 2);
const NOTE = Math.round((INVOICE_BODY_PT - 1) * 2);
const FOOTER = Math.round(INVOICE_FOOTER_PT * 2);

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
} as const;

const RULE_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000", space: 1 },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
} as const;

function run(
  text: string,
  opts?: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    underline?: boolean;
    color?: string;
  },
) {
  return new TextRun({
    text,
    bold: opts?.bold,
    italics: opts?.italic,
    size: opts?.size ?? BODY,
    font: INVOICE_FONT_FAMILY,
    color: opts?.color,
    underline: opts?.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

function para(
  text: string,
  opts?: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    underline?: boolean;
    color?: string;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    after?: number;
    before?: number;
    indentLeft?: number;
    borderBottom?: boolean;
  },
) {
  return new Paragraph({
    alignment: opts?.align,
    spacing: { after: opts?.after ?? 60, before: opts?.before ?? 0, line: 276 },
    indent: opts?.indentLeft ? { left: opts.indentLeft } : undefined,
    border: opts?.borderBottom ? RULE_BORDER : undefined,
    children: [
      run(text, {
        bold: opts?.bold,
        italic: opts?.italic,
        size: opts?.size,
        underline: opts?.underline,
        color: opts?.color,
      }),
    ],
  });
}

function emptyPara(after = 0) {
  return new Paragraph({
    spacing: { after },
    children: [],
  });
}

function addressParas(lines: string[], indentLeft = 0, after = 40) {
  return lines.map((line) => {
    const isHarare = line.trim().toUpperCase() === "HARARE";
    return para(line, {
      bold: isHarare,
      underline: isHarare,
      after,
      indentLeft,
    });
  });
}

function textCell(children: Paragraph[], width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: NO_BORDER,
    verticalAlign: "top",
    children: children.length > 0 ? children : [emptyPara()],
  });
}

function plainCell(
  text: string,
  width: number,
  opts?: {
    bold?: boolean;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    after?: number;
    indentLeft?: number;
  },
) {
  return textCell(
    [
      new Paragraph({
        alignment: opts?.align,
        spacing: { after: opts?.after ?? 40, line: 276 },
        indent: opts?.indentLeft ? { left: opts.indentLeft } : undefined,
        children: [run(text, { bold: opts?.bold, size: opts?.size })],
      }),
    ],
    width,
  );
}

function buildChildren(model: InvoiceLetterheadModel): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [];

  // PDF proportions (of content width).
  const leftCol = Math.round(CONTENT_W * 0.55);
  const rightCol = CONTENT_W - leftCol;
  const bill1 = Math.round(CONTENT_W * 0.42);
  const bill2 = Math.round(CONTENT_W * 0.26);
  const bill3 = CONTENT_W - bill1 - bill2;
  const clientIndent = 240; // ~12pt, matches PDF col1+12

  const dateW = Math.round((72 / 499.28) * CONTENT_W);
  const amtW = Math.round((90 / 499.28) * CONTENT_W);
  const descW = CONTENT_W - dateW - amtW;

  // Firm name (left) + INVOICE (right) — same baseline as PDF.
  blocks.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [leftCol, rightCol],
      rows: [
        new TableRow({
          children: [
            plainCell(model.firmName, leftCol, { bold: true, size: FIRM, after: 80 }),
            plainCell("INVOICE", rightCol, {
              bold: true,
              size: TITLE,
              align: AlignmentType.RIGHT,
              after: 80,
            }),
          ],
        }),
      ],
    }),
  );

  // Address (left) + invoice date (right, top-aligned).
  blocks.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [leftCol, rightCol],
      rows: [
        new TableRow({
          children: [
            textCell(addressParas(model.addressLines, 0, 20), leftCol),
            textCell(
              [
                para(model.invoiceDateLabel, {
                  align: AlignmentType.RIGHT,
                  after: 20,
                }),
              ],
              rightCol,
            ),
          ],
        }),
      ],
    }),
  );

  blocks.push(emptyPara(120));

  if (model.attorneyLine) {
    blocks.push(para(model.attorneyLine, { after: 200 }));
  }

  // Bill to / Payment Terms / Total Amount
  blocks.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [bill1, bill2, bill3],
      rows: [
        new TableRow({
          children: [
            plainCell("Bill to:", bill1, { bold: true, after: 80 }),
            plainCell("Payment Terms", bill2, {
              bold: true,
              align: AlignmentType.CENTER,
              after: 80,
            }),
            plainCell("Total Amount", bill3, {
              bold: true,
              align: AlignmentType.RIGHT,
              after: 80,
            }),
          ],
        }),
        new TableRow({
          children: [
            textCell(
              [
                para(model.clientLabel, {
                  bold: true,
                  after: 20,
                  indentLeft: clientIndent,
                }),
                ...addressParas(model.clientAddressLines, clientIndent, 20),
              ],
              bill1,
            ),
            plainCell(model.paymentTerms, bill2, {
              align: AlignmentType.CENTER,
              after: 20,
            }),
            plainCell(model.totalLabel, bill3, {
              bold: true,
              align: AlignmentType.RIGHT,
              after: 20,
            }),
          ],
        }),
      ],
    }),
  );

  blocks.push(emptyPara(200));

  // Subject + full-width rule under it (PDF draws a line, not text underline).
  if (model.subjectLine) {
    blocks.push(
      para(model.subjectLine, {
        bold: true,
        after: 60,
        borderBottom: true,
      }),
    );
    blocks.push(emptyPara(120));
  }

  // Line items — borderless columns matching PDF widths.
  const lineRows: TableRow[] = [
    new TableRow({
      children: [
        plainCell("Date", dateW, { bold: true, after: 80 }),
        plainCell("Description", descW, { bold: true, after: 80 }),
        plainCell("Amount ($)", amtW, {
          bold: true,
          align: AlignmentType.RIGHT,
          after: 80,
        }),
      ],
    }),
    ...model.lines.map(
      (line) =>
        new TableRow({
          children: [
            plainCell(line.workDateLabel, dateW, { after: 80 }),
            plainCell(line.description, descW, { after: 80 }),
            plainCell(line.amountLabel, amtW, {
              align: AlignmentType.RIGHT,
              after: 80,
            }),
          ],
        }),
    ),
  ];

  if (model.discountLabel) {
    lineRows.push(
      new TableRow({
        children: [
          plainCell("", dateW, { after: 80 }),
          plainCell("Discount", descW, { after: 80 }),
          plainCell(model.discountLabel, amtW, {
            align: AlignmentType.RIGHT,
            after: 80,
          }),
        ],
      }),
    );
  }

  lineRows.push(
    new TableRow({
      children: [
        plainCell("", dateW, { after: 80 }),
        plainCell("Total", descW, { bold: true, after: 80 }),
        plainCell(model.totalLabel, amtW, {
          bold: true,
          align: AlignmentType.RIGHT,
          after: 80,
        }),
      ],
    }),
  );

  blocks.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [dateW, descW, amtW],
      rows: lineRows,
    }),
  );

  blocks.push(emptyPara(160));

  if (model.notes) {
    blocks.push(
      para(model.notes, {
        after: 160,
        size: NOTE,
        color: "333333",
      }),
    );
  }

  blocks.push(
    para(model.paymentNote, {
      italic: true,
      after: 200,
      size: FOOTER,
      align: AlignmentType.BOTH,
    }),
  );

  if (model.bankingRows.length > 0) {
    blocks.push(para("Banking Details:", { bold: true, after: 60, size: FOOTER }));
    for (const [label, value] of model.bankingRows) {
      blocks.push(para(`${label}: ${value}`, { bold: true, after: 20, size: FOOTER }));
    }
    blocks.push(emptyPara(160));
  }

  blocks.push(para(model.closingNote, { italic: true, after: 40 }));

  return blocks;
}

/** Letterhead invoice Word export aligned with the PDF layout (Trebuchet MS). */
export async function renderInvoiceLetterheadDocx(
  model: InvoiceLetterheadModel,
): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: INVOICE_FONT_FAMILY,
            size: BODY,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: {
              top: MARGIN,
              right: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
            },
          },
        },
        children: buildChildren(model),
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function exportInvoiceLetterheadDocx(
  firmId: string,
  invoiceId: string,
  branding: FirmExportBranding,
): Promise<Buffer> {
  const model = await buildInvoiceLetterheadModel(firmId, invoiceId, branding);
  return renderInvoiceLetterheadDocx(model);
}
