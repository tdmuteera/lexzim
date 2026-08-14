/** GL account classification bands (Phase 7). */
export type GlAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "direct_cost"
  | "expense";

export type GlNormalBalance = "debit" | "credit";

export type GlSourceType =
  | "manual"
  | "invoice"
  | "payment"
  | "trust"
  | "expense"
  | "quote"
  | "opening";

export type CoaSeedRow = {
  code: string;
  name: string;
  type: GlAccountType;
  parentCode?: string;
  isSystem?: boolean;
  isGroup?: boolean;
  normalBalance: GlNormalBalance;
  description?: string;
};

export type ManualJournalLineInput = {
  accountId: string;
  debitCents: number;
  creditCents: number;
  matterId?: string | null;
  clientId?: string | null;
  currency?: string;
  lineMemo?: string | null;
};

export type ManualJournalInput = {
  entryDate: Date;
  reference?: string | null;
  memo?: string | null;
  lines: ManualJournalLineInput[];
};

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: GlAccountType;
  debitCents: number;
  creditCents: number;
};

export type TrialBalanceReport = {
  title: string;
  asOf: string;
  currency: string;
  rows: TrialBalanceRow[];
  totalDebitCents: number;
  totalCreditCents: number;
};

export type ProfitAndLossSection = {
  label: string;
  rows: { code: string; name: string; amountCents: number }[];
  subtotalCents: number;
};

export type ProfitAndLossReport = {
  title: string;
  from: string;
  to: string;
  currency: string;
  revenue: ProfitAndLossSection;
  directCosts: ProfitAndLossSection;
  grossProfitCents: number;
  operatingExpenses: ProfitAndLossSection;
  netProfitCents: number;
};

export type BalanceSheetSection = {
  label: string;
  rows: { code: string; name: string; balanceCents: number }[];
  subtotalCents: number;
};

export type BalanceSheetReport = {
  title: string;
  asOf: string;
  currency: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  currentYearEarningsCents: number;
  totalLiabilitiesAndEquityCents: number;
};
