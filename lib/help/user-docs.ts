/**
 * End-user help catalog (P4-11). Markdown lives in docs/user/.
 */
export type UserDocSlug =
  | "getting-started"
  | "admin"
  | "daily"
  | "clients-kyc"
  | "crm"
  | "finance"
  | "finance-gl"
  | "billing"
  | "email"
  | "security"
  | "ai"
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
      "Users and seats, licence, firm profile, email, security, backup export, and AI settings.",
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
    slug: "clients-kyc",
    title: "Clients and KYC",
    summary: "CL numbers, compulsory intake fields, and KYC tabs on the client profile.",
    fileName: "Clients_KYC_Guide.md",
    appHref: "/clients",
  },
  {
    slug: "crm",
    title: "CRM: birthdays and holidays",
    summary: "Upcoming client birthdays and firm public holidays. Not a marketing tool.",
    fileName: "CRM_Guide.md",
    appHref: "/crm",
  },
  {
    slug: "finance",
    title: "Finance desk",
    summary: "Invoicing, debtors, trust, recon, expenses, and month close.",
    fileName: "Finance_Desk_Quickstart.md",
    appHref: "/finance/invoicing",
  },
  {
    slug: "finance-gl",
    title: "Quotations, GL, creditors, petty cash",
    summary: "Service quotes, trial balance, AP bills, and petty cash float.",
    fileName: "Finance_Phase7_Guide.md",
    appHref: "/finance/quotations",
  },
  {
    slug: "billing",
    title: "Billing and trust quickstart",
    summary: "Fee notes versus trust money. Keep the two ledgers separate.",
    fileName: "Billing_Trust_Quickstart.md",
    appHref: "/billing",
  },
  {
    slug: "email",
    title: "Email setup",
    summary: "Firm SMTP, test send, and emailing quotes, invoices, and receipts.",
    fileName: "Email_Setup.md",
    appHref: "/settings?section=email",
  },
  {
    slug: "security",
    title: "Security and passwords",
    summary: "Who can create users, temp passwords, and approval-gated resets.",
    fileName: "Security_Password_Policy.md",
    appHref: "/settings?section=security",
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
