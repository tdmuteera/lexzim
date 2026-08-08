/**
 * End-user help catalog (P4-11). Markdown lives in docs/user/.
 */
export type UserDocSlug =
  | "getting-started"
  | "admin"
  | "daily"
  | "billing"
  | "ai"
  | "intake"
  | "faq";

export type UserDocMeta = {
  slug: UserDocSlug;
  title: string;
  summary: string;
  /** Filename under docs/user/ */
  fileName: string;
  /** In-app shortcut into a related module */
  appHref: string;
};

export const USER_DOCS: UserDocMeta[] = [
  {
    slug: "getting-started",
    title: "Getting started (web)",
    summary:
      "Browser access, Railway URL, first login, and the soft onboarding checklist.",
    fileName: "Getting_Started_Web.md",
    appHref: "/settings?section=firm",
  },
  {
    slug: "admin",
    title: "Admin guide",
    summary:
      "Users and seats, licence, firm profile, backup export, and AI settings.",
    fileName: "Admin_Guide.md",
    appHref: "/settings?section=licence",
  },
  {
    slug: "daily",
    title: "Daily lawyer guide",
    summary: "Clients, matters, documents, calendar, reminders, and time.",
    fileName: "Daily_Lawyer_Guide.md",
    appHref: "/matters",
  },
  {
    slug: "billing",
    title: "Billing and trust quickstart",
    summary: "Fee notes versus trust money. Keep the two ledgers separate.",
    fileName: "Billing_Trust_Quickstart.md",
    appHref: "/billing",
  },
  {
    slug: "ai",
    title: "AI assistant",
    summary:
      "Zimbabwe-grounded AI. Web lookup off by default. Verify before you rely on answers.",
    fileName: "AI_Assistant_Guide.md",
    appHref: "/settings?section=ai",
  },
  {
    slug: "intake",
    title: "Intake and conflicts",
    summary: "Prospect capture, conflict search, override notes, and conversion.",
    fileName: "Intake_Conflicts_Guide.md",
    appHref: "/intake",
  },
  {
    slug: "faq",
    title: "FAQ",
    summary: "Password reset, export, licence expiry, AI not-found, and uptime.",
    fileName: "FAQ.md",
    appHref: "/help",
  },
];

export function getUserDocMeta(slug: string): UserDocMeta | null {
  return USER_DOCS.find((d) => d.slug === slug) ?? null;
}

export function isUserDocSlug(slug: string): slug is UserDocSlug {
  return USER_DOCS.some((d) => d.slug === slug);
}
