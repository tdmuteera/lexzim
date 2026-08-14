import "server-only";

import {
  AR_AGING_BUCKETS,
  type ArAgingBucket,
} from "@/lib/billing/aging";
import { AuthError } from "@/lib/auth/types";
import { getFirmExportBranding } from "@/lib/export/branding";
import { chartOfAccountsToExportDocument } from "@/lib/export/reports/gl-coa-document";
import { balanceSheetToExportDocument } from "@/lib/export/reports/gl-balance-sheet-document";
import { profitAndLossToExportDocument } from "@/lib/export/reports/gl-pl-document";
import { trialBalanceToExportDocument } from "@/lib/export/reports/gl-trial-balance-document";
import { quotationToExportDocument } from "@/lib/export/reports/quotation-document";
import { invoiceToExportDocument } from "@/lib/export/reports/invoice-document";
import { receiptToExportDocument } from "@/lib/export/reports/receipt-document";
import { debtorsToExportDocument } from "@/lib/export/reports/debtors-document";
import { trustStatementToExportDocument } from "@/lib/export/reports/trust-statement-document";
import { pettyCashSummaryToExportDocument } from "@/lib/export/reports/petty-cash-document";
import { creditorAgeingToExportDocument } from "@/lib/export/reports/creditor-ageing-document";
import { birthdayListToExportDocument } from "@/lib/export/reports/birthday-list-document";
import {
  lawyerPerformanceExportDocument,
  lawyerPerformanceToCsv,
} from "@/lib/export/reports/lawyer-performance-document";
import {
  practiceReportFiltersFromParams,
  practiceReportToCsv,
  practiceReportToExportDocument,
} from "@/lib/export/reports/practice-report-document";
import {
  monthlyFinanceExportDocument,
  monthlyFinanceToCsv,
  weeklyFinanceExportDocument,
  weeklyFinanceToCsv,
} from "@/lib/export/reports/finance-pack-document";
import { exportToDocx } from "@/lib/export/to-docx";
import { exportToPdf } from "@/lib/export/to-pdf";
import { exportToXlsx } from "@/lib/export/to-xlsx";
import type { ExportDocument, ExportFormat } from "@/lib/export/types";
import { buildBalanceSheet, buildProfitAndLoss, buildTrialBalance } from "@/lib/gl/statements";
import { debtorsToCsv, listDebtors, type DebtorsFilters } from "@/lib/repos/debtors";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { buildLawyerPerformance, defaultLawyerPerformanceRange } from "@/lib/repos/lawyer-performance";
import {
  canViewAllLawyerPerformance,
  canViewAllMatters,
  hasPermission,
} from "@/lib/rbac/guards";
import type { AuthSessionUser } from "@/lib/auth/types";

export type ExportKind =
  | "debtors"
  | "gl_coa"
  | "gl_trial_balance"
  | "gl_profit_and_loss"
  | "gl_balance_sheet"
  | "quotation"
  | "invoice"
  | "receipt"
  | "trust_statement"
  | "petty_cash_summary"
  | "creditor_ageing"
  | "birthday_list"
  | "lawyer_performance"
  | "practice_report"
  | "finance_weekly"
  | "finance_monthly";

export const EXPORT_KINDS: ExportKind[] = [
  "debtors",
  "gl_coa",
  "gl_trial_balance",
  "gl_profit_and_loss",
  "gl_balance_sheet",
  "quotation",
  "invoice",
  "receipt",
  "trust_statement",
  "petty_cash_summary",
  "creditor_ageing",
  "birthday_list",
  "lawyer_performance",
  "practice_report",
  "finance_weekly",
  "finance_monthly",
];

export type ExportContext = {
  firmId: string;
  session: AuthSessionUser;
  searchParams: URLSearchParams;
};

export type ExportKindDefinition = {
  permission: string;
  auditAction: string;
  filenameBase: string;
  buildDocument: (ctx: ExportContext) => Promise<ExportDocument>;
  buildCsv?: (ctx: ExportContext) => Promise<string>;
};

function parseDate(value: string | null, label?: string): Date {
  if (!value) {
    if (label) throw new AuthError("validation", `${label} is required.`);
    return new Date();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `Invalid date: ${value}`);
  }
  return d;
}

function lawyerPerformanceInputFromCtx(ctx: ExportContext) {
  const defaults = defaultLawyerPerformanceRange();
  const fromRaw = ctx.searchParams.get("from");
  const toRaw = ctx.searchParams.get("to");
  const viewAll = canViewAllLawyerPerformance(ctx.session);
  return {
    firmId: ctx.firmId,
    from: fromRaw ? parseDate(fromRaw, "from") : defaults.from,
    to: toRaw ? parseDate(toRaw, "to") : defaults.to,
    currency: ctx.session.firm.defaultCurrency || "USD",
    viewAll,
    lawyerId: ctx.session.id,
    includeGlCheck: viewAll && hasPermission(ctx.session, "finance.gl.view"),
  };
}

function parseBucket(value: string | null): ArAgingBucket | undefined {
  if (!value) return undefined;
  if ((AR_AGING_BUCKETS as readonly string[]).includes(value)) {
    return value as ArAgingBucket;
  }
  throw new AuthError("validation", `Invalid bucket. Use: ${AR_AGING_BUCKETS.join(", ")}`);
}

function parseOptionalDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `Invalid date: ${value}`);
  }
  return d;
}

function debtorsFiltersFromParams(params: URLSearchParams): DebtorsFilters {
  return {
    matterId: params.get("matterId")?.trim() || undefined,
    clientId: params.get("clientId")?.trim() || undefined,
    bucket: parseBucket(params.get("bucket")),
    from: parseOptionalDate(params.get("from")),
    to: parseOptionalDate(params.get("to")),
  };
}

function currencyFromSession(session: AuthSessionUser) {
  return session.firm.defaultCurrency || "USD";
}

async function loadDebtorsReport(ctx: ExportContext) {
  const viewAll = canViewAllMatters(ctx.session);
  const filters = debtorsFiltersFromParams(ctx.searchParams);
  if (filters.matterId) {
    await assertInvoiceMatterAccess(ctx.session, ctx.firmId, filters.matterId);
  }
  return listDebtors(ctx.firmId, {
    userId: ctx.session.id,
    viewAll,
    filters,
  });
}

export const EXPORT_REGISTRY: Record<ExportKind, ExportKindDefinition> = {
  debtors: {
    permission: "billing.view",
    auditAction: "export.debtors",
    filenameBase: "lexzim-debtors",
    buildDocument: async (ctx) => {
      const report = await loadDebtorsReport(ctx);
      return debtorsToExportDocument(report);
    },
    buildCsv: async (ctx) => {
      const report = await loadDebtorsReport(ctx);
      return debtorsToCsv(report);
    },
  },
  gl_coa: {
    permission: "finance.gl.view",
    auditAction: "export.gl_coa",
    filenameBase: "lexzim-chart-of-accounts",
    buildDocument: async (ctx) => chartOfAccountsToExportDocument(ctx.firmId),
  },
  gl_trial_balance: {
    permission: "finance.gl.view",
    auditAction: "export.gl_trial_balance",
    filenameBase: "lexzim-trial-balance",
    buildDocument: async (ctx) => {
      const asOf = parseDate(ctx.searchParams.get("asOf"));
      const report = await buildTrialBalance(ctx.firmId, asOf, currencyFromSession(ctx.session));
      return trialBalanceToExportDocument(report);
    },
  },
  gl_profit_and_loss: {
    permission: "finance.gl.view",
    auditAction: "export.gl_profit_and_loss",
    filenameBase: "lexzim-profit-and-loss",
    buildDocument: async (ctx) => {
      const from = parseDate(ctx.searchParams.get("from"), "from");
      const to = parseDate(ctx.searchParams.get("to"), "to");
      const report = await buildProfitAndLoss(
        ctx.firmId,
        from,
        to,
        currencyFromSession(ctx.session),
      );
      return profitAndLossToExportDocument(report);
    },
  },
  gl_balance_sheet: {
    permission: "finance.gl.view",
    auditAction: "export.gl_balance_sheet",
    filenameBase: "lexzim-balance-sheet",
    buildDocument: async (ctx) => {
      const asOf = parseDate(ctx.searchParams.get("asOf"));
      const report = await buildBalanceSheet(
        ctx.firmId,
        asOf,
        currencyFromSession(ctx.session),
      );
      return balanceSheetToExportDocument(report);
    },
  },
  quotation: {
    permission: "billing.view",
    auditAction: "export.quotation",
    filenameBase: "lexzim-quotation",
    buildDocument: async (ctx) => {
      const id = ctx.searchParams.get("id")?.trim();
      if (!id) throw new AuthError("validation", "Quotation id is required.");
      return quotationToExportDocument(ctx.firmId, id);
    },
  },
  invoice: {
    permission: "billing.view",
    auditAction: "export.invoice",
    filenameBase: "lexzim-invoice",
    buildDocument: async (ctx) => {
      const id = ctx.searchParams.get("id")?.trim();
      if (!id) throw new AuthError("validation", "Invoice id is required.");
      return invoiceToExportDocument(ctx.firmId, id);
    },
  },
  receipt: {
    permission: "billing.view",
    auditAction: "export.receipt",
    filenameBase: "lexzim-receipt",
    buildDocument: async (ctx) => {
      const id = ctx.searchParams.get("id")?.trim();
      if (!id) throw new AuthError("validation", "Payment id is required.");
      return receiptToExportDocument(ctx.firmId, id);
    },
  },
  trust_statement: {
    permission: "trust.view",
    auditAction: "export.trust_statement",
    filenameBase: "lexzim-trust-statement",
    buildDocument: async (ctx) => {
      const clientId = ctx.searchParams.get("clientId")?.trim();
      if (!clientId) throw new AuthError("validation", "clientId is required.");
      return trustStatementToExportDocument(ctx.firmId, clientId);
    },
  },
  petty_cash_summary: {
    permission: "finance.view",
    auditAction: "export.petty_cash_summary",
    filenameBase: "lexzim-petty-cash",
    buildDocument: async (ctx) => pettyCashSummaryToExportDocument(ctx.firmId),
  },
  creditor_ageing: {
    permission: "finance.view",
    auditAction: "export.creditor_ageing",
    filenameBase: "lexzim-creditor-ageing",
    buildDocument: async (ctx) => creditorAgeingToExportDocument(ctx.firmId),
  },
  birthday_list: {
    permission: "crm.view",
    auditAction: "export.birthday_list",
    filenameBase: "lexzim-birthday-list",
    buildDocument: async (ctx) => {
      const monthRaw = ctx.searchParams.get("month");
      const month = monthRaw ? Number(monthRaw) : new Date().getMonth() + 1;
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new AuthError("validation", "month must be 1 to 12.");
      }
      const responsibleLawyerId =
        ctx.searchParams.get("responsibleLawyerId")?.trim() || undefined;
      return birthdayListToExportDocument(ctx.firmId, month, { responsibleLawyerId });
    },
  },
  lawyer_performance: {
    permission: "reports.view",
    auditAction: "export.lawyer_performance",
    filenameBase: "lexzim-lawyer-performance",
    buildDocument: async (ctx) => {
      const input = lawyerPerformanceInputFromCtx(ctx);
      return lawyerPerformanceExportDocument(input);
    },
    buildCsv: async (ctx) => {
      const report = await buildLawyerPerformance(lawyerPerformanceInputFromCtx(ctx));
      return lawyerPerformanceToCsv(report);
    },
  },
  practice_report: {
    permission: "reports.view",
    auditAction: "export.practice_report",
    filenameBase: "lexzim-report",
    buildDocument: async (ctx) => {
      const { type, filters } = practiceReportFiltersFromParams(ctx.searchParams);
      return practiceReportToExportDocument(ctx.firmId, type, filters);
    },
    buildCsv: async (ctx) => {
      const { type, filters } = practiceReportFiltersFromParams(ctx.searchParams);
      return practiceReportToCsv(ctx.firmId, type, filters);
    },
  },
  finance_weekly: {
    permission: "finance.view",
    auditAction: "export.finance_weekly",
    filenameBase: "lexzim-finance-weekly",
    buildDocument: async (ctx) => {
      const asOfRaw = ctx.searchParams.get("asOf");
      return weeklyFinanceExportDocument({
        firmId: ctx.firmId,
        userId: ctx.session.id,
        viewAll: canViewAllMatters(ctx.session),
        asOf: asOfRaw ? parseDate(asOfRaw) : undefined,
        defaultCurrency: currencyFromSession(ctx.session),
      });
    },
    buildCsv: async (ctx) => {
      const asOfRaw = ctx.searchParams.get("asOf");
      return weeklyFinanceToCsv({
        firmId: ctx.firmId,
        userId: ctx.session.id,
        viewAll: canViewAllMatters(ctx.session),
        asOf: asOfRaw ? parseDate(asOfRaw) : undefined,
        defaultCurrency: currencyFromSession(ctx.session),
      });
    },
  },
  finance_monthly: {
    permission: "finance.view",
    auditAction: "export.finance_monthly",
    filenameBase: "lexzim-finance-monthly",
    buildDocument: async (ctx) => {
      const year = Number(ctx.searchParams.get("year"));
      const month = Number(ctx.searchParams.get("month"));
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new AuthError("validation", "year must be a valid year (2000-2100).");
      }
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new AuthError("validation", "month must be between 1 and 12.");
      }
      return monthlyFinanceExportDocument({
        firmId: ctx.firmId,
        year,
        month,
        defaultCurrency: currencyFromSession(ctx.session),
      });
    },
    buildCsv: async (ctx) => {
      const year = Number(ctx.searchParams.get("year"));
      const month = Number(ctx.searchParams.get("month"));
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new AuthError("validation", "year must be a valid year (2000-2100).");
      }
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new AuthError("validation", "month must be between 1 and 12.");
      }
      return monthlyFinanceToCsv({
        firmId: ctx.firmId,
        year,
        month,
        defaultCurrency: currencyFromSession(ctx.session),
      });
    },
  },
};

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

export async function renderExport(
  kind: ExportKind,
  format: ExportFormat,
  ctx: ExportContext,
): Promise<{ bytes: Buffer; filenameBase: string }> {
  const def = EXPORT_REGISTRY[kind];
  const branding = await getFirmExportBranding(ctx.firmId);

  const typeSlug = ctx.searchParams.get("type")?.replace(/[^a-z0-9_-]/gi, "") ?? "";
  const filenameBase =
    kind === "practice_report" && typeSlug
      ? `lexzim-${typeSlug}`
      : def.filenameBase;

  if (format === "csv") {
    if (!def.buildCsv) throw new AuthError("validation", "CSV not supported for this export.");
    const csv = await def.buildCsv(ctx);
    return { bytes: Buffer.from(csv, "utf8"), filenameBase };
  }

  const document = await def.buildDocument(ctx);
  const opts = { branding, document };

  if (format === "pdf") {
    return { bytes: await exportToPdf(opts), filenameBase };
  }
  if (format === "docx") {
    return { bytes: await exportToDocx(opts), filenameBase };
  }
  return { bytes: await exportToXlsx(opts), filenameBase };
}
