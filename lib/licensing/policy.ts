import "server-only";

import { and, count, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { matters, users } from "@/lib/db/schema";
import {
  DEFAULT_MAX_MATTERS,
  isLicenceFeatureKey,
  type LicenceFeatureKey,
} from "@/lib/licensing/types";
import { getEffectiveLicence, type EffectiveLicence } from "@/lib/repos/licences";

export async function countActiveFirmUsers(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.isActive, true)));
  return Number(rows[0]?.n ?? 0);
}

export async function countFirmMatters(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(matters)
    .where(eq(matters.firmId, firmId));
  return Number(rows[0]?.n ?? 0);
}

export function canUseFeature(
  licence: EffectiveLicence,
  feature: LicenceFeatureKey,
): boolean {
  if (feature === "export") return true;
  return Boolean(licence.features[feature]);
}

export async function canUse(
  firmId: string,
  feature: LicenceFeatureKey | string,
): Promise<boolean> {
  if (!isLicenceFeatureKey(feature)) return false;
  if (feature === "export") return true;
  const licence = await getEffectiveLicence(firmId);
  return canUseFeature(licence, feature);
}

export async function assertCanUse(
  firmId: string,
  feature: LicenceFeatureKey,
): Promise<EffectiveLicence> {
  const licence = await getEffectiveLicence(firmId);
  if (feature === "export") return licence;
  if (!canUseFeature(licence, feature)) {
    throw new AuthError(
      "feature_disabled",
      `This firm’s ${licence.edition} edition does not include “${feature}”. Upgrade the licence or contact LexZim ops.`,
    );
  }
  return licence;
}

/**
 * Soft commercial gate: expired/revoked licences cannot open new matters
 * (including intake conversion). Also enforces trial matter caps.
 * Export is never blocked here.
 */
export async function assertCanCreateMatter(firmId: string): Promise<void> {
  const licence = await getEffectiveLicence(firmId);
  if (licence.blocksNewMatters) {
    throw new AuthError(
      "licence_expired",
      licence.reason ??
        "Firm licence is not active. New matters are blocked. Export remains available from Settings → Backup & Export.",
    );
  }

  const maxMatters =
    licence.maxMatters ??
    DEFAULT_MAX_MATTERS[licence.edition] ??
    null;
  if (maxMatters !== null) {
    const used = await countFirmMatters(firmId);
    if (used >= maxMatters) {
      throw new AuthError(
        "matter_limit",
        `Trial matter cap reached (${used}/${maxMatters}). Upgrade edition or contact LexZim ops. Export remains available.`,
      );
    }
  }
}

/** Enforce seat limits before creating or reactivating a user. */
export async function assertSeatAvailable(
  firmId: string,
  opts?: { extraSeats?: number },
): Promise<{ seats: number; used: number; remaining: number }> {
  const licence = await getEffectiveLicence(firmId);
  const used = await countActiveFirmUsers(firmId);
  const need = opts?.extraSeats ?? 1;
  const remaining = Math.max(0, licence.seats - used);
  if (used + need > licence.seats) {
    throw new AuthError(
      "seat_limit",
      `Seat limit reached (${used}/${licence.seats} active users on ${licence.edition}). Deactivate a user or upgrade seats.`,
    );
  }
  return { seats: licence.seats, used, remaining };
}

export async function getLicenceUsage(firmId: string) {
  const licence = await getEffectiveLicence(firmId);
  const [seatsUsed, mattersUsed] = await Promise.all([
    countActiveFirmUsers(firmId),
    countFirmMatters(firmId),
  ]);
  const maxMatters =
    licence.maxMatters ?? DEFAULT_MAX_MATTERS[licence.edition] ?? null;
  return {
    seats: licence.seats,
    seatsUsed,
    seatsRemaining: Math.max(0, licence.seats - seatsUsed),
    mattersUsed,
    maxMatters,
    features: licence.features,
    edition: licence.edition,
    aiProxyEligible: Boolean(licence.features.ai_proxy),
  };
}
