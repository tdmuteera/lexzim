import { getRoutePermissionFromRules } from "@/lib/module-nav";

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
  | "check";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Required permission to see nav item and access route (P0-10). */
  permission?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

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
    items: [
      {
        href: "/finance/invoicing",
        label: "Invoicing",
        icon: "invoice",
        permission: "billing.view",
      },
      {
        href: "/finance/debtors",
        label: "Debtors",
        icon: "list",
        permission: "billing.view",
      },
      {
        href: "/finance/trust",
        label: "Trust",
        icon: "shield",
        permission: "trust.view",
      },
      {
        href: "/finance/reconciliations",
        label: "Reconciliations",
        icon: "check",
        permission: "finance.reconcile",
      },
      {
        href: "/finance/expenses",
        label: "Expenses & cashbook",
        icon: "clipboard",
        permission: "finance.view",
      },
      {
        href: "/finance/reports",
        label: "Finance reports",
        icon: "chart",
        permission: "finance.view",
      },
    ],
  },
  {
    title: "HR",
    items: [
      { href: "/hr/staff", label: "Staff records", icon: "user", permission: "hr.view" },
      { href: "/hr/contracts", label: "Contracts", icon: "folder", permission: "hr.view" },
      { href: "/hr/leave", label: "Leave", icon: "calendar", permission: "hr.view" },
      { href: "/hr/advances", label: "Salary advances", icon: "invoice", permission: "hr.view" },
      { href: "/hr/payroll", label: "Payroll", icon: "clipboard", permission: "hr.view" },
    ],
  },
  {
    title: "Workflow",
    items: [
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
  phaseBadge: "Phase 0 placeholder" | "Phase 1+" | "Phase 2+" | "Phase 3+" | "Phase 4+" | "Phase 6+" | "Phase 7+" | "Phase 10";
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
  "/finance/reconciliations": {
    title: "Reconciliations",
    subtitle: "Trust bank · vault · business bank",
    purpose: "Three-way trust reconciliation and business bank matching workflows.",
    phaseBadge: "Phase 6+",
  },
  "/finance/expenses": {
    title: "Expenses & cashbook",
    subtitle: "Firm operating costs · business bank in/out",
    purpose: "Record firm expenses and business cashbook entries, separate from client trust.",
    phaseBadge: "Phase 6+",
  },
  "/finance/reports": {
    title: "Finance reports",
    subtitle: "Weekly pack · monthly close · P&L",
    purpose: "Proposal-aligned finance reporting for partners and accounts staff.",
    phaseBadge: "Phase 6+",
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

/** Permission required to access a platform route (nav config + Phase 6 module rules). */
export function getRoutePermission(pathname: string): string | undefined {
  const fromRules = getRoutePermissionFromRules(pathname);
  if (fromRules) return fromRules;

  for (const section of navSections) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item.permission;
      }
    }
  }
  return undefined;
}

/** Filter nav sections/items by permission checker (sidebar P0-10). */
export function filterNavSections(can: (code: string) => boolean): NavSection[] {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}
