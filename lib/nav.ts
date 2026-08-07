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
        href: "/intake",
        label: "Intake & Conflicts",
        icon: "clipboard",
        permission: "intake.view",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        href: "/billing",
        label: "Billing & Trust",
        icon: "invoice",
        permission: "billing.view",
      },
    ],
  },
  {
    title: "People & Insight",
    items: [
      { href: "/staff", label: "Lawyers & Staff", icon: "tie", permission: "users.manage" },
      { href: "/reports", label: "Reports", icon: "chart", permission: "reports.view" },
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
    ],
  },
];

export type RouteMeta = {
  title: string;
  subtitle: string;
  purpose: string;
  phaseBadge: "Phase 0 placeholder" | "Phase 1+" | "Phase 2+" | "Phase 3+";
};

export const routeMeta: Record<string, RouteMeta> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Command centre · T Pfigu Attorneys",
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
  "/intake": {
    title: "Intake & Conflicts",
    subtitle: "Prospect capture · conflict search · conversion",
    purpose: "Capture prospects and run conflict checks before opening a matter.",
    phaseBadge: "Phase 3+",
  },
  "/billing": {
    title: "Billing & Trust",
    subtitle: "Fee notes · time · trust ledger (separated from fees)",
    purpose: "Track time, invoices, and trust money with clear fee vs trust separation.",
    phaseBadge: "Phase 3+",
  },
  "/staff": {
    title: "Lawyers & Staff",
    subtitle: "Roles · workload · utilisation",
    purpose: "View staff roles and workload across the firm.",
    phaseBadge: "Phase 0 placeholder",
  },
  "/reports": {
    title: "Reports & Analytics",
    subtitle: "Performance · financials · management pack",
    purpose: "Management reports for fees, trust, time, and workload.",
    phaseBadge: "Phase 3+",
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
    subtitle: "Account · RBAC · security · AI · backup · cloud",
    purpose: "Firm backup/export and AI provider settings.",
    phaseBadge: "Phase 0 placeholder",
  },
};

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

/** Permission required to access a platform route (from nav config). */
export function getRoutePermission(pathname: string): string | undefined {
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
