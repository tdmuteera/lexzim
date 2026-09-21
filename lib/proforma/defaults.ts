import { dollarsToCents } from "@/lib/billing/money";
import { calculateStampDutyDollars, stampDutyBandLabel } from "@/lib/proforma/stamp-duty";
import {
  COMMERCIAL_VAT_RATE_PCT,
  DEFAULT_CONVEYANCING_RATE_PCT,
  REGISTRATION_FEE_WITHOUT_STAMP_DUTY,
  REGISTRATION_FEE_WITH_STAMP_DUTY,
  moneyClassForLineCode,
  type ConveyancingCategory,
  type ProformaLineCode,
  type ProformaMoneyClass,
} from "@/lib/proforma/types";

export type ProformaDraftLine = {
  key: string;
  lineCode: ProformaLineCode;
  description: string;
  moneyClass: ProformaMoneyClass;
  /** Optional lines start off; user clicks + to include. */
  included: boolean;
  isOptional: boolean;
  qty: number;
  unitPriceDollars: string;
  /** Conveyancing / VAT rate shown for editing. */
  ratePct: string | null;
  calcHint: string | null;
};

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function line(
  partial: Omit<ProformaDraftLine, "key" | "qty" | "moneyClass"> & {
    qty?: number;
    key?: string;
    moneyClass?: ProformaMoneyClass;
  },
): ProformaDraftLine {
  return {
    key: partial.key ?? `line-${Math.random().toString(36).slice(2, 10)}`,
    qty: 1,
    moneyClass: partial.moneyClass ?? moneyClassForLineCode(partial.lineCode),
    ...partial,
  };
}

/** Build default conveyancing lines for one category + property value. */
export function buildConveyancingLines(input: {
  category: ConveyancingCategory;
  propertyValueDollars: number;
  conveyancingRatePct?: number;
}): ProformaDraftLine[] {
  const value = Number.isFinite(input.propertyValueDollars)
    ? Math.max(0, input.propertyValueDollars)
    : 0;
  const convPct =
    input.conveyancingRatePct != null && Number.isFinite(input.conveyancingRatePct)
      ? input.conveyancingRatePct
      : DEFAULT_CONVEYANCING_RATE_PCT;
  const conveyancingAmt = (value * convPct) / 100;
  const stampDuty = calculateStampDutyDollars(value);
  const vatAmt = (value * COMMERCIAL_VAT_RATE_PCT) / 100;

  if (input.category === "registered_title") {
    return [
      line({
        lineCode: "stamp_duty",
        description: "Stamp duty",
        included: true,
        isOptional: false,
        unitPriceDollars: money(stampDuty),
        ratePct: null,
        calcHint: value > 0 ? stampDutyBandLabel(value) : "Finance Act progressive bands",
      }),
      line({
        lineCode: "registration_fee",
        description: "Registration fee",
        included: true,
        isOptional: false,
        unitPriceDollars: money(REGISTRATION_FEE_WITH_STAMP_DUTY),
        ratePct: null,
        calcHint: "Deeds fee where stamp duty is payable (editable)",
      }),
      line({
        lineCode: "conveyancing_fee",
        description: "Conveyancing fee",
        included: true,
        isOptional: false,
        unitPriceDollars: money(conveyancingAmt),
        ratePct: String(convPct),
        calcHint: `${convPct}% of property value (editable)`,
      }),
      line({
        lineCode: "admin_fee",
        description: "Administration fees",
        included: false,
        isOptional: true,
        unitPriceDollars: "",
        ratePct: null,
        calcHint: null,
      }),
      line({
        lineCode: "disbursement",
        description: "Disbursements",
        included: true,
        isOptional: true,
        unitPriceDollars: "",
        ratePct: null,
        calcHint: "Usually present; enter amount",
      }),
      line({
        lineCode: "custom",
        description: "Other fees",
        included: false,
        isOptional: true,
        unitPriceDollars: "",
        ratePct: null,
        calcHint: null,
      }),
    ];
  }

  if (input.category === "cession") {
    return [
      line({
        lineCode: "cession_fee",
        description: "Cession / developer fee",
        included: true,
        isOptional: false,
        unitPriceDollars: "",
        ratePct: null,
        calcHint: "Gazetted / district / developer amount (manual)",
      }),
      line({
        lineCode: "registration_fee",
        description: "Registration fee",
        included: true,
        isOptional: false,
        unitPriceDollars: money(REGISTRATION_FEE_WITHOUT_STAMP_DUTY),
        ratePct: null,
        calcHint: "Deeds fee where stamp duty is not payable (editable)",
      }),
      line({
        lineCode: "conveyancing_fee",
        description: "Conveyancing fee",
        included: true,
        isOptional: false,
        unitPriceDollars: money(conveyancingAmt),
        ratePct: String(convPct),
        calcHint: `${convPct}% of property value (editable)`,
      }),
      line({
        lineCode: "vat",
        description: `VAT (${COMMERCIAL_VAT_RATE_PCT}%)`,
        included: false,
        isOptional: true,
        unitPriceDollars: money(vatAmt),
        ratePct: String(COMMERCIAL_VAT_RATE_PCT),
        calcHint: "Optional; use for VAT-registered developer supplies",
      }),
      line({
        lineCode: "admin_fee",
        description: "Administration fees",
        included: false,
        isOptional: true,
        unitPriceDollars: "",
        ratePct: null,
        calcHint: null,
      }),
      line({
        lineCode: "disbursement",
        description: "Disbursements",
        included: true,
        isOptional: true,
        unitPriceDollars: "",
        ratePct: null,
        calcHint: null,
      }),
      line({
        lineCode: "custom",
        description: "Other fees",
        included: false,
        isOptional: true,
        unitPriceDollars: "",
        ratePct: null,
        calcHint: null,
      }),
    ];
  }

  // commercial
  return [
    line({
      lineCode: "stamp_duty",
      description: "Stamp duty",
      included: true,
      isOptional: false,
      unitPriceDollars: money(stampDuty),
      ratePct: null,
      calcHint: value > 0 ? stampDutyBandLabel(value) : "Finance Act progressive bands",
    }),
    line({
      lineCode: "registration_fee",
      description: "Registration fee",
      included: true,
      isOptional: false,
      unitPriceDollars: money(REGISTRATION_FEE_WITH_STAMP_DUTY),
      ratePct: null,
      calcHint: "Deeds fee where stamp duty is payable (editable)",
    }),
    line({
      lineCode: "conveyancing_fee",
      description: "Conveyancing fee",
      included: true,
      isOptional: false,
      unitPriceDollars: money(conveyancingAmt),
      ratePct: String(convPct),
      calcHint: `${convPct}% of property value (editable)`,
    }),
    line({
      lineCode: "vat",
      description: `VAT (${COMMERCIAL_VAT_RATE_PCT}%)`,
      included: false,
      isOptional: true,
      unitPriceDollars: money(vatAmt),
      ratePct: String(COMMERCIAL_VAT_RATE_PCT),
      calcHint: "Faint / optional; add if VAT applies and not already paid",
    }),
    line({
      lineCode: "admin_fee",
      description: "Administration fees",
      included: false,
      isOptional: true,
      unitPriceDollars: "",
      ratePct: null,
      calcHint: null,
    }),
    line({
      lineCode: "disbursement",
      description: "Disbursements",
      included: true,
      isOptional: true,
      unitPriceDollars: "",
      ratePct: null,
      calcHint: null,
    }),
    line({
      lineCode: "custom",
      description: "Other fees",
      included: false,
      isOptional: true,
      unitPriceDollars: "",
      ratePct: null,
      calcHint: null,
    }),
  ];
}

export function buildLegalFeesStarterLines(): ProformaDraftLine[] {
  return [
    line({
      lineCode: "fee",
      description: "",
      included: true,
      isOptional: false,
      unitPriceDollars: "",
      ratePct: null,
      calcHint: null,
    }),
  ];
}

export function draftLineTotalCents(line: ProformaDraftLine): number {
  if (!line.included) return 0;
  const qty = Number.isFinite(line.qty) ? line.qty : 0;
  const unit = dollarsToCents(line.unitPriceDollars) ?? 0;
  return Math.round(qty * unit);
}
