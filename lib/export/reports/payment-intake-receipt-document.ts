import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import {
  FEE_CATEGORY_LABELS,
  type FeeCategory,
} from "@/lib/finance/payment-intake-validation";
import type { ExportDocument } from "@/lib/export/types";
import { getPaymentIntake } from "@/lib/repos/payment-intakes";

function destinationLabel(destination: string): string {
  if (destination === "trust_bank") return "Trust bank";
  if (destination === "trust_vault") return "Trust vault";
  if (destination === "fee_bank") return "Fee bank (fees only)";
  if (destination === "fee_vault") return "Business Cash Book (cash fees on hand)";
  return destination;
}

function lineTypeLabel(lineType: string): string {
  if (lineType === "trust_hold") return "Trust hold";
  if (lineType === "disbursement_float") return "Disbursement float (still trust)";
  if (lineType === "fee_revenue") return "Fee revenue";
  return lineType;
}

/** One cash-event receipt for a Payments intake; allocation is a schedule, not a second cash number. */
export async function paymentIntakeReceiptToExportDocument(
  firmId: string,
  intakeId: string,
): Promise<ExportDocument> {
  const full = await getPaymentIntake(firmId, intakeId);
  if (!full) throw new Error("Payment intake not found.");

  const received = new Date(full.intake.receivedAt).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
  const receiptNo = full.intake.receiptNumber ?? full.intake.id.slice(0, 8);

  return {
    title: `Cash receipt ${receiptNo}`,
    subtitle: full.clientName,
    summaryLines: [
      full.clientNumber ? `Client number: ${full.clientNumber}` : "",
      full.matterNumber
        ? `Matter: ${full.matterNumber} · ${full.matterTitle ?? ""}`
        : "",
      `Received: ${centsToDisplay(full.intake.amountCents, full.intake.currency)}`,
      `Date: ${received}`,
      `Destination: ${destinationLabel(full.intake.destination)}`,
      full.intake.method ? `Method: ${full.intake.method}` : "",
      full.intake.reference ? `Reference: ${full.intake.reference}` : "",
      "Allocation below is a schedule of the same cash event (not a second receipt).",
    ].filter(Boolean),
    columns: [
      { key: "type", header: "Allocation" },
      { key: "detail", header: "Detail" },
      { key: "amount", header: "Amount" },
    ],
    rows: full.lines.map((line) => {
      const detail =
        line.lineType === "fee_revenue" && line.feeCategory
          ? FEE_CATEGORY_LABELS[line.feeCategory as FeeCategory] ?? line.feeCategory
          : line.notes ?? "";
      return {
        type: lineTypeLabel(line.lineType),
        detail: line.amountCents === 0 ? `${detail ? `${detail}. ` : ""}Not used (no entry)` : detail,
        amount: centsToDisplay(line.amountCents, full.intake.currency),
      };
    }),
    note: full.intake.notes ?? undefined,
  };
}
