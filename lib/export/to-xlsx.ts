import "server-only";

import ExcelJS from "exceljs";
import type { ExportRenderOptions } from "@/lib/export/types";

/** Render a structured export document to Excel (.xlsx). */
export async function exportToXlsx(opts: ExportRenderOptions): Promise<Buffer> {
  const { branding, document } = opts;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LexZim";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(document.title.slice(0, 31) || "Report");

  let rowIdx = 1;
  sheet.getCell(rowIdx, 1).value = branding.firmName;
  sheet.getCell(rowIdx, 1).font = { bold: true, size: 14 };
  rowIdx += 1;

  for (const line of branding.addressLines) {
    sheet.getCell(rowIdx, 1).value = line;
    rowIdx += 1;
  }
  if (branding.contactEmail) {
    sheet.getCell(rowIdx, 1).value = branding.contactEmail;
    rowIdx += 1;
  }
  if (branding.contactPhone) {
    sheet.getCell(rowIdx, 1).value = branding.contactPhone;
    rowIdx += 1;
  }

  rowIdx += 1;
  sheet.getCell(rowIdx, 1).value = document.title;
  sheet.getCell(rowIdx, 1).font = { bold: true, size: 12 };
  rowIdx += 1;

  if (document.subtitle) {
    sheet.getCell(rowIdx, 1).value = document.subtitle;
    rowIdx += 1;
  }
  if (document.asOf) {
    sheet.getCell(rowIdx, 1).value = `As of ${document.asOf}`;
    rowIdx += 1;
  }
  if (document.note) {
    sheet.getCell(rowIdx, 1).value = document.note;
    rowIdx += 1;
  }

  if (document.summaryLines?.length) {
    rowIdx += 1;
    for (const line of document.summaryLines) {
      sheet.getCell(rowIdx, 1).value = line;
      rowIdx += 1;
    }
  }

  rowIdx += 1;
  const headerRow = sheet.getRow(rowIdx);
  document.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF2" },
    };
  });
  headerRow.commit();
  rowIdx += 1;

  for (const dataRow of document.rows) {
    const row = sheet.getRow(rowIdx);
    document.columns.forEach((col, i) => {
      row.getCell(i + 1).value = dataRow[col.key] ?? "";
    });
    row.commit();
    rowIdx += 1;
  }

  document.columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = Math.min(48, Math.max(12, col.header.length + 4));
  });

  sheet.getCell(rowIdx + 1, 1).value = branding.footerNote;
  sheet.getCell(rowIdx + 1, 1).font = { color: { argb: "FF777777" }, italic: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
