/**
 * Finance and HR sub-module tabs plus route permission rules (Phase 6).
 */

export type ModuleTab = {
  href: string;
  label: string;
  permission?: string;
  /** Legacy paths that should highlight this tab (e.g. /billing for Invoicing). */
  aliases?: string[];
};

export const FINANCE_TABS: ModuleTab[] = [
  {
    href: "/finance/invoicing",
    label: "Invoicing",
    permission: "billing.view",
    aliases: ["/billing"],
  },
  {
    href: "/finance/debtors",
    label: "Debtors",
    permission: "billing.view",
  },
  {
    href: "/finance/trust",
    label: "Trust",
    permission: "trust.view",
    aliases: ["/trust"],
  },
  {
    href: "/finance/reconciliations",
    label: "Reconciliations",
    permission: "finance.reconcile",
  },
  {
    href: "/finance/expenses",
    label: "Expenses & cashbook",
    permission: "finance.view",
  },
  {
    href: "/finance/reports",
    label: "Finance reports",
    permission: "finance.view",
  },
  {
    href: "/finance/quotations",
    label: "Quotations",
    permission: "billing.view",
  },
  {
    href: "/finance/petty-cash",
    label: "Petty cash",
    permission: "finance.view",
  },
  {
    href: "/finance/creditors",
    label: "Creditors",
    permission: "finance.view",
  },
  {
    href: "/finance/accounting",
    label: "Accounting",
    permission: "finance.gl.view",
  },
];

export const HR_TABS: ModuleTab[] = [
  { href: "/hr/staff", label: "Staff records", permission: "hr.view" },
  { href: "/hr/contracts", label: "Contracts", permission: "hr.view" },
  { href: "/hr/leave", label: "Leave", permission: "hr.view" },
];

/** Longest-prefix wins; order from most specific to least. */
export const ROUTE_PERMISSION_RULES: { prefix: string; permission: string }[] = [
  { prefix: "/finance/invoicing", permission: "billing.view" },
  { prefix: "/billing", permission: "billing.view" },
  { prefix: "/finance/debtors", permission: "billing.view" },
  { prefix: "/finance/trust", permission: "trust.view" },
  { prefix: "/trust", permission: "trust.view" },
  { prefix: "/finance/reconciliations", permission: "finance.reconcile" },
  { prefix: "/finance/expenses", permission: "finance.view" },
  { prefix: "/finance/reports", permission: "finance.view" },
  { prefix: "/finance/quotations", permission: "billing.view" },
  { prefix: "/finance/petty-cash", permission: "finance.view" },
  { prefix: "/finance/creditors", permission: "finance.view" },
  { prefix: "/finance/accounting", permission: "finance.gl.view" },
  { prefix: "/finance", permission: "finance.view" },
  { prefix: "/hr/staff", permission: "hr.view" },
  { prefix: "/hr/contracts", permission: "hr.view" },
  { prefix: "/hr/leave", permission: "hr.view" },
  { prefix: "/hr", permission: "hr.view" },
  { prefix: "/crm", permission: "crm.view" },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getRoutePermissionFromRules(pathname: string): string | undefined {
  for (const rule of ROUTE_PERMISSION_RULES) {
    if (matchesPrefix(pathname, rule.prefix)) {
      return rule.permission;
    }
  }
  return undefined;
}

export function isModuleTabActive(pathname: string, tab: ModuleTab): boolean {
  if (matchesPrefix(pathname, tab.href)) return true;
  return (tab.aliases ?? []).some((alias) => matchesPrefix(pathname, alias));
}

export function filterModuleTabs(
  tabs: ModuleTab[],
  can: (code: string) => boolean,
): ModuleTab[] {
  return tabs.filter((tab) => !tab.permission || can(tab.permission));
}
