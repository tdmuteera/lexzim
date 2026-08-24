import "server-only";

import path from "path";
import { hasAnyBanking, type InvoiceBankingDetails } from "@/lib/billing/invoice-banking";
import { clientDisplayName } from "@/lib/clients/display";
import type { FirmExportBranding } from "@/lib/export/types";
import { getInvoice, listInvoiceLines } from "@/lib/repos/billing";
import { getFirmProfile } from "@/lib/repos/firm-profile";
import { quotationDiscountCents } from "@/lib/quotes/totals";

/** Matches T Pfigu sample invoices (~11.5–12pt body). */
export const INVOICE_BODY_PT = 11.5;
export const INVOICE_TITLE_PT = 12;
export const INVOICE_FIRM_PT = 12;
export const INVOICE_FONT_FAMILY = "Trebuchet MS";

export const TREBUCHET_FONT_FILES = {
  regular: path.join(process.cwd(), "assets", "fonts", "trebuc.ttf"),
  bold: path.join(process.cwd(), "assets", "fonts", "trebucbd.ttf"),
  italic: path.join(process.cwd(), "assets", "fonts", "trebucit.ttf"),
  boldItalic: path.join(process.cwd(), "assets", "fonts", "trebucbi.ttf"),
} as const;

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

export type InvoiceLetterheadLine = {
  workDateLabel: string;
  description: string;
  amountLabel: string;
};

export type InvoiceLetterheadModel = {
  firmName: string;
  addressLines: string[];
  invoiceDateLabel: string;
  attorneyLine: string;
  clientLabel: string;
  clientAddressLines: string[];
  paymentTerms: string;
  totalLabel: string;
  subjectLine: string | null;
  lines: InvoiceLetterheadLine[];
  discountLabel: string | null;
  notes: string | null;
  paymentNote: string;
  banking: InvoiceBankingDetails;
  bankingRows: Array<[string, string]>;
  closingNote: string;
  currency: string;
};

function bankingRows(banking: InvoiceBankingDetails): Array<[string, string]> {
  if (!hasAnyBanking(banking)) return [];
  return (
    [
      ["NAME", banking.accountName],
      ["BANK", banking.bank],
      ["ACCOUNT NUMBER", banking.accountNumber],
      ["BRANCH", banking.branch],
      ["ACCOUNT TYPE", banking.accountType],
      ["SWIFT CODE", banking.swiftCode],
      ["BRANCH CODE", banking.branchCode],
    ] as Array<[string, string]>
  ).filter(([, value]) => Boolean(value?.trim()));
}

export async function buildInvoiceLetterheadModel(
  firmId: string,
  invoiceId: string,
  branding: FirmExportBranding,
): Promise<InvoiceLetterheadModel> {
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
  const subject = inv.subject?.trim() || (full.matterTitle ? full.matterTitle.toUpperCase() : "");
  const subjectLine = subject
    ? subject.toUpperCase().startsWith("RE")
      ? subject.toUpperCase()
      : `RE: ${subject.toUpperCase()}`
    : null;

  const rawAddress =
    branding.addressLines.length > 0
      ? branding.addressLines
      : [
          profile?.addressLine1,
          profile?.addressLine2,
          profile?.city,
          profile?.country,
        ].filter((l): l is string => Boolean(l?.trim()));

  return {
    firmName: branding.firmName.toUpperCase(),
    addressLines: expandInvoiceAddressLines(rawAddress),
    invoiceDateLabel: `Invoice Date: ${formatInvoiceDate(inv.issueDate) || "Draft"}`,
    attorneyLine,
    clientLabel: clientLabel.toUpperCase(),
    clientAddressLines: expandInvoiceAddressLines(
      clientAddress.split(/\n/).map((p) => p.trim()).filter(Boolean),
    ),
    paymentTerms,
    totalLabel: moneyUs(inv.totalCents, inv.currency),
    subjectLine,
    lines: lines.map((line) => {
      const workDate =
        line.workDate ??
        (line.lineType === "time" || line.lineType === "disbursement"
          ? inv.issueDate
          : null);
      return {
        workDateLabel: formatWorkDate(workDate),
        description: line.description,
        amountLabel: moneyUs(line.amountCents, inv.currency),
      };
    }),
    discountLabel:
      discountApplied > 0 ? `-${moneyUs(discountApplied, inv.currency)}` : null,
    notes: inv.notes?.trim() || null,
    paymentNote,
    banking,
    bankingRows: bankingRows(banking).map(([label, value]) => [
      label,
      value.toUpperCase(),
    ]),
    closingNote,
    currency: inv.currency,
  };
}
