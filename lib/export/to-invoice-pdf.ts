import "server-only";

import PDFDocument from "pdfkit";
import { hasAnyBanking, type InvoiceBankingDetails } from "@/lib/billing/invoice-banking";
import { clientDisplayName } from "@/lib/clients/display";
import type { FirmExportBranding } from "@/lib/export/types";
import { getInvoice, listInvoiceLines } from "@/lib/repos/billing";
import { getFirmProfile } from "@/lib/repos/firm-profile";
import { quotationDiscountCents } from "@/lib/quotes/totals";

const MARGIN = 48;

export function formatInvoiceDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatWorkDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function moneyUs(cents: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  const prefix = code === "USD" ? "US$" : `${code} `;
  return `${prefix}${(cents / 100).toFixed(2)}`;
}

function underlineLastHarare(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
): number {
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  const harareAt = upper.lastIndexOf("HARARE");
  const underlineHarare =
    harareAt >= 0 && (upper === "HARARE" || upper.endsWith("HARARE"));

  if (underlineHarare) {
    const before = trimmed.slice(0, harareAt);
    const city = trimmed.slice(harareAt, harareAt + 6);
    doc.font("Helvetica").fontSize(10);
    const beforeW = before ? doc.widthOfString(before) : 0;
    if (before) {
      doc.text(before, x, y, { lineBreak: false });
    }
    doc.font("Helvetica-Bold").fontSize(10);
    const cityX = x + beforeW;
    doc.text(city, cityX, y, { lineBreak: false });
    const cityW = doc.widthOfString(city);
    doc
      .moveTo(cityX, y + 12)
      .lineTo(cityX + cityW, y + 12)
      .strokeColor("#000000")
      .lineWidth(0.8)
      .stroke();
    return y + 14;
  }
  doc.font("Helvetica").fontSize(10).text(text, x, y, { width });
  return doc.y;
}

function drawBankingBlock(
  doc: PDFKit.PDFDocument,
  banking: InvoiceBankingDetails,
  x: number,
  y: number,
): number {
  if (!hasAnyBanking(banking)) return y;
  doc.font("Helvetica-Bold").fontSize(10).text("Banking Details:", x, y);
  y = doc.y + 4;
  doc.font("Helvetica-Bold").fontSize(10);
  const bankLines: Array<[string, string]> = [
    ["NAME", banking.accountName],
    ["BANK", banking.bank],
    ["ACCOUNT NUMBER", banking.accountNumber],
    ["BRANCH", banking.branch],
    ["ACCOUNT TYPE", banking.accountType],
    ["SWIFT CODE", banking.swiftCode],
    ["BRANCH CODE", banking.branchCode],
  ];
  for (const [label, value] of bankLines) {
    if (!value?.trim()) continue;
    doc.text(`${label}: ${value.toUpperCase()}`, x, y);
    y = doc.y;
  }
  return y + 12;
}

/** T Pfigu-style invoice PDF (layout matches sample letterhead invoices). */
export async function exportInvoiceLetterheadPdf(
  firmId: string,
  invoiceId: string,
  branding: FirmExportBranding,
): Promise<Buffer> {
  const [full, lines, profile] = await Promise.all([
    getInvoice(firmId, invoiceId),
    listInvoiceLines(firmId, invoiceId),
    getFirmProfile(firmId),
  ]);
  if (!full) throw new Error("Invoice not found.");

  const inv = full.invoice;
  const clientLabel = full.clientType
    ? clientDisplayName({
        clientType: full.clientType,
        fullName: full.clientFullName,
        legalName: full.clientLegalName,
        tradingName: full.clientTradingName,
      })
    : "Client";

  const clientAddress =
    full.clientPhysicalAddress?.trim() ||
    full.clientPostalAddress?.trim() ||
    "";

  const discountApplied = quotationDiscountCents(
    inv.subtotalCents,
    inv.discountCents,
    inv.discountPct,
  );

  const attorneyLine = profile?.invoiceAttorneyLine?.trim() || "";
  const paymentNote =
    profile?.invoicePaymentNote?.trim() ||
    "Payment may be made in cash at the office or into the following bank account.";
  const closingNote =
    profile?.invoiceClosingNote?.trim() || "Thank you for your business!!!";
  const banking: InvoiceBankingDetails =
    profile?.invoiceBanking ?? {
      accountName: "",
      bank: "",
      accountNumber: "",
      branch: "",
      accountType: "",
      swiftCode: "",
      branchCode: "",
    };

  const paymentTerms = inv.paymentTerms?.trim() || "-";
  const subject =
    inv.subject?.trim() ||
    (full.matterTitle ? full.matterTitle.toUpperCase() : "");

  const addressLines =
    branding.addressLines.length > 0
      ? branding.addressLines
      : [
          profile?.addressLine1,
          profile?.addressLine2,
          [profile?.city, profile?.country].filter(Boolean).join(" "),
        ].filter((l): l is string => Boolean(l?.trim()));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - MARGIN * 2;
    let y = MARGIN;

    doc.font("Helvetica-Bold").fontSize(18).text("INVOICE", MARGIN, y, {
      width: pageWidth,
      align: "center",
    });
    y = doc.y + 6;

    doc.font("Helvetica-Bold").fontSize(12).text(branding.firmName.toUpperCase(), MARGIN, y, {
      width: pageWidth,
      align: "left",
    });
    y = doc.y + 8;

    const leftColW = pageWidth * 0.55;
    const rightX = MARGIN + leftColW;
    const rightW = pageWidth - leftColW;

    const addrStartY = y;
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    for (const line of addressLines) {
      y = underlineLastHarare(doc, line, MARGIN, y, leftColW);
    }

    const invoiceDateLabel = `Invoice Date: ${formatInvoiceDate(inv.issueDate) || "Draft"}`;
    doc.font("Helvetica").fontSize(10).text(invoiceDateLabel, rightX, addrStartY, {
      width: rightW,
      align: "right",
    });

    y = Math.max(y, addrStartY + 14) + 12;

    if (attorneyLine) {
      doc.font("Helvetica").fontSize(10).text(attorneyLine, MARGIN, y, { width: pageWidth });
      y = doc.y + 10;
    }

    const col1 = MARGIN;
    const col2 = MARGIN + pageWidth * 0.42;
    const col3 = MARGIN + pageWidth * 0.68;
    const headerY = y;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Bill to:", col1, headerY);
    doc.text("Payment Terms", col2, headerY, { width: pageWidth * 0.24, align: "center" });
    doc.text("Total Amount", col3, headerY, { width: pageWidth * 0.32, align: "right" });
    y = headerY + 16;

    doc.font("Helvetica").fontSize(10);
    const billStartY = y;
    doc.font("Helvetica-Bold").text(clientLabel.toUpperCase(), col1 + 12, y, {
      width: pageWidth * 0.38,
    });
    y = doc.y;
    if (clientAddress) {
      const addrParts = clientAddress.split(/\n/).map((p) => p.trim()).filter(Boolean);
      for (const part of addrParts) {
        y = underlineLastHarare(doc, part, col1 + 12, y, pageWidth * 0.38);
      }
    }

    doc.font("Helvetica").fontSize(10);
    doc.text(paymentTerms, col2, billStartY, {
      width: pageWidth * 0.24,
      align: "center",
    });
    doc.font("Helvetica-Bold").text(moneyUs(inv.totalCents, inv.currency), col3, billStartY, {
      width: pageWidth * 0.32,
      align: "right",
    });

    y = Math.max(y, billStartY + 14) + 16;

    if (subject) {
      const reLine = subject.toUpperCase().startsWith("RE")
        ? subject.toUpperCase()
        : `RE: ${subject.toUpperCase()}`;
      const reY = y;
      doc.font("Helvetica-Bold").fontSize(10).text(reLine, MARGIN, reY, { width: pageWidth });
      const reBottom = doc.y + 2;
      doc
        .moveTo(MARGIN, reBottom)
        .lineTo(MARGIN + pageWidth, reBottom)
        .strokeColor("#000000")
        .lineWidth(0.9)
        .stroke();
      y = reBottom + 12;
    }

    const dateW = 72;
    const amtW = 90;
    const descW = pageWidth - dateW - amtW;
    const dateX = MARGIN;
    const descX = MARGIN + dateW;
    const amtX = MARGIN + dateW + descW;

    const tableHeaderTop = y;
    doc
      .moveTo(MARGIN, tableHeaderTop)
      .lineTo(MARGIN + pageWidth, tableHeaderTop)
      .strokeColor("#000000")
      .lineWidth(0.9)
      .stroke();

    const tableHeaderTextY = tableHeaderTop + 6;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Date", dateX, tableHeaderTextY, { width: dateW, lineBreak: false });
    doc.text("Description", descX, tableHeaderTextY, { width: descW, lineBreak: false });
    doc.text("Amount ($)", amtX, tableHeaderTextY, { width: amtW, align: "right", lineBreak: false });

    const tableHeaderBottom = tableHeaderTextY + 14;
    doc
      .moveTo(MARGIN, tableHeaderBottom)
      .lineTo(MARGIN + pageWidth, tableHeaderBottom)
      .strokeColor("#000000")
      .lineWidth(0.9)
      .stroke();
    y = tableHeaderBottom + 10;

    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    for (const line of lines) {
      if (y > doc.page.height - MARGIN - 160) {
        doc.addPage();
        y = MARGIN;
      }
      const rowY = y;
      const workDate =
        line.workDate ??
        (line.lineType === "time" || line.lineType === "disbursement"
          ? inv.issueDate
          : null);
      doc.text(formatWorkDate(workDate), dateX, rowY, { width: dateW });
      doc.text(line.description, descX, rowY, { width: descW - 8 });
      const descBottom = doc.y;
      doc.text(moneyUs(line.amountCents, inv.currency), amtX, rowY, {
        width: amtW,
        align: "right",
      });
      y = Math.max(descBottom, rowY + 14) + 6;
    }

    y += 8;
    if (discountApplied > 0) {
      doc.font("Helvetica").fontSize(10);
      doc.text("Discount", descX, y, { width: descW - 8 });
      doc.text(`-${moneyUs(discountApplied, inv.currency)}`, amtX, y, {
        width: amtW,
        align: "right",
      });
      y += 16;
    }

    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Total", descX, y, { width: descW - 8 });
    doc.text(moneyUs(inv.totalCents, inv.currency), amtX, y, {
      width: amtW,
      align: "right",
    });
    y += 20;

    if (inv.notes?.trim()) {
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      doc.text(inv.notes.trim(), MARGIN, y, { width: pageWidth });
      y = doc.y + 10;
      doc.fillColor("#000000");
    }

    doc.font("Helvetica-Oblique").fontSize(9);
    doc.text(paymentNote, MARGIN, y, { width: pageWidth, align: "justify" });
    y = doc.y + 12;
    doc.font("Helvetica");

    y = drawBankingBlock(doc, banking, MARGIN, y);

    doc.font("Helvetica-Oblique").fontSize(10).text(closingNote, MARGIN, y, {
      width: pageWidth,
      align: "left",
    });

    doc.end();
  });
}
