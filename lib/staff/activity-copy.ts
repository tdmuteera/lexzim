/** Plain-language labels for the Settings user-activity list. Safe to import from the browser. */

export const ACTIVITY_CATEGORIES = [
  { id: "sign-in", label: "Sign in" },
  { id: "calendar", label: "Calendar" },
  { id: "finance", label: "Finance" },
  { id: "email", label: "Email" },
  { id: "ai", label: "AI" },
  { id: "people", label: "People" },
  { id: "clients", label: "Clients" },
  { id: "documents", label: "Documents" },
  { id: "settings", label: "Settings" },
  { id: "other", label: "Other" },
] as const;

export type ActivityCategoryId = (typeof ACTIVITY_CATEGORIES)[number]["id"];

const TITLES: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.idle_logout": "Signed out after inactivity",
  "ai.legal_ask": "Asked the legal assistant",
  "staff_notify.email_sent": "Email sent",
  "staff_notify.email_failed": "Email failed to send",
  "staff_notify.test_sent": "Sent a test email",
  "calendar.create": "Added a calendar event",
  "calendar.delete": "Removed a calendar event",
  "calendar.color_update": "Changed their calendar colour",
  "calendar.guest_email_sent": "Emailed a calendar guest",
  "finance_requisitions.create": "Submitted a requisition",
  "finance_payment_intakes.create": "Recorded a receipt",
  "users.access_update": "Changed someone's access",
  "users.email_update": "Updated an email address",
  "users.lawyer_flag_update": "Updated the lawyer list",
  "delegation.grant": "Granted an approval right",
  "clients.update": "Updated a client",
  "clients.kyc_pdf.download": "Downloaded a KYC pack",
  "proformas.create": "Created a pro forma",
  "proformas.update": "Updated a pro forma",
  "proformas.delete": "Deleted a pro forma",
  "proformas.export": "Exported a pro forma",
  "gl_account.rename": "Renamed a ledger account",
  "settings.nav_pins_update": "Changed pinned sections",
  "onboarding.dismissed": "Dismissed the setup guide",
  "onboarding.restored": "Restored the setup guide",
  "staff_communication_emails.set": "Updated notification emails",
};

const FACT_LABELS: Record<string, string> = {
  amountCents: "Amount",
  receiptNumber: "Receipt",
  destination: "Where the money went",
  questionPreview: "Question",
  clientNumber: "Client number",
  displayName: "Name",
  subject: "Subject",
  to: "Sent to",
  error: "What went wrong",
  title: "Title",
  startsAt: "Starts",
  email: "Email",
  reason: "Reason",
  type: "Type",
  status: "Status",
  format: "Format",
  proformaNumber: "Pro forma",
  code: "Account",
  before: "Was",
  after: "Now",
  isLawyer: "Listed as a lawyer",
  calendarColor: "Colour",
  note: "Note",
  lineTypes: "Receipt lines",
  visibility: "Visibility",
  eventType: "Event type",
  capability: "Right granted",
  expiresAt: "Until",
  primary: "Primary email",
  count: "How many",
  failedCount: "Failed",
  from: "From",
  emptyReason: "Why nothing was found",
  confidence: "Confidence",
  notFound: "Nothing found",
  hitCount: "Sources used",
  clientType: "Client type",
  kind: "Kind",
  conveyancingCategory: "Category",
  byAdmin: "Changed by an administrator",
  communicationEmail: "Notification email",
  query: "Report",
  recipients: "Recipients",
  emails: "Addresses",
  permissionCodes: "Access ticks",
  pinnedSections: "Pinned sections",
  sharedUserIds: "Shared with",
};

const DESTINATIONS: Record<string, string> = {
  trust_bank: "Trust bank",
  trust_vault: "Trust vault",
  fee_bank: "Fee bank",
  fee_vault: "Business Cash Book",
  disbursement_account: "Disbursement account",
  disbursement_float_account: "Disbursement float",
  mixed: "Split destinations",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function activityCategory(action: string): ActivityCategoryId {
  if (action.startsWith("auth.")) return "sign-in";
  if (action === "calendar.guest_email_sent" || action.startsWith("staff_notify.") || action.startsWith("staff_communication")) {
    return "email";
  }
  if (action.startsWith("calendar.")) return "calendar";
  if (
    action.startsWith("finance") ||
    action.startsWith("gl_") ||
    action.startsWith("proformas.") ||
    action.startsWith("export.finance") ||
    action === "export.payment_intake"
  ) {
    return "finance";
  }
  if (action.startsWith("ai.")) return "ai";
  if (action.startsWith("users.") || action.startsWith("delegation.")) return "people";
  if (action.startsWith("clients.")) return "clients";
  if (action.startsWith("export.")) return "documents";
  if (action.startsWith("settings.") || action.startsWith("onboarding.")) return "settings";
  return "other";
}

export function activityCategoryLabel(id: ActivityCategoryId): string {
  return ACTIVITY_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

export function activityTitle(action: string): string {
  if (TITLES[action]) return TITLES[action];
  if (action.startsWith("export.")) {
    const kind = action.slice("export.".length).replace(/_/g, " ");
    return `Exported ${kind}`;
  }
  const words = action.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Recorded an action";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function asText(value: unknown, max = 160): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || UUID_RE.test(trimmed)) return null;
    return trimmed.length > max ? `${trimmed.slice(0, max - 3)}...` : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function money(cents: unknown): string | null {
  const n = typeof cents === "number" ? cents : typeof cents === "string" ? Number(cents) : NaN;
  if (!Number.isFinite(n)) return null;
  return `$${(n / 100).toFixed(2)}`;
}

function whenLabel(value: unknown): string | null {
  const text = asText(value, 40);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleString("en-GB", {
    timeZone: "Africa/Harare",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function activitySummary(action: string, metadata: Record<string, unknown>): string {
  const title = asText(metadata.title, 80);
  const subject = asText(metadata.subject, 90);
  const to = asText(metadata.to, 80);
  const email = asText(metadata.email, 80);
  const name = asText(metadata.displayName, 80);
  const number = asText(metadata.clientNumber ?? metadata.proformaNumber ?? metadata.receiptNumber, 40);
  const amount = money(metadata.amountCents);
  const question = asText(metadata.questionPreview, 110);
  const reason = asText(metadata.reason ?? metadata.error, 120);
  const destination = asText(metadata.destination, 40);
  const where = destination ? (DESTINATIONS[destination] ?? destination) : null;

  if (action === "auth.login" || action === "auth.logout") return email ?? "";
  if (action === "auth.idle_logout") return reason ?? email ?? "The session sat idle for 30 minutes.";
  if (action.startsWith("calendar.") && title) {
    const starts = whenLabel(metadata.startsAt);
    return starts ? `${title}. Starts ${starts}.` : title;
  }
  if (action.startsWith("staff_notify.email")) {
    return [subject, to ? `to ${to}` : null].filter(Boolean).join(", ");
  }
  if (action === "staff_notify.test_sent") return to ? `To ${to}` : "";
  if (action === "finance_payment_intakes.create") {
    return [number, amount, where].filter(Boolean).join(" · ");
  }
  if (action === "finance_requisitions.create") {
    const kind = asText(metadata.type, 40);
    return [kind === "business" ? "Business" : kind === "disbursement" ? "Disbursement" : kind, amount]
      .filter(Boolean)
      .join(" · ");
  }
  if (action.startsWith("clients.")) return [name, number].filter(Boolean).join(" · ");
  if (action.startsWith("proformas.")) return [number, asText(metadata.kind, 40)].filter(Boolean).join(" · ");
  if (action === "ai.legal_ask") return question ?? "";
  if (action === "gl_account.rename") {
    const code = asText(metadata.code, 12);
    const before = asText(metadata.before, 40);
    const after = asText(metadata.after, 40);
    if (before && after) return `${code ? `${code}: ` : ""}${before} to ${after}`;
  }
  if (action === "users.access_update" && Array.isArray(metadata.permissionCodes)) {
    return `${metadata.permissionCodes.length} access ticks saved`;
  }
  if (action === "users.lawyer_flag_update") {
    return metadata.isLawyer === true ? "Marked as a lawyer" : "Removed from the lawyer list";
  }
  if (reason) return reason;
  return [name, number, amount, subject, title].filter(Boolean).join(" · ");
}

export type ActivityFact = { label: string; value: string };

export function activityFacts(metadata: Record<string, unknown>): ActivityFact[] {
  const facts: ActivityFact[] = [];
  for (const [key, raw] of Object.entries(metadata)) {
    if (key === "sessionId" || key === "messageId" || key.endsWith("Id")) continue;
    const label = FACT_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
    let value: string | null = null;
    if (key === "amountCents") value = money(raw);
    else if (key === "destination") {
      const text = asText(raw, 60);
      value = text ? (DESTINATIONS[text] ?? text) : null;
    } else if (key === "startsAt" || key === "expiresAt") value = whenLabel(raw);
    else if (key === "isLawyer" || key === "byAdmin" || key === "notFound") {
      value = raw === true ? "Yes" : raw === false ? "No" : null;
    } else if (Array.isArray(raw)) {
      const texts = raw.map((item) => asText(item, 60)).filter((item): item is string => Boolean(item));
      value = texts.length ? texts.join(", ") : raw.length ? `${raw.length} items` : null;
    } else if (raw && typeof raw === "object") {
      value = null;
    } else {
      value = asText(raw, 240);
    }
    if (value) facts.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value });
  }
  return facts;
}

export function activityWhere(ipOrUserAgent: string | null): { ip: string | null; device: string | null } {
  if (!ipOrUserAgent) return { ip: null, device: null };
  const [ipPart, agent = ""] = ipOrUserAgent.split(" | ");
  const ip = ipPart && !ipPart.includes("Mozilla") ? ipPart : null;
  const ua = agent || (ipPart?.includes("Mozilla") ? ipPart : "");
  let browser = "";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iPhone";
  else if (/Mac OS/.test(ua)) os = "Mac";
  const device = [browser, os].filter(Boolean).join(" on ") || null;
  return { ip, device };
}
