/**
 * Optional onboarding sample data (P4-10).
 * Never enables web lookup or telemetry. Gated by env flags.
 */
import "server-only";

import { AuthError } from "@/lib/auth/types";
import { createClient } from "@/lib/repos/clients";
import {
  ONBOARDING_DEMO_SEEDED_AT_KEY,
  getFirmSetting,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";
import { createMatter } from "@/lib/repos/matters";
import { assertCanCreateMatter } from "@/lib/licensing/policy";

export function isOnboardingDemoAllowed(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.ALLOW_ONBOARDING_DEMO === "1";
  }
  return (
    process.env.ALLOW_ONBOARDING_DEMO === "1" ||
    process.env.DEV_SEED_ENABLED === "1"
  );
}

export async function loadOnboardingDemoData(
  firmId: string,
  userId: string,
): Promise<{ clientId: string; matterId: string; alreadySeeded: boolean }> {
  if (!isOnboardingDemoAllowed()) {
    throw new AuthError(
      "forbidden",
      "Demo data loading is disabled. Set ALLOW_ONBOARDING_DEMO=1 (or DEV_SEED_ENABLED=1 in non-production).",
    );
  }

  const existing = await getFirmSetting(firmId, ONBOARDING_DEMO_SEEDED_AT_KEY);
  if (existing) {
    return { clientId: "", matterId: "", alreadySeeded: true };
  }

  await assertCanCreateMatter(firmId);

  const client = await createClient(firmId, userId, {
    clientType: "individual",
    fullName: "Demo Client (Sample)",
    email: "demo.client@example.local",
    phone: "+263 77 000 0000",
    physicalAddress: "Harare (sample onboarding data)",
    kycNotes: "Created by LexZim onboarding demo loader. Safe to edit or archive.",
  });

  const matter = await createMatter(firmId, userId, {
    clientId: client.id,
    title: "Sample matter (onboarding demo)",
    description:
      "Placeholder matter from the post-setup checklist. Web lookup and telemetry were not changed.",
    areaOfLaw: "Civil",
    status: "prospective",
    priority: "normal",
    responsibleLawyerId: userId,
  });

  await upsertFirmSetting(
    firmId,
    ONBOARDING_DEMO_SEEDED_AT_KEY,
    new Date().toISOString(),
  );

  return { clientId: client.id, matterId: matter.id, alreadySeeded: false };
}
