import "server-only";

import ExcelJS from "exceljs";
import type { FirmExportBranding } from "@/lib/export/types";
import {
  INVOICE_BODY_PT,
  INVOICE_FIRM_PT,
  INVOICE_FONT_FAMILY,
  INVOICE_FOOTER_PT,
  INVOICE_TITLE_PT,
  buildInvoiceLetterheadModel,
} from "@/lib/export/invoice-letterhead-model";

const FONT = INVOICE_FONT_FAMILY;

function applyFont(
  cell: ExcelJS.Cell,
  opts?: { bold?: boolean; italic?: boolean; size?: number; underline?: boolean },
) {
  cell.font = {
    name: FONT,
    bold: opts?.bold,
    italic: opts?.italic,
    size: opts?.size ?? INVOICE_BODY_PT,
    underline: opts?.underline ? true : undefined,
  };
}

/** Letterhead invoice Excel export aligned with the PDF layout (Trebuchet MS). */
export async function exportInvoiceLetterheadXlsx(
  firmId: string,
  invoiceId: string,
  branding: FirmExportBranding,
): Promise<Buffer> {
  const model = await buildInvoiceLetterheadModel(firmId, invoiceId, branding);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LexZim";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Invoice");
  sheet.columns = [
    { width: 14 },
    { width: 48 },
    { width: 16 },
    { width: 16 },
  ];

  let r = 1;
  const firmCell = sheet.getCell(r, 1);
  firmCell.value = model.firmName;
  applyFont(firmCell, { bold: true, size: INVOICE_FIRM_PT });
  const titleCell = sheet.getCell(r, 4);
  titleCell.value = "INVOICE";
  titleCell.alignment = { horizontal: "right" };
  applyFont(titleCell, { bold: true, size: INVOICE_TITLE_PT });
  r += 1;

  const addrStart = r;
  for (const line of model.addressLines) {
    const cell = sheet.getCell(r, 1);
    cell.value = line;
    const isHarare = line.trim().toUpperCase() === "HARARE";
    applyFont(cell, { bold: isHarare, underline: isHarare, size: INVOICE_BODY_PT });
    r += 1;
  }
  const dateCell = sheet.getCell(addrStart, 4);
  dateCell.value = model.invoiceDateLabel;
  dateCell.alignment = { horizontal: "right" };
  applyFont(dateCell, { size: INVOICE_BODY_PT });
  r += 1;

  if (model.attorneyLine) {
    const cell = sheet.getCell(r, 1);
    cell.value = model.attorneyLine;
    applyFont(cell, { size: INVOICE_BODY_PT });
    r += 2;
  } else {
    r += 1;
  }

  const headers = [
    [1, "Bill to:"],
    [2, "Payment Terms"],
    [4, "Total Amount"],
  ] as const;
  for (const [col, label] of headers) {
    const cell = sheet.getCell(r, col);
    cell.value = label;
    applyFont(cell, { bold: true, size: INVOICE_BODY_PT });
    if (col === 2) cell.alignment = { horizontal: "center" };
    if (col === 4) cell.alignment = { horizontal: "right" };
  }
  r += 1;

  const billStart = r;
  const clientCell = sheet.getCell(r, 1);
  clientCell.value = model.clientLabel;
  applyFont(clientCell, { bold: true, size: INVOICE_BODY_PT });
  const termsCell = sheet.getCell(r, 2);
  termsCell.value = model.paymentTerms;
  termsCell.alignment = { horizontal: "center" };
  applyFont(termsCell, { size: INVOICE_BODY_PT });
  const totalTop = sheet.getCell(r, 4);
  totalTop.value = model.totalLabel;
  totalTop.alignment = { horizontal: "right" };
  applyFont(totalTop, { bold: true, size: INVOICE_BODY_PT });
  r += 1;

  for (const line of model.clientAddressLines) {
    const cell = sheet.getCell(r, 1);
    cell.value = line;
    const isHarare = line.trim().toUpperCase() === "HARARE";
    applyFont(cell, { bold: isHarare, underline: isHarare, size: INVOICE_BODY_PT });
    r += 1;
  }
  if (model.clientAddressLines.length === 0) r = Math.max(r, billStart + 1);
  r += 1;

  if (model.subjectLine) {
    const cell = sheet.getCell(r, 1);
    cell.value = model.subjectLine;
    applyFont(cell, { bold: true, size: INVOICE_BODY_PT });
    sheet.mergeCells(r, 1, r, 4);
    // Full-width rule under RE (matches PDF line, not text underline).
    for (let c = 1; c <= 4; c += 1) {
      sheet.getCell(r, c).border = {
        bottom: { style: "thin", color: { argb: "FF000000" } },
      };
    }
    r += 2;
  }

  for (const [col, label] of [
    [1, "Date"],
    [2, "Description"],
    [4, "Amount ($)"],
  ] as const) {
    const cell = sheet.getCell(r, col);
    cell.value = label;
    applyFont(cell, { bold: true, size: INVOICE_BODY_PT });
    if (col === 4) cell.alignment = { horizontal: "right" };
  }
  r += 1;

  for (const line of model.lines) {
    const d = sheet.getCell(r, 1);
    d.value = line.workDateLabel;
    applyFont(d, { size: INVOICE_BODY_PT });
    const desc = sheet.getCell(r, 2);
    desc.value = line.description;
    applyFont(desc, { size: INVOICE_BODY_PT });
    const amt = sheet.getCell(r, 4);
    amt.value = line.amountLabel;
    amt.alignment = { horizontal: "right" };
    applyFont(amt, { size: INVOICE_BODY_PT });
    r += 1;
  }

  if (model.discountLabel) {
    const desc = sheet.getCell(r, 2);
    desc.value = "Discount";
    applyFont(desc, { size: INVOICE_BODY_PT });
    const amt = sheet.getCell(r, 4);
    amt.value = model.discountLabel;
    amt.alignment = { horizontal: "right" };
    applyFont(amt, { size: INVOICE_BODY_PT });
    r += 1;
  }

  r += 1;
  const totalLabel = sheet.getCell(r, 2);
  totalLabel.value = "Total";
  applyFont(totalLabel, { bold: true, size: INVOICE_BODY_PT });
  const totalAmt = sheet.getCell(r, 4);
  totalAmt.value = model.totalLabel;
  totalAmt.alignment = { horizontal: "right" };
  applyFont(totalAmt, { bold: true, size: INVOICE_BODY_PT });
  r += 2;

  if (model.notes) {
    const cell = sheet.getCell(r, 1);
    cell.value = model.notes;
    applyFont(cell, { size: INVOICE_BODY_PT - 1 });
    sheet.mergeCells(r, 1, r, 4);
    r += 2;
  }

  const note = sheet.getCell(r, 1);
  note.value = model.paymentNote;
  applyFont(note, { italic: true, size: INVOICE_FOOTER_PT });
  sheet.mergeCells(r, 1, r, 4);
  r += 2;

  if (model.bankingRows.length > 0) {
    const head = sheet.getCell(r, 1);
    head.value = "Banking Details:";
    applyFont(head, { bold: true, size: INVOICE_FOOTER_PT });
    r += 1;
    for (const [label, value] of model.bankingRows) {
      const cell = sheet.getCell(r, 1);
      cell.value = `${label}: ${value}`;
      applyFont(cell, { bold: true, size: INVOICE_FOOTER_PT });
      r += 1;
    }
    r += 1;
  }

  const closing = sheet.getCell(r, 1);
  closing.value = model.closingNote;
  applyFont(closing, { italic: true, size: INVOICE_BODY_PT });

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
