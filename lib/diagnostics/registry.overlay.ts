/**
 * Hand overlay for the generated module registry (P8-07).
 * Prefixes are matched longest-first. No workflow steps here (P8-08).
 */

export type DiagnosticModuleCode =
  | "auth"
  | "clients"
  | "matters"
  | "documents"
  | "calendar"
  | "crm"
  | "finance.invoicing"
  | "finance.debtors"
  | "finance.trust"
  | "finance.recon"
  | "finance.expenses"
  | "finance.gl"
  | "finance.reports"
  | "hr"
  | "reports"
  | "exports"
  | "email"
  | "ai"
  | "dashboard"
  | "platform"
  | "db";

export type DiagnosticSeverity =
  | "user_blocker"
  | "finance_blocker"
  | "trust_blocker"
  | "degraded"
  | "cosmetic";

export type DiagnosticOwner = "product" | "finance" | "platform";

export type ModuleOverlay = {
  severity: DiagnosticSeverity;
  owner: DiagnosticOwner;
  recoveryHint: string;
  tables?: string[];
};

/** Longest prefix wins. Page paths and /api paths. */
export const ROUTE_MODULE_PREFIXES: Array<{ prefix: string; module: DiagnosticModuleCode }> = [
  { prefix: "/api/finance/gl", module: "finance.gl" },
  { prefix: "/api/finance/debtors", module: "finance.debtors" },
  { prefix: "/api/finance/reconciliations", module: "finance.recon" },
  { prefix: "/api/finance/reports", module: "finance.reports" },
  { prefix: "/api/finance/kpis", module: "finance.reports" },
  { prefix: "/api/finance/expenses", module: "finance.expenses" },
  { prefix: "/api/finance/cashbook", module: "finance.expenses" },
  { prefix: "/api/finance/petty-cash", module: "finance.expenses" },
  { prefix: "/api/finance/creditors", module: "finance.expenses" },
  { prefix: "/api/finance/period-locks", module: "finance.reports" },
  { prefix: "/api/finance/quotations", module: "finance.invoicing" },
  { prefix: "/api/finance/services", module: "finance.invoicing" },
  { prefix: "/api/invoices", module: "finance.invoicing" },
  { prefix: "/api/trust", module: "finance.trust" },
  { prefix: "/api/export", module: "exports" },
  { prefix: "/api/email", module: "email" },
  { prefix: "/api/settings/email", module: "email" },
  { prefix: "/api/auth", module: "auth" },
  { prefix: "/api/security", module: "auth" },
  { prefix: "/api/staff", module: "auth" },
  { prefix: "/api/clients", module: "clients" },
  { prefix: "/api/matters", module: "matters" },
  { prefix: "/api/documents", module: "documents" },
  { prefix: "/api/templates", module: "documents" },
  { prefix: "/api/calendar", module: "calendar" },
  { prefix: "/api/reminders", module: "calendar" },
  { prefix: "/api/deadlines", module: "calendar" },
  { prefix: "/api/deadline-templates", module: "calendar" },
  { prefix: "/api/crm", module: "crm" },
  { prefix: "/api/hr", module: "hr" },
  { prefix: "/api/reports", module: "reports" },
  { prefix: "/api/ai", module: "ai" },
  { prefix: "/api/dashboard", module: "dashboard" },
  { prefix: "/api/health", module: "db" },
  { prefix: "/api/db-status", module: "db" },
  { prefix: "/api/ops", module: "platform" },
  { prefix: "/api/platform", module: "platform" },
  { prefix: "/api/licence", module: "platform" },
  { prefix: "/api/portal", module: "platform" },
  { prefix: "/api/diagnostics", module: "platform" },
  { prefix: "/api/about", module: "platform" },
  { prefix: "/api/audit", module: "platform" },
  { prefix: "/api/firm", module: "platform" },
  { prefix: "/api/notifications", module: "platform" },
  { prefix: "/api/onboarding", module: "platform" },
  { prefix: "/api/search", module: "platform" },
  { prefix: "/api/parties", module: "clients" },
  { prefix: "/api/procedures", module: "matters" },
  { prefix: "/api/disbursements", module: "matters" },
  { prefix: "/api/time-entries", module: "matters" },
  { prefix: "/finance/invoicing", module: "finance.invoicing" },
  { prefix: "/finance/debtors", module: "finance.debtors" },
  { prefix: "/finance/trust", module: "finance.trust" },
  { prefix: "/finance/reconciliations", module: "finance.recon" },
  { prefix: "/finance/expenses", module: "finance.expenses" },
  { prefix: "/finance/accounting", module: "finance.gl" },
  { prefix: "/finance/reports", module: "finance.reports" },
  { prefix: "/finance/quotations", module: "finance.invoicing" },
  { prefix: "/finance/petty-cash", module: "finance.expenses" },
  { prefix: "/finance/creditors", module: "finance.expenses" },
  { prefix: "/clients", module: "clients" },
  { prefix: "/matters", module: "matters" },
  { prefix: "/documents", module: "documents" },
  { prefix: "/calendar", module: "calendar" },
  { prefix: "/reminders", module: "calendar" },
  { prefix: "/crm", module: "crm" },
  { prefix: "/hr", module: "hr" },
  { prefix: "/reports", module: "reports" },
  { prefix: "/ai", module: "ai" },
  { prefix: "/dashboard", module: "dashboard" },
  { prefix: "/staff", module: "auth" },
  { prefix: "/audit", module: "platform" },
  { prefix: "/settings", module: "platform" },
  { prefix: "/ops", module: "platform" },
  { prefix: "/help", module: "platform" },
  { prefix: "/login", module: "auth" },
  { prefix: "/billing", module: "finance.invoicing" },
  { prefix: "/trust", module: "finance.trust" },
];

export const MODULE_OVERLAY: Record<DiagnosticModuleCode, ModuleOverlay> = {
  auth: {
    severity: "user_blocker",
    owner: "platform",
    recoveryHint: "Check session cookies, /api/auth/login, and users.must_change_password after migrate.",
    tables: ["users", "staff_sessions", "password_reset_requests", "roles", "permissions", "role_permissions"],
  },
  clients: {
    severity: "user_blocker",
    owner: "product",
    recoveryHint: "Check clients table and compulsory KYC fields (type, first name, surname, phone, WhatsApp).",
    tables: ["clients", "related_parties", "conflict_checks", "intakes"],
  },
  matters: {
    severity: "user_blocker",
    owner: "product",
    recoveryHint: "Check matters table, client_id, and licence matter limits.",
    tables: ["matters", "matter_team", "matter_events", "pending_procedures", "disbursements", "time_entries"],
  },
  documents: {
    severity: "degraded",
    owner: "product",
    recoveryHint: "Check documents, templates, and Supabase storage bucket.",
    tables: ["documents", "templates", "template_versions", "document_portal_shares", "matter_portal_shares"],
  },
  calendar: {
    severity: "degraded",
    owner: "product",
    recoveryHint: "Check calendar_events and matter_deadlines.",
    tables: ["calendar_events", "matter_deadlines", "deadline_templates"],
  },
  crm: {
    severity: "cosmetic",
    owner: "product",
    recoveryHint: "Check firm_holidays and client date_of_birth for birthday views.",
    tables: ["firm_holidays"],
  },
  "finance.invoicing": {
    severity: "finance_blocker",
    owner: "finance",
    recoveryHint: "Fee invoices only. Do not post trust here. Check invoices, invoice_lines, fee_payments.",
    tables: ["invoices", "invoice_lines", "fee_payments", "quotations", "quotation_lines", "firm_services"],
  },
  "finance.debtors": {
    severity: "finance_blocker",
    owner: "finance",
    recoveryHint: "Aged AR is derived from unpaid fee invoices.",
    tables: ["invoices", "fee_payments"],
  },
  "finance.trust": {
    severity: "trust_blocker",
    owner: "finance",
    recoveryHint: "Trust wall: receipt is not a fee payment. Check trust_accounts and trust_ledger_entries.",
    tables: ["trust_accounts", "trust_ledger_entries", "trust_vault_bank_ins", "trust_vault_counts"],
  },
  "finance.recon": {
    severity: "trust_blocker",
    owner: "finance",
    recoveryHint: "Check finance_reconciliation_runs. Three-way recon is trust bank vs ledger vs client.",
    tables: ["finance_reconciliation_runs"],
  },
  "finance.expenses": {
    severity: "finance_blocker",
    owner: "finance",
    recoveryHint: "Firm books, not trust. Check firm_expenses, cashbook, petty cash, creditors.",
    tables: [
      "firm_expenses",
      "business_cashbook_entries",
      "petty_cash_floats",
      "petty_cash_movements",
      "creditors",
      "creditor_invoices",
      "creditor_payments",
      "firm_assets",
    ],
  },
  "finance.gl": {
    severity: "finance_blocker",
    owner: "finance",
    recoveryHint: "Check gl_accounts and gl_journal_entries. Journals must balance.",
    tables: ["gl_accounts", "gl_journal_entries", "gl_journal_lines"],
  },
  "finance.reports": {
    severity: "degraded",
    owner: "finance",
    recoveryHint: "Check export registry (finance_weekly / finance_monthly) and period locks.",
    tables: ["finance_period_locks"],
  },
  hr: {
    severity: "degraded",
    owner: "product",
    recoveryHint: "HR v1 has no payroll. Check hr_staff_profiles, contracts, leave.",
    tables: ["hr_staff_profiles", "hr_contracts", "hr_leave_types", "hr_leave_requests"],
  },
  reports: {
    severity: "degraded",
    owner: "product",
    recoveryHint: "Check /api/export and practice_report / lawyer_performance builders.",
    tables: [],
  },
  exports: {
    severity: "degraded",
    owner: "platform",
    recoveryHint: "Check lib/export/registry.ts keys. PDF/Word/Excel builders must load.",
    tables: [],
  },
  email: {
    severity: "degraded",
    owner: "platform",
    recoveryHint: "Check firm SMTP in Settings. Missing SMTP is not a database outage.",
    tables: [],
  },
  ai: {
    severity: "degraded",
    owner: "product",
    recoveryHint: "Check AI env keys or firm BYO keys. Budget errors are not connectivity.",
    tables: [
      "ai_settings",
      "ai_conversations",
      "ai_messages",
      "ai_jobs",
      "ai_embeddings",
      "ai_usage_events",
      "knowledge_chunks",
      "knowledge_sources",
      "firm_ai_proxy",
    ],
  },
  dashboard: {
    severity: "cosmetic",
    owner: "product",
    recoveryHint: "KPI clip / chart labels are regressions. Check overflow CSS, not a rebuild.",
    tables: [],
  },
  platform: {
    severity: "user_blocker",
    owner: "platform",
    recoveryHint: "Check /ops access, platform_admins, and OPS_IP_ALLOWLIST.",
    tables: [
      "firms",
      "platform_admins",
      "firm_licences",
      "firm_settings",
      "audit_logs",
      "staff_notifications",
      "portal_users",
      "portal_magic_links",
      "portal_inbox_uploads",
      "diagnostic_events",
      "diagnostic_spans",
      "diagnostic_diagnoses",
      "diagnostic_repair_actions",
    ],
  },
  db: {
    severity: "user_blocker",
    owner: "platform",
    recoveryHint: "Check DATABASE_URL and /api/db-status. SQLSTATE 42703 means run npm run db:migrate, not connectivity.",
    tables: ["app_meta"],
  },
};

export function moduleFromPath(pathname: string): DiagnosticModuleCode | undefined {
  const pathOnly = pathname.split("?")[0] ?? pathname;
  const ranked = [...ROUTE_MODULE_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const row of ranked) {
    if (pathOnly === row.prefix || pathOnly.startsWith(`${row.prefix}/`)) return row.module;
  }
  return undefined;
}
