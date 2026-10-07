import { getRoutePermissionsFromRules } from "@/lib/module-nav";

export type NavIcon =
  | "dashboard"
  | "users"
  | "briefcase"
  | "folder"
  | "calendar"
  | "clipboard"
  | "invoice"
  | "tie"
  | "chart"
  | "robot"
  | "audit"
  | "gear"
  | "menu"
  | "search"
  | "bell"
  | "chevron"
  | "logout"
  | "user"
  | "shield"
  | "list"
  | "lock"
  | "scale"
  | "login"
  | "check"
  | "pin";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Required permission to see nav item and access route (P0-10). */
  permission?: string;
  /** If set, any one of these permissions shows the item. */
  anyOf?: string[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
  /** When set, the sidebar shows these headings inside the section. */
  groups?: NavGroup[];
};

/** Flat item list. Grouped sections (Finance) keep items inside groups. */
export function navSectionItems(section: NavSection): NavItem[] {
  if (section.groups?.length) return section.groups.flatMap((group) => group.items);
  return section.items;
}

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "dashboard",
        permission: "dashboard.view",
      },
    ],
  },
  {
    title: "Practice",
    items: [
      { href: "/clients", label: "Clients", icon: "users", permission: "clients.view" },
      { href: "/matters", label: "Matters", icon: "briefcase", permission: "matters.view" },
      {
        href: "/documents",
        label: "Documents",
        icon: "folder",
        permission: "documents.view",
      },
      {
        href: "/calendar",
        label: "Calendar",
        icon: "calendar",
        permission: "calendar.view",
      },
      {
        href: "/reminders",
        label: "Reminders",
        icon: "bell",
        permission: "calendar.view",
      },
      {
        href: "/crm",
        label: "CRM",
        icon: "user",
        permission: "crm.view",
      },
    ],
  },
  {
    title: "Finance",
    items: [],
    groups: [
      {
        title: "Money in",
        items: [
          {
            href: "/finance/invoicing",
            label: "Invoicing",
            icon: "invoice",
            permission: "billing.view",
            anyOf: ["billing.view", "billing.my_clients.view"],
          },
          {
            href: "/finance/proforma",
            label: "Pro forma",
            icon: "clipboard",
            permission: "billing.view",
            anyOf: ["billing.view", "finance.quote.manage"],
          },
          {
            href: "/finance/quotations",
            label: "Quotations",
            icon: "clipboard",
            permission: "billing.view",
          },
          {
            href: "/finance/debtors",
            label: "Debtors",
            icon: "list",
            permission: "billing.view",
            anyOf: ["billing.view", "billing.my_clients.view"],
          },
          {
            href: "/finance/payments",
            label: "Receipts / Receivables",
            icon: "invoice",
            permission: "finance.payments.view",
            anyOf: ["finance.payments.view", "billing.my_clients.view"],
          },
        ],
      },
      {
        title: "Client money",
        items: [
          {
            href: "/finance/trust",
            label: "Trust",
            icon: "shield",
            permission: "trust.view",
          },
          {
            href: "/finance/client-accounts",
            label: "Client accounts",
            icon: "list",
            permission: "finance.view",
          },
        ],
      },
      {
        title: "Office cash",
        items: [
          {
            href: "/finance/cash-book",
            label: "Business Cash Book",
            icon: "list",
            permission: "finance.view",
          },
          {
            href: "/finance/petty-cash",
            label: "Petty cash",
            icon: "invoice",
            permission: "finance.view",
          },
          {
            href: "/finance/disbursements",
            label: "Disbursement float",
            icon: "shield",
            permission: "finance.view",
          },
          {
            href: "/finance/transfers",
            label: "Funds transfer",
            icon: "check",
            permission: "finance.view",
          },
          {
            href: "/finance/expenses",
            label: "Expenses & bank register",
            icon: "clipboard",
            permission: "finance.view",
          },
          {
            href: "/finance/creditors",
            label: "Creditors",
            icon: "clipboard",
            permission: "finance.view",
          },
        ],
      },
      {
        title: "Control",
        items: [
          {
            href: "/finance/requisitions",
            label: "Requisitions",
            icon: "clipboard",
            permission: "finance.requisitions.view",
          },
          {
            href: "/finance/reconciliations",
            label: "Reconciliations",
            icon: "check",
            permission: "finance.reconcile",
          },
          {
            href: "/finance/accounting",
            label: "General ledger",
            icon: "chart",
            permission: "finance.gl.view",
          },
          {
            href: "/finance/reports",
            label: "Finance reports",
            icon: "chart",
            permission: "finance.view",
          },
          {
            href: "/finance/commission",
            label: "Commission",
            icon: "chart",
            permission: "finance.commission.view",
          },
        ],
      },
    ],
  },
  {
    title: "HR",
    items: [
      { href: "/hr/staff", label: "Staff records", icon: "user", permission: "hr.view" },
      { href: "/hr/contracts", label: "Contracts", icon: "folder", permission: "hr.view" },
      {
        href: "/hr/leave",
        label: "Leave",
        icon: "calendar",
        permission: "hr.leave.request",
        anyOf: ["hr.leave.request", "hr.view"],
      },
      {
        href: "/hr/advances",
        label: "Salary advances",
        icon: "invoice",
        permission: "hr.advances.request",
        anyOf: ["hr.advances.request", "hr.view"],
      },
      { href: "/hr/payroll", label: "Payroll", icon: "clipboard", permission: "hr.view" },
    ],
  },
  {
    title: "Workflow",
    items: [
      {
        href: "/workflow/my-day",
        label: "My Day",
        icon: "pin",
        permission: "dashboard.view",
      },
      {
        href: "/workflow/tasks",
        label: "Tasks",
        icon: "check",
        permission: "dashboard.view",
      },
      {
        href: "/workflow/approvals",
        label: "Approvals",
        icon: "clipboard",
        permission: "dashboard.view",
      },
    ],
  },
  {
    title: "Knowledge",
    items: [
      {
        href: "/knowledge/reports",
        label: "Reports",
        icon: "folder",
        permission: "knowledge.reports.view",
      },
    ],
  },
  {
    title: "People & Insight",
    items: [
      { href: "/staff", label: "User access", icon: "tie", permission: "users.manage" },
      { href: "/reports", label: "Reports", icon: "chart", permission: "reports.view" },
      {
        href: "/reports/lawyer-performance",
        label: "Lawyer performance",
        icon: "chart",
        permission: "reports.view",
      },
      { href: "/ai", label: "AI Assistant", icon: "robot", permission: "ai.use" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/audit", label: "Audit Log", icon: "audit", permission: "audit.view" },
      {
        href: "/settings",
        label: "Settings",
        icon: "gear",
        permission: "settings.manage",
      },
      {
        href: "/help",
        label: "Help",
        icon: "clipboard",
      },
    ],
  },
];

export type RouteMeta = {
  title: string;
  subtitle: string;
  purpose: string;
  phaseBadge: "Phase 0 placeholder" | "Phase 1+" | "Phase 2+" | "Phase 3+" | "Phase 4+" | "Phase 6+" | "Phase 7+" | "Phase 10" | "Phase 11";
};

export const routeMeta: Record<string, RouteMeta> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Command centre",
    purpose: "Practice overview: matters, deadlines, reminders, and firm pulse.",
    phaseBadge: "Phase 1+",
  },
  "/clients": {
    title: "Client Management",
    subtitle: "Registry · profiles · KYC · assigned lawyers",
    purpose: "Register and manage individual and company clients for the firm.",
    phaseBadge: "Phase 1+",
  },
  "/matters": {
    title: "Matter Management",
    subtitle: "Matter-centric case files · timelines · procedures",
    purpose: "Open and track matters linked to clients, status, and next actions.",
    phaseBadge: "Phase 1+",
  },
  "/documents": {
    title: "Documents & Templates",
    subtitle: "Repository · version control · merge templates",
    purpose: "Store matter documents and generate Word files from templates.",
    phaseBadge: "Phase 1+",
  },
  "/calendar": {
    title: "Court Calendar & Deadlines",
    subtitle: "Hearings · filings · appointments · reminders",
    purpose: "Local court diary and filing deadlines for the practice.",
    phaseBadge: "Phase 3+",
  },
  "/reminders": {
    title: "Reminders",
    subtitle: "Overdue · due soon · hearings",
    purpose: "In-app reminder centre for procedures, filing deadlines, and hearings.",
    phaseBadge: "Phase 3+",
  },
  "/crm": {
    title: "Client relationships",
    subtitle: "Birthdays · public holidays · client care",
    purpose: "Track client birthdays and firm holidays for thoughtful follow-up. Not a marketing CRM.",
    phaseBadge: "Phase 6+",
  },
  "/billing": {
    title: "Invoicing",
    subtitle: "Fee notes · time · disbursements · fee payments",
    purpose: "Track fee invoices and fee receipts, separate from trust. Legacy alias for /finance/invoicing.",
    phaseBadge: "Phase 3+",
  },
  "/trust": {
    title: "Trust accounting",
    subtitle: "Receipts · payments · transfers · client statements",
    purpose: "Client money held in trust, never mixed with fee payments. Legacy alias for /finance/trust.",
    phaseBadge: "Phase 3+",
  },
  "/finance/invoicing": {
    title: "Invoicing",
    subtitle: "Fee notes · time · disbursements · fee payments",
    purpose: "Track fee invoices and fee receipts, separate from trust.",
    phaseBadge: "Phase 3+",
  },
  "/finance/proforma": {
    title: "Pro forma",
    subtitle: "Legal fees draft · conveyancing estimates",
    purpose:
      "Draft legal-fees and conveyancing estimates. Prefills are editable. Does not post to debtors or GL.",
    phaseBadge: "Phase 11",
  },
  "/finance/quotations": {
    title: "Quotations",
    subtitle: "Service catalogue quotes",
    purpose: "Client quotations. They do not post to the ledger until converted to an invoice.",
    phaseBadge: "Phase 11",
  },
  "/finance/debtors": {
    title: "Debtors",
    subtitle: "Outstanding fees · ageing · weekly collections focus",
    purpose: "Monitor aged receivables and outstanding fee invoices for accounts oversight.",
    phaseBadge: "Phase 6+",
  },
  "/finance/trust": {
    title: "Trust accounting",
    subtitle: "Receipts · payments · transfers · client statements",
    purpose: "Client money held in trust, never mixed with fee payments.",
    phaseBadge: "Phase 3+",
  },
  "/finance/payments": {
    title: "Receipts / Receivables",
    subtitle: "Money in · trust / fee / disbursement split",
    purpose: "Record client payments and apportion trust hold, fee revenue, and disbursement float. Trust first; fees-only exception for direct fee bank receipts.",
    phaseBadge: "Phase 11",
  },
  "/finance/client-accounts": {
    title: "Client accounts",
    subtitle: "Trust · fees · disbursements per client",
    purpose: "Bookkeeper view of client money: trust balances, fee activity, disbursements, and payment intakes. Finance override sees all clients; others see assigned only.",
    phaseBadge: "Phase 11",
  },
  "/finance/requisitions": {
    title: "Requisitions",
    subtitle: "Business · disbursement requests",
    purpose: "Request firm operating funds or matter disbursements (Client then Matter), then approve and pay.",
    phaseBadge: "Phase 11",
  },
  "/finance/reconciliations": {
    title: "Reconciliations",
    subtitle: "Trust bank · vault · business bank",
    purpose: "Three-way trust reconciliation and business bank matching workflows.",
    phaseBadge: "Phase 6+",
  },
  "/finance/creditors": {
    title: "Creditors",
    subtitle: "Accounts payable · who we owe",
    purpose: "Supplier bills the firm must pay, and payments against those bills.",
    phaseBadge: "Phase 6+",
  },
  "/finance/accounting": {
    title: "General ledger",
    subtitle: "Chart of accounts · journals · statements",
    purpose: "Firm books: accounts, journals, trial balance, and financial statements.",
    phaseBadge: "Phase 6+",
  },
  "/finance/accounting/accounts": {
    title: "General ledger",
    subtitle: "Chart of accounts",
    purpose: "Firm books: accounts, journals, trial balance, and financial statements.",
    phaseBadge: "Phase 6+",
  },
  "/finance/accounting/journals": {
    title: "General ledger",
    subtitle: "Journals",
    purpose: "Firm books: accounts, journals, trial balance, and financial statements.",
    phaseBadge: "Phase 6+",
  },
  "/finance/accounting/trial-balance": {
    title: "General ledger",
    subtitle: "Trial balance",
    purpose: "Firm books: accounts, journals, trial balance, and financial statements.",
    phaseBadge: "Phase 6+",
  },
  "/finance/accounting/statements": {
    title: "General ledger",
    subtitle: "Financial statements",
    purpose: "Firm books: accounts, journals, trial balance, and financial statements.",
    phaseBadge: "Phase 6+",
  },
  "/finance/expenses": {
    title: "Expenses & bank register",
    subtitle: "Firm operating costs · business bank in/out",
    purpose: "Record firm expenses and business bank register entries, separate from client trust.",
    phaseBadge: "Phase 6+",
  },
  "/finance/disbursements": {
    title: "Disbursement float",
    subtitle: "Trust first · float covers shortfalls · monthly top-up",
    purpose: "Firm money that advances client disbursements when trust is short. Recoveries return to the float.",
    phaseBadge: "Phase 11",
  },
  "/finance/cash-book": {
    title: "Business Cash Book",
    subtitle: "Firm cash on premises · GL 1020",
    purpose: "Cash fee receipts and cash movements of the firm, straight from the general ledger.",
    phaseBadge: "Phase 11",
  },
  "/finance/petty-cash": {
    title: "Business Petty Cash",
    subtitle: "Small office cash · GL 1050",
    purpose: "Minor office expenses paid in cash. Topped up from the Business Cash Book or bank.",
    phaseBadge: "Phase 11",
  },
  "/finance/transfers": {
    title: "Funds transfer",
    subtitle: "Bank · cash book · petty cash · float",
    purpose: "Move firm money between the operating bank, Business Cash Book, petty cash and disbursement float.",
    phaseBadge: "Phase 11",
  },
  "/finance/reports": {
    title: "Finance reports",
    subtitle: "Weekly pack · monthly close · P&L",
    purpose: "Proposal-aligned finance reporting for partners and accounts staff.",
    phaseBadge: "Phase 6+",
  },
  "/finance/commission": {
    title: "Commission",
    subtitle: "Targets · collected fees · amounts due",
    purpose: "Lawyer commission on collected fee revenue above a configurable monthly target. Not payroll.",
    phaseBadge: "Phase 11",
  },
  "/hr/staff": {
    title: "Staff records",
    subtitle: "Directory · employment details · HR files",
    purpose: "HR staff profiles linked to firm users where applicable.",
    phaseBadge: "Phase 6+",
  },
  "/hr/contracts": {
    title: "Contracts",
    subtitle: "Employment agreements · renewals",
    purpose: "Store and track staff contract documents and terms.",
    phaseBadge: "Phase 6+",
  },
  "/hr/leave": {
    title: "Leave",
    subtitle: "Requests · ledger · approvals",
    purpose: "Leave types, entitlement ledger, requests, and discretionary approval.",
    phaseBadge: "Phase 6+",
  },
  "/hr/advances": {
    title: "Salary advances",
    subtitle: "Request · finance · discretionary approval",
    purpose: "Salary advance workflow with payroll recovery. Approval is discretionary.",
    phaseBadge: "Phase 10",
  },
  "/hr/payroll": {
    title: "Payroll",
    subtitle: "Periods · deductions · mark paid",
    purpose: "Payroll MVP with advance recovery. Full statutory payroll remains deferred.",
    phaseBadge: "Phase 10",
  },
  "/workflow/my-day": {
    title: "My Day",
    subtitle: "Private to-do · roll-over · 14-day plan",
    purpose: "Personal to-do list. No emails and not on the shared calendar unless moved there.",
    phaseBadge: "Phase 11",
  },
  "/workflow/tasks": {
    title: "Tasks",
    subtitle: "Assign · complete · track",
    purpose: "Firm-wide tasks with assignee notifications. Distinct from matter pending procedures.",
    phaseBadge: "Phase 10",
  },
  "/workflow/approvals": {
    title: "Approvals",
    subtitle: "Leave · advances · invoices · resets",
    purpose: "Unified inbox linking to leave, salary advances, invoice approval, and password resets.",
    phaseBadge: "Phase 10",
  },
  "/knowledge/reports": {
    title: "Knowledge reports",
    subtitle: "Events · training · BD uploads",
    purpose:
      "Store and download firm event and training reports (separate from AI knowledge packs).",
    phaseBadge: "Phase 10",
  },
  "/staff": {
    title: "User access",
    subtitle: "Logins · roles · RBAC",
    purpose: "Invite users, assign roles, and manage platform access (distinct from HR records).",
    phaseBadge: "Phase 0 placeholder",
  },
  "/reports": {
    title: "Reports & Analytics",
    subtitle: "AR · time · trust · workload · upcoming",
    purpose: "Management reports for fees, trust, time, and workload.",
    phaseBadge: "Phase 3+",
  },
  "/reports/lawyer-performance": {
    title: "Lawyer performance",
    subtitle: "Caseload · fees collected by responsible lawyer",
    purpose: "Open matters and cash collected, attributed to the matter responsible lawyer.",
    phaseBadge: "Phase 7+",
  },
  "/ai": {
    title: "AI Legal Assistant",
    subtitle: "Zimbabwe RAG · firm memory · drafting help",
    purpose: "Grounded Zimbabwe legal research, firm memory, and drafting assistance.",
    phaseBadge: "Phase 2+",
  },
  "/audit": {
    title: "Audit Log",
    subtitle: "Sensitive actions · immutable history",
    purpose: "Review sensitive actions recorded for accountability.",
    phaseBadge: "Phase 0 placeholder",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Firm profile · licence · AI · backup",
    purpose: "Firm profile, licence, AI provider settings, and backup/export.",
    phaseBadge: "Phase 1+",
  },
  "/help": {
    title: "Help",
    subtitle: "Getting started · admin · billing · AI",
    purpose: "Pilot help topics and links into the app.",
    phaseBadge: "Phase 4+",
  },
};

/** Topbar subtitle; dashboard includes the signed-in firm's display name. */
export function getPageSubtitle(pathname: string, firmName?: string | null): string {
  const meta = getRouteMeta(pathname);
  if (pathname === "/dashboard" && firmName) {
    return `Command centre · ${firmName}`;
  }
  return meta.subtitle;
}

export function getRouteMeta(pathname: string): RouteMeta {
  return (
    routeMeta[pathname] ?? {
      title: "LexZim",
      subtitle: "Practice Platform",
      purpose: "Module placeholder.",
      phaseBadge: "Phase 0 placeholder",
    }
  );
}

/** Permissions that grant a platform route (any one is enough). */
export function getRoutePermissions(pathname: string): string[] {
  const fromRules = getRoutePermissionsFromRules(pathname);
  if (fromRules.length) return fromRules;

  for (const section of navSections) {
    for (const item of navSectionItems(section)) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        if (item.anyOf?.length) return item.anyOf;
        if (item.permission) return [item.permission];
        return [];
      }
    }
  }
  return [];
}

/** Permission required to access a platform route (first code; for AccessDenied display). */
export function getRoutePermission(pathname: string): string | undefined {
  return getRoutePermissions(pathname)[0];
}

function navItemVisible(item: NavItem, can: (code: string) => boolean): boolean {
  if (item.anyOf?.length) return item.anyOf.some((code) => can(code));
  if (item.permission) return can(item.permission);
  return true;
}

/** Filter nav sections/items by permission checker (sidebar P0-10). */
export function filterNavSections(can: (code: string) => boolean): NavSection[] {
  return navSections
    .map((section) => {
      if (section.groups?.length) {
        const groups = section.groups
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => navItemVisible(item, can)),
          }))
          .filter((group) => group.items.length > 0);
        return {
          ...section,
          groups,
          items: groups.flatMap((group) => group.items),
        };
      }
      return {
        ...section,
        items: section.items.filter((item) => navItemVisible(item, can)),
      };
    })
    .filter((section) => navSectionItems(section).length > 0);
}
