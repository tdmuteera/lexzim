/**
 * Post-setup onboarding checklist (P4-10).
 * Soft guidance only: never blocks the app; web lookup / telemetry stay off by default.
 */
import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, firms } from "@/lib/db/schema";
import { publicKeyInfo } from "@/lib/ai/secrets";
import { getAiSettings } from "@/lib/repos/ai-settings";
import {
  getFirmSetting,
  INVOICE_PREFIX_KEY,
  LAST_EXPORT_AT_KEY,
  ONBOARDING_DEMO_SEEDED_AT_KEY,
  ONBOARDING_DISMISSED_AT_KEY,
  ONBOARDING_EXPORT_ACK_KEY,
  ONBOARDING_PROFILE_CONFIRMED_AT_KEY,
} from "@/lib/repos/firm-settings";
import { getEffectiveLicence } from "@/lib/repos/licences";
import {
  countActiveFirmUsers,
  countFirmMatters,
  getLicenceUsage,
} from "@/lib/licensing/policy";

export type OnboardingStepId =
  | "firm_profile"
  | "currency"
  | "invoice_prefix"
  | "invite_users"
  | "licence"
  | "configure_ai"
  | "first_client_matter"
  | "export_reminder"
  | "demo_data";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  done: boolean;
  optional: boolean;
  href: string;
  helpHref: string;
};

export type OnboardingStatus = {
  dismissed: boolean;
  completedCount: number;
  requiredCount: number;
  allRequiredDone: boolean;
  steps: OnboardingStep[];
  demoSeedAllowed: boolean;
  safety: {
    webLookupDefaultOff: false;
    telemetryNotAutoEnabled: true;
    neverBlocksApp: true;
  };
};

function demoSeedAllowed(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.ALLOW_ONBOARDING_DEMO === "1";
  }
  return (
    process.env.ALLOW_ONBOARDING_DEMO === "1" ||
    process.env.DEV_SEED_ENABLED === "1"
  );
}

export async function getOnboardingStatus(firmId: string): Promise<OnboardingStatus> {
  const db = getDb();
  const firmRows = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
  const firm = firmRows[0];
  if (!firm) {
    return {
      dismissed: true,
      completedCount: 0,
      requiredCount: 0,
      allRequiredDone: true,
      steps: [],
      demoSeedAllowed: false,
      safety: {
        webLookupDefaultOff: false,
        telemetryNotAutoEnabled: true,
        neverBlocksApp: true,
      },
    };
  }

  const [
    dismissedAt,
    profileConfirmedAt,
    exportAckAt,
    lastExportAt,
    invoicePrefix,
    demoSeededAt,
    licence,
    usage,
    seatsUsed,
    matterCount,
    clientCountRows,
    aiRow,
    keyInfo,
  ] = await Promise.all([
    getFirmSetting(firmId, ONBOARDING_DISMISSED_AT_KEY),
    getFirmSetting(firmId, ONBOARDING_PROFILE_CONFIRMED_AT_KEY),
    getFirmSetting(firmId, ONBOARDING_EXPORT_ACK_KEY),
    getFirmSetting(firmId, LAST_EXPORT_AT_KEY),
    getFirmSetting(firmId, INVOICE_PREFIX_KEY),
    getFirmSetting(firmId, ONBOARDING_DEMO_SEEDED_AT_KEY),
    getEffectiveLicence(firmId),
    getLicenceUsage(firmId),
    countActiveFirmUsers(firmId),
    countFirmMatters(firmId),
    db
      .select({ n: count() })
      .from(clients)
      .where(and(eq(clients.firmId, firmId), isNull(clients.archivedAt))),
    getAiSettings(firmId),
    publicKeyInfo(firmId),
  ]);

  const clientCount = Number(clientCountRows[0]?.n ?? 0);
  const hasContact =
    Boolean(firm.contactEmail?.trim()) ||
    Boolean(firm.contactPhone?.trim()) ||
    Boolean(firm.addressLine1?.trim());
  const profileDone = Boolean(profileConfirmedAt) || hasContact;
  const currencyDone = Boolean(firm.defaultCurrency?.trim());
  const invoiceDone = Boolean(invoicePrefix?.trim());
  /** Solo / full seats: invite step is complete without needing another user. */
  const inviteDone =
    seatsUsed > 1 || usage.seats <= 1 || usage.seatsRemaining === 0;
  const licenceDone = licence.isActive;
  const aiDone = Boolean(aiRow) || keyInfo.status === "present";
  const practiceDone = clientCount >= 1 && matterCount >= 1;
  const exportDone = Boolean(lastExportAt) || Boolean(exportAckAt);
  const demoDone = Boolean(demoSeededAt);
  const allowDemo = demoSeedAllowed();

  const steps: OnboardingStep[] = [
    {
      id: "firm_profile",
      title: "Firm profile",
      description: "Confirm firm name, contact, and address.",
      done: profileDone,
      optional: false,
      href: "/settings?section=firm",
      helpHref: "/help/getting-started",
    },
    {
      id: "currency",
      title: "Default currency",
      description: "Set the firm default currency for fees and trust.",
      done: currencyDone,
      optional: false,
      href: "/settings?section=firm",
      helpHref: "/help/billing",
    },
    {
      id: "invoice_prefix",
      title: "Invoice prefix",
      description: "Choose the fee-note number prefix (e.g. INV).",
      done: invoiceDone,
      optional: false,
      href: "/settings?section=firm",
      helpHref: "/help/billing",
    },
    {
      id: "invite_users",
      title: "Invite users",
      description:
        usage.seats <= 1
          ? "Solo seat: you are the only user (no invite needed)."
          : `Invite colleagues within your seat limit (${usage.seatsUsed}/${usage.seats} used).`,
      done: inviteDone,
      optional: usage.seats <= 1,
      href: "/staff",
      helpHref: "/help/admin",
    },
    {
      id: "licence",
      title: "Licence / trial",
      description: licence.isActive
        ? `${licence.edition} licence is active.`
        : "Activate or renew the firm licence (export still works if expired).",
      done: licenceDone,
      optional: false,
      href: "/settings?section=licence",
      helpHref: "/help/admin",
    },
    {
      id: "configure_ai",
      title: "Configure AI",
      description:
        "Choose provider and keys. Web lookup stays off unless you enable it.",
      done: aiDone,
      optional: false,
      href: "/settings?section=ai",
      helpHref: "/help/ai",
    },
    {
      id: "first_client_matter",
      title: "First client and matter",
      description: "Create at least one client and one matter.",
      done: practiceDone,
      optional: false,
      href: "/clients",
      helpHref: "/help/daily",
    },
    {
      id: "export_reminder",
      title: "Backup export",
      description:
        "Run a firm export from Settings, or acknowledge you will schedule one.",
      done: exportDone,
      optional: false,
      href: "/settings?section=backup",
      helpHref: "/help/admin",
    },
    {
      id: "demo_data",
      title: "Sample demo data",
      description: allowDemo
        ? "Optional: load a sample client and matter for training."
        : "Optional demo seed is disabled in this environment.",
      done: demoDone || !allowDemo,
      optional: true,
      href: "/dashboard",
      helpHref: "/help/getting-started",
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const completedCount = required.filter((s) => s.done).length;

  return {
    dismissed: Boolean(dismissedAt),
    completedCount,
    requiredCount: required.length,
    allRequiredDone: required.every((s) => s.done),
    steps,
    demoSeedAllowed: allowDemo && !demoDone,
    safety: {
      webLookupDefaultOff: false,
      telemetryNotAutoEnabled: true,
      neverBlocksApp: true,
    },
  };
}
