import "server-only";

import PDFDocument from "pdfkit";
import { and, eq } from "drizzle-orm";
import { hasAnyBanking, type InvoiceBankingDetails } from "@/lib/billing/invoice-banking";
import {
  feePaymentChannelLabel,
  isBankFeePaymentMethod,
} from "@/lib/billing/fee-payment-methods";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import { clients, feePayments, invoices, matters } from "@/lib/db/schema";
import {
  formatInvoiceDate,
  moneyUs,
} from "@/lib/export/invoice-letterhead-model";
import type { FirmExportBranding } from "@/lib/export/types";
import { sumFeePayments } from "@/lib/repos/billing";
import { getFirmProfile } from "@/lib/repos/firm-profile";

const MARGIN = 48;

/** Letterhead fee receipt PDF for bank-confirmed (and other) fee payments. */
export async function exportReceiptLetterheadPdf(
  firmId: string,
  paymentId: string,
  branding: FirmExportBranding,
): Promise<Buffer> {
  const db = getDb();
  const rows = await db
    .select({
      payment: feePayments,
      invoice: invoices,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientPhysicalAddress: clients.physicalAddress,
      clientPostalAddress: clients.postalAddress,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(feePayments)
    .innerJoin(invoices, eq(invoices.id, feePayments.invoiceId))
    .innerJoin(matters, eq(matters.id, invoices.matterId))
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(feePayments.firmId, firmId), eq(feePayments.id, paymentId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Receipt not found.");

  const profile = await getFirmProfile(firmId);
  const paidTotal = await sumFeePayments(firmId, row.invoice.id);
  const balanceCents = Math.max(0, row.invoice.totalCents - paidTotal);

  const clientLabel = row.clientType
    ? clientDisplayName({
        clientType: row.clientType,
        fullName: row.clientFullName,
        legalName: row.clientLegalName,
        tradingName: row.clientTradingName,
      })
    : "Client";

  const clientAddress =
    row.clientPhysicalAddress?.trim() ||
    row.clientPostalAddress?.trim() ||
    "";

  const attorneyLine = profile?.invoiceAttorneyLine?.trim() || "";
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

  const addressLines =
    branding.addressLines.length > 0
      ? branding.addressLines
      : [
          profile?.addressLine1,
          profile?.addressLine2,
          profile?.city,
          profile?.country,
        ].filter((l): l is string => Boolean(l?.trim()));

  const receiptNo = row.payment.receiptNumber ?? row.payment.id.slice(0, 8);
  const method = row.payment.method?.trim() || "Cash";
  const channel = feePaymentChannelLabel(method);
  const bankConfirmed = isBankFeePaymentMethod(method);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - MARGIN * 2;
    let y = MARGIN;

    doc.font("Helvetica-Bold").fontSize(18).text("RECEIPT", MARGIN, y, {
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

    doc.font("Helvetica").fontSize(10);
    for (const line of addressLines) {
      doc.text(line, MARGIN, y, { width: leftColW });
      y = doc.y;
    }

    doc.text(`Receipt Date: ${formatInvoiceDate(row.payment.paidAt)}`, rightX, addrStartY, {
      width: rightW,
      align: "right",
    });
    doc.text(`Receipt No: ${receiptNo}`, rightX, addrStartY + 14, {
      width: rightW,
      align: "right",
    });

    y = Math.max(y, addrStartY + 28) + 12;

    if (attorneyLine) {
      doc.font("Helvetica").fontSize(10).text(attorneyLine, MARGIN, y, { width: pageWidth });
      y = doc.y + 10;
    }

    doc.font("Helvetica-Bold").fontSize(10).text("Received from:", MARGIN, y);
    y = doc.y + 4;
    doc.font("Helvetica-Bold").fontSize(10).text(clientLabel.toUpperCase(), MARGIN + 12, y, {
      width: pageWidth - 12,
    });
    y = doc.y;
    if (clientAddress) {
      doc.font("Helvetica").fontSize(10).text(clientAddress, MARGIN + 12, y, {
        width: pageWidth - 12,
      });
      y = doc.y;
    }
    y += 14;

    const fields: Array<[string, string]> = [
      ["Invoice", row.invoice.invoiceNumber],
      [
        "Matter",
        [row.matterNumber, row.matterTitle].filter(Boolean).join(" · ") || "—",
      ],
      ["Amount received", moneyUs(row.payment.amountCents, row.payment.currency)],
      ["Channel", channel],
      ["Payment method", method],
      ["Invoice total", moneyUs(row.invoice.totalCents, row.invoice.currency)],
      ["Balance remaining", moneyUs(balanceCents, row.invoice.currency)],
    ];
    if (bankConfirmed) {
      fields.splice(5, 0, [
        "Bank confirmation",
        "Confirmed (funds received in firm bank account)",
      ]);
    }
    if (row.payment.reference?.trim()) {
      fields.splice(5, 0, ["Reference", row.payment.reference.trim()]);
    }

    for (const [label, value] of fields) {
      doc.font("Helvetica-Bold").fontSize(10).text(`${label}:`, MARGIN, y, {
        width: 140,
        continued: false,
        lineBreak: false,
      });
      doc.font("Helvetica").fontSize(10).text(value, MARGIN + 150, y, {
        width: pageWidth - 150,
      });
      y = Math.max(doc.y, y + 14) + 4;
    }

    y += 10;
    doc.font("Helvetica-Oblique").fontSize(9).text(
      channel === "Cash"
        ? "This receipt confirms that cash was received at the office against the invoice and is included in fee revenue."
        : channel === "Bank"
          ? "This receipt confirms that the payment above has been received into the firm bank account and is included in fee revenue."
          : "This receipt confirms that the payment above has been recorded against the invoice and is included in fee revenue.",
      MARGIN,
      y,
      { width: pageWidth, align: "justify" },
    );
    y = doc.y + 14;

    if (hasAnyBanking(banking)) {
      doc.font("Helvetica-Bold").fontSize(10).text("Banking Details:", MARGIN, y);
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
        doc.text(`${label}: ${value.toUpperCase()}`, MARGIN, y);
        y = doc.y;
      }
      y += 12;
    }

    if (row.payment.notes?.trim()) {
      doc.font("Helvetica").fontSize(9).text(row.payment.notes.trim(), MARGIN, y, {
        width: pageWidth,
      });
      y = doc.y + 10;
    }

    doc.font("Helvetica-Oblique").fontSize(10).text(closingNote, MARGIN, y, {
      width: pageWidth,
    });

    doc.end();
  });
}
