import "server-only";

import PDFDocument from "pdfkit";
import { hasAnyBanking, type InvoiceBankingDetails } from "@/lib/billing/invoice-banking";
import { clientDisplayName } from "@/lib/clients/display";
import type { FirmExportBranding } from "@/lib/export/types";
import { getInvoice, listInvoiceLines } from "@/lib/repos/billing";
import { getFirmProfile } from "@/lib/repos/firm-profile";
import { quotationDiscountCents } from "@/lib/quotes/totals";

const MARGIN = 48;
/** Matches T Pfigu sample invoices (~11.5–12pt body). */
const BODY = 11.5;
const TITLE = 12;
const FIRM = 12;

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

/**
 * Paper samples use one place per line:
 * 187 Josiah Chinamano / 8 Windsor Park / Avenues / HARARE
 * Never "Avenues, HARARE" on one line.
 */
export function expandInvoiceAddressLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    for (const part of trimmed.split(/,\s*/).map((p) => p.trim()).filter(Boolean)) {
      const harareSplit = part.match(/^(.*)\s+(HARARE)$/i);
      if (harareSplit?.[1]?.trim()) {
        out.push(harareSplit[1].trim());
        out.push("HARARE");
      } else {
        out.push(part);
      }
    }
  }
  return out;
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
    doc.font("Helvetica-Bold").fontSize(fontSize).text("HARARE", x, y, {
      width,
      underline: true,
      lineBreak: false,
    });
    return y + fontSize + 4;
  }
  doc.font("Helvetica").fontSize(fontSize).text(trimmed, x, y, { width });
  return doc.y;
}

function drawBankingBlock(
  doc: PDFKit.PDFDocument,
  banking: InvoiceBankingDetails,
  x: number,
  y: number,
  fontSize: number,
): number {
  if (!hasAnyBanking(banking)) return y;
  doc.font("Helvetica-Bold").fontSize(fontSize).text("Banking Details:", x, y);
  y = doc.y + 4;
  doc.font("Helvetica-Bold").fontSize(fontSize);
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

  const rawAddress =
    branding.addressLines.length > 0
      ? branding.addressLines
      : [
          profile?.addressLine1,
          profile?.addressLine2,
          profile?.city,
          profile?.country,
        ].filter((l): l is string => Boolean(l?.trim()));
  const addressLines = expandInvoiceAddressLines(rawAddress);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - MARGIN * 2;
    let y = MARGIN;

    // Sample: INVOICE top-right, firm name left (same size band ~12pt).
    doc.font("Helvetica-Bold").fontSize(TITLE).text("INVOICE", MARGIN, y, {
      width: pageWidth,
      align: "right",
    });

    doc.font("Helvetica-Bold").fontSize(FIRM).text(branding.firmName.toUpperCase(), MARGIN, y, {
      width: pageWidth * 0.55,
      align: "left",
    });
    y = Math.max(doc.y, y + TITLE + 2) + 4;

    const leftColW = pageWidth * 0.55;
    const rightX = MARGIN + leftColW;
    const rightW = pageWidth - leftColW;

    const addrStartY = y;
    for (const line of addressLines) {
      y = drawAddressLine(doc, line, MARGIN, y, leftColW, BODY);
    }

    const invoiceDateLabel = `Invoice Date: ${formatInvoiceDate(inv.issueDate) || "Draft"}`;
    doc.font("Helvetica").fontSize(BODY).text(invoiceDateLabel, rightX, addrStartY, {
      width: rightW,
      align: "right",
    });

    y = Math.max(y, addrStartY + BODY + 2) + 12;

    if (attorneyLine) {
      doc.font("Helvetica").fontSize(BODY).text(attorneyLine, MARGIN, y, { width: pageWidth });
      y = doc.y + 10;
    }

    const col1 = MARGIN;
    const col2 = MARGIN + pageWidth * 0.42;
    const col3 = MARGIN + pageWidth * 0.68;
    const headerY = y;
    doc.font("Helvetica-Bold").fontSize(BODY);
    doc.text("Bill to:", col1, headerY);
    doc.text("Payment Terms", col2, headerY, { width: pageWidth * 0.24, align: "center" });
    doc.text("Total Amount", col3, headerY, { width: pageWidth * 0.32, align: "right" });
    y = headerY + BODY + 6;

    const billStartY = y;
    doc.font("Helvetica-Bold").fontSize(BODY).text(clientLabel.toUpperCase(), col1 + 12, y, {
      width: pageWidth * 0.38,
    });
    y = doc.y;
    if (clientAddress) {
      const addrParts = expandInvoiceAddressLines(
        clientAddress.split(/\n/).map((p) => p.trim()).filter(Boolean),
      );
      for (const part of addrParts) {
        y = drawAddressLine(doc, part, col1 + 12, y, pageWidth * 0.38, BODY);
      }
    }

    doc.font("Helvetica").fontSize(BODY);
    doc.text(paymentTerms, col2, billStartY, {
      width: pageWidth * 0.24,
      align: "center",
    });
    doc.font("Helvetica-Bold").text(moneyUs(inv.totalCents, inv.currency), col3, billStartY, {
      width: pageWidth * 0.32,
      align: "right",
    });

    y = Math.max(y, billStartY + BODY + 2) + 16;

    if (subject) {
      const reLine = subject.toUpperCase().startsWith("RE")
        ? subject.toUpperCase()
        : `RE: ${subject.toUpperCase()}`;
      doc.font("Helvetica-Bold").fontSize(BODY).text(reLine, MARGIN, y, { width: pageWidth });
      // One full-width rule only (paper sample: under RE, tops the items block).
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

    doc.font("Helvetica-Bold").fontSize(BODY);
    doc.text("Date", dateX, y, { width: dateW, lineBreak: false });
    doc.text("Description", descX, y, { width: descW, lineBreak: false });
    doc.text("Amount ($)", amtX, y, {
      width: amtW,
      align: "right",
      lineBreak: false,
    });
    y += BODY + 6;

    doc.font("Helvetica").fontSize(BODY).fillColor("#000000");
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
      y = Math.max(descBottom, rowY + BODY + 2) + 6;
    }

    y += 8;
    if (discountApplied > 0) {
      doc.font("Helvetica").fontSize(BODY);
      doc.text("Discount", descX, y, { width: descW - 8 });
      doc.text(`-${moneyUs(discountApplied, inv.currency)}`, amtX, y, {
        width: amtW,
        align: "right",
      });
      y += BODY + 6;
    }

    doc.font("Helvetica-Bold").fontSize(BODY);
    doc.text("Total", descX, y, { width: descW - 8 });
    doc.text(moneyUs(inv.totalCents, inv.currency), amtX, y, {
      width: amtW,
      align: "right",
    });
    y += BODY + 10;

    if (inv.notes?.trim()) {
      doc.font("Helvetica").fontSize(BODY - 1).fillColor("#333333");
      doc.text(inv.notes.trim(), MARGIN, y, { width: pageWidth });
      y = doc.y + 10;
      doc.fillColor("#000000");
    }

    doc.font("Helvetica-Oblique").fontSize(BODY - 1);
    doc.text(paymentNote, MARGIN, y, { width: pageWidth, align: "justify" });
    y = doc.y + 12;
    doc.font("Helvetica");

    y = drawBankingBlock(doc, banking, MARGIN, y, BODY);

    doc.font("Helvetica-Oblique").fontSize(BODY).text(closingNote, MARGIN, y, {
      width: pageWidth,
      align: "left",
    });

    doc.end();
  });
}
