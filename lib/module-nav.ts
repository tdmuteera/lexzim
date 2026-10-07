/**
 * Finance and HR sub-module tabs plus route permission rules (Phase 6).
 */

export type ModuleTab = {
  href: string;
  label: string;
  /** Primary permission (also used for access-tick labelling when present). */
  permission?: string;
  /** If set, any one of these permissions grants access to the tab. */
  anyOf?: string[];
  /** Legacy paths that should highlight this tab (e.g. /billing for Invoicing). */
  aliases?: string[];
};

export type RoutePermissionRule = {
  prefix: string;
  /** Single required permission (legacy). */
  permission?: string;
  /** Any one of these is enough. */
  anyOf?: string[];
};

export const FINANCE_TABS: ModuleTab[] = [
  {
    href: "/finance/invoicing",
    label: "Invoicing",
    permission: "billing.view",
    anyOf: ["billing.view", "billing.my_clients.view"],
    aliases: ["/billing"],
  },
  {
    href: "/finance/proforma",
    label: "Pro forma",
    permission: "billing.view",
    anyOf: ["billing.view", "finance.quote.manage"],
  },
  {
    href: "/finance/quotations",
    label: "Quotations",
    permission: "billing.view",
  },
  {
    href: "/finance/debtors",
    label: "Debtors",
    permission: "billing.view",
    anyOf: ["billing.view", "billing.my_clients.view"],
  },
  {
    href: "/finance/trust",
    label: "Trust",
    permission: "trust.view",
    aliases: ["/trust"],
  },
  {
    href: "/finance/payments",
    label: "Receipts / Receivables",
    permission: "finance.payments.view",
    anyOf: ["finance.payments.view", "billing.my_clients.view"],
  },
  {
    href: "/finance/client-accounts",
    label: "Client accounts",
    permission: "finance.view",
  },
  {
    href: "/finance/requisitions",
    label: "Requisitions",
    permission: "finance.requisitions.view",
  },
  {
    href: "/finance/disbursements",
    label: "Disbursement float",
    permission: "finance.view",
  },
  {
    href: "/finance/cash-book",
    label: "Business Cash Book",
    permission: "finance.view",
  },
  {
    href: "/finance/petty-cash",
    label: "Petty cash",
    permission: "finance.view",
  },
  {
    href: "/finance/transfers",
    label: "Funds transfer",
    permission: "finance.view",
  },
  {
    href: "/finance/reconciliations",
    label: "Reconciliations",
    permission: "finance.reconcile",
  },
  {
    href: "/finance/expenses",
    label: "Expenses & bank register",
    permission: "finance.view",
  },
  {
    href: "/finance/creditors",
    label: "Creditors",
    permission: "finance.view",
  },
  {
    href: "/finance/accounting",
    label: "General ledger",
    permission: "finance.gl.view",
  },
  {
    href: "/finance/reports",
    label: "Finance reports",
    permission: "finance.view",
  },
  {
    href: "/finance/commission",
    label: "Commission",
    permission: "finance.commission.view",
  },
];

export const HR_TABS: ModuleTab[] = [
  { href: "/hr/staff", label: "Staff records", permission: "hr.view" },
  { href: "/hr/contracts", label: "Contracts", permission: "hr.view" },
  {
    href: "/hr/leave",
    label: "Leave",
    permission: "hr.leave.request",
    anyOf: ["hr.leave.request", "hr.view"],
  },
  {
    href: "/hr/advances",
    label: "Salary advances",
    permission: "hr.advances.request",
    anyOf: ["hr.advances.request", "hr.view"],
  },
  { href: "/hr/payroll", label: "Payroll", permission: "hr.view" },
];

export const WORKFLOW_TABS: ModuleTab[] = [
  { href: "/workflow/my-day", label: "My Day", permission: "dashboard.view" },
  { href: "/workflow/tasks", label: "Tasks", permission: "dashboard.view" },
  { href: "/workflow/approvals", label: "Approvals", permission: "dashboard.view" },
];

/** Longest-prefix wins; order from most specific to least. */
export const ROUTE_PERMISSION_RULES: RoutePermissionRule[] = [
  {
    prefix: "/finance/invoicing",
    anyOf: ["billing.view", "billing.my_clients.view"],
  },
  { prefix: "/billing", anyOf: ["billing.view", "billing.my_clients.view"] },
  {
    prefix: "/finance/proforma",
    anyOf: ["billing.view", "finance.quote.manage"],
  },
  {
    prefix: "/finance/debtors",
    anyOf: ["billing.view", "billing.my_clients.view"],
  },
  { prefix: "/finance/trust", permission: "trust.view" },
  { prefix: "/trust", permission: "trust.view" },
  {
    prefix: "/finance/payments",
    anyOf: ["finance.payments.view", "billing.my_clients.view"],
  },
  { prefix: "/finance/client-accounts", permission: "finance.view" },
  { prefix: "/finance/requisitions", permission: "finance.requisitions.view" },
  { prefix: "/finance/commission", permission: "finance.commission.view" },
  { prefix: "/finance/reconciliations", permission: "finance.reconcile" },
  { prefix: "/finance/expenses", permission: "finance.view" },
  { prefix: "/finance/reports", permission: "finance.view" },
  { prefix: "/finance/quotations", permission: "billing.view" },
  { prefix: "/finance/petty-cash", permission: "finance.view" },
  { prefix: "/finance/cash-book", permission: "finance.view" },
  { prefix: "/finance/disbursements", permission: "finance.view" },
  { prefix: "/finance/transfers", permission: "finance.view" },
  { prefix: "/finance/creditors", permission: "finance.view" },
  { prefix: "/finance/accounting", permission: "finance.gl.view" },
  {
    prefix: "/finance",
    anyOf: [
      "finance.view",
      "billing.view",
      "billing.my_clients.view",
      "finance.payments.view",
      "trust.view",
      "finance.requisitions.view",
      "finance.reconcile",
      "finance.commission.view",
    ],
  },
  { prefix: "/hr/staff", permission: "hr.view" },
  { prefix: "/hr/contracts", permission: "hr.view" },
  { prefix: "/hr/leave", anyOf: ["hr.leave.request", "hr.view"] },
  { prefix: "/hr/advances", anyOf: ["hr.advances.request", "hr.view"] },
  { prefix: "/hr/payroll", permission: "hr.view" },
  {
    prefix: "/hr",
    anyOf: ["hr.view", "hr.leave.request", "hr.advances.request"],
  },
  { prefix: "/workflow/my-day", permission: "dashboard.view" },
  { prefix: "/workflow/tasks", permission: "dashboard.view" },
  { prefix: "/workflow/approvals", permission: "dashboard.view" },
  { prefix: "/workflow", permission: "dashboard.view" },
  { prefix: "/knowledge/reports", permission: "knowledge.reports.view" },
  { prefix: "/knowledge", permission: "knowledge.reports.view" },
  { prefix: "/crm", permission: "crm.view" },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function rulePermissions(rule: RoutePermissionRule): string[] {
  if (rule.anyOf?.length) return rule.anyOf;
  if (rule.permission) return [rule.permission];
  return [];
}

/** Permissions that grant a route (any one is enough). */
export function getRoutePermissionsFromRules(pathname: string): string[] {
  for (const rule of ROUTE_PERMISSION_RULES) {
    if (matchesPrefix(pathname, rule.prefix)) {
      return rulePermissions(rule);
    }
  }
  return [];
}

/** @deprecated Prefer getRoutePermissionsFromRules; returns first code for display. */
export function getRoutePermissionFromRules(pathname: string): string | undefined {
  return getRoutePermissionsFromRules(pathname)[0];
}

export function isModuleTabActive(pathname: string, tab: ModuleTab): boolean {
  if (matchesPrefix(pathname, tab.href)) return true;
  return (tab.aliases ?? []).some((alias) => matchesPrefix(pathname, alias));
}

export function tabIsAllowed(tab: ModuleTab, can: (code: string) => boolean): boolean {
  if (tab.anyOf?.length) return tab.anyOf.some((code) => can(code));
  if (tab.permission) return can(tab.permission);
  return true;
}

export function filterModuleTabs(
  tabs: ModuleTab[],
  can: (code: string) => boolean,
): ModuleTab[] {
  return tabs.filter((tab) => tabIsAllowed(tab, can));
}
