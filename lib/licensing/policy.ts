import "server-only";

/**
 * Commercial licence / seat gates are deferred.
 * Enforcement is intentionally disabled until the product owner wires billing.
 * Keep helpers and Settings display; do not block create/use paths.
 */
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { matters, users } from "@/lib/db/schema";
import {
  isLicenceFeatureKey,
  type LicenceFeatureKey,
} from "@/lib/licensing/types";
import { getEffectiveLicence, type EffectiveLicence } from "@/lib/repos/licences";

/** Soft unlimited until commercial licensing is re-enabled. */
const UNLIMITED_SEATS = 10_000;

export async function countActiveFirmUsers(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(users)
    .where(
      and(
        eq(users.firmId, firmId),
        eq(users.isActive, true),
        eq(users.isSystemUser, true),
      ),
    );
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
  _licence: EffectiveLicence,
  _feature: LicenceFeatureKey,
): boolean {
  return true;
}

export async function canUse(
  _firmId: string,
  feature: LicenceFeatureKey | string,
): Promise<boolean> {
  if (!isLicenceFeatureKey(feature)) return true;
  return true;
}

export async function assertCanUse(
  firmId: string,
  _feature: LicenceFeatureKey,
): Promise<EffectiveLicence> {
  return getEffectiveLicence(firmId);
}

/**
 * Formerly blocked new matters on expired licences / trial caps.
 * Disabled until commercial licensing is wired.
 */
export async function assertCanCreateMatter(_firmId: string): Promise<void> {
  return;
}

/** Formerly enforced seat limits. Disabled until commercial licensing is wired. */
export async function assertSeatAvailable(
  firmId: string,
  _opts?: { extraSeats?: number },
): Promise<{ seats: number; used: number; remaining: number }> {
  const used = await countActiveFirmUsers(firmId);
  return {
    seats: UNLIMITED_SEATS,
    used,
    remaining: Math.max(0, UNLIMITED_SEATS - used),
  };
}

export async function getLicenceUsage(firmId: string) {
  const licence = await getEffectiveLicence(firmId);
  const [seatsUsed, mattersUsed] = await Promise.all([
    countActiveFirmUsers(firmId),
    countFirmMatters(firmId),
  ]);
  return {
    seats: UNLIMITED_SEATS,
    seatsUsed,
    seatsRemaining: Math.max(0, UNLIMITED_SEATS - seatsUsed),
    mattersUsed,
    maxMatters: null as number | null,
    features: licence.features,
    edition: licence.edition,
    aiProxyEligible: true,
  };
}
