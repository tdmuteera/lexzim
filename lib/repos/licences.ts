/**
 * Firm licence repository (P4-04). One row per firm.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { firmLicences, firms } from "@/lib/db/schema";
import {
  DEFAULT_MAX_MATTERS,
  DEFAULT_SEATS,
  DEFAULT_TRIAL_DAYS,
  defaultFeaturesForEdition,
  isLicenceEdition,
  resolveFeatures,
  type LicenceEdition,
  type LicenceFeatureKey,
  type LicenceFeatures,
  type LicenceStatus,
} from "@/lib/licensing/types";

export type FirmLicenceRow = typeof firmLicences.$inferSelect;

export type EffectiveLicence = {
  firmId: string;
  edition: LicenceEdition;
  seats: number;
  /** Resolved feature flags (edition defaults + overrides; export always true). */
  features: Record<LicenceFeatureKey, boolean>;
  maxMatters: number | null;
  status: LicenceStatus;
  /** Stored status before expiry overlay. */
  storedStatus: LicenceStatus;
  issuedAt: Date;
  expiresAt: Date | null;
  notes: string | null;
  issuedBy: string | null;
  /** True when status is active and not past expiresAt. */
  isActive: boolean;
  /** True when expired by date or status (blocks new matters). */
  blocksNewMatters: boolean;
  /** Always true: export must remain available. */
  exportAllowed: boolean;
  reason: string | null;
};

function asEdition(raw: string): LicenceEdition {
  return isLicenceEdition(raw) ? raw : "trial";
}

function asStatus(raw: string): LicenceStatus {
  if (raw === "expired" || raw === "revoked" || raw === "active") return raw;
  return "expired";
}

function asFeatures(raw: unknown): LicenceFeatures {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as LicenceFeatures;
  }
  return {};
}

export function evaluateLicence(row: FirmLicenceRow, now = new Date()): EffectiveLicence {
  const edition = asEdition(row.edition);
  const storedStatus = asStatus(row.status);
  const expiresAt = row.expiresAt;
  const pastExpiry = expiresAt !== null && expiresAt.getTime() < now.getTime();

  let status: LicenceStatus = storedStatus;
  let reason: string | null = null;

  if (storedStatus === "revoked") {
    status = "revoked";
    reason = "Licence was revoked. Export remains available.";
  } else if (storedStatus === "expired" || pastExpiry) {
    status = "expired";
    reason =
      "Licence has expired. New matters are blocked. Export and existing data remain available.";
  }

  const isActive = status === "active";
  const features = resolveFeatures(edition, asFeatures(row.featuresJson));
  return {
    firmId: row.firmId,
    edition,
    seats: row.seats,
    features,
    maxMatters: DEFAULT_MAX_MATTERS[edition],
    status,
    storedStatus,
    issuedAt: row.issuedAt,
    expiresAt,
    notes: row.notes,
    issuedBy: row.issuedBy,
    isActive,
    blocksNewMatters: !isActive,
    exportAllowed: true,
    reason,
  };
}

export async function getFirmLicenceRow(firmId: string): Promise<FirmLicenceRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(firmLicences)
    .where(eq(firmLicences.firmId, firmId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Ensure a trial licence exists (grandfather existing pilots / new firms).
 */
export async function ensureTrialLicence(
  firmId: string,
  opts?: { issuedBy?: string; days?: number; notes?: string },
): Promise<FirmLicenceRow> {
  const existing = await getFirmLicenceRow(firmId);
  if (existing) return existing;

  const days = opts?.days ?? DEFAULT_TRIAL_DAYS;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000);
  const edition: LicenceEdition = "trial";

  const db = getDb();
  const rows = await db
    .insert(firmLicences)
    .values({
      firmId,
      edition,
      seats: DEFAULT_SEATS[edition],
      featuresJson: defaultFeaturesForEdition(edition),
      status: "active",
      issuedAt,
      expiresAt,
      notes: opts?.notes ?? `Auto trial (${days} days)`,
      issuedBy: opts?.issuedBy ?? "system",
      updatedAt: issuedAt,
      createdAt: issuedAt,
    })
    .returning();
  return rows[0]!;
}

export async function getEffectiveLicence(firmId: string): Promise<EffectiveLicence> {
  const row = await ensureTrialLicence(firmId, {
    issuedBy: "system",
    notes: "Auto trial for firm without a licence row",
  });
  return evaluateLicence(row);
}

export type IssueLicenceInput = {
  firmId: string;
  edition: LicenceEdition;
  seats?: number;
  features?: LicenceFeatures;
  status?: LicenceStatus;
  expiresAt?: Date | null;
  days?: number | null;
  notes?: string | null;
  issuedBy?: string | null;
};

/** Issue or replace the firm licence (activate). */
export async function issueFirmLicence(input: IssueLicenceInput): Promise<FirmLicenceRow> {
  const edition = input.edition;
  const issuedAt = new Date();
  let expiresAt: Date | null;
  if (input.expiresAt !== undefined) {
    expiresAt = input.expiresAt;
  } else if (input.days === null) {
    expiresAt = null;
  } else if (typeof input.days === "number") {
    expiresAt = new Date(issuedAt.getTime() + input.days * 24 * 60 * 60 * 1000);
  } else if (edition === "trial") {
    expiresAt = new Date(issuedAt.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  } else {
    // Paid editions default to 365 days unless ops sets null via expiresAt/days
    expiresAt = new Date(issuedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
  }

  const seats = input.seats ?? DEFAULT_SEATS[edition];
  const features = input.features ?? defaultFeaturesForEdition(edition);
  const status: LicenceStatus = input.status ?? "active";

  const db = getDb();
  const existing = await getFirmLicenceRow(input.firmId);
  if (!existing) {
    const rows = await db
      .insert(firmLicences)
      .values({
        firmId: input.firmId,
        edition,
        seats,
        featuresJson: features,
        status,
        issuedAt,
        expiresAt,
        notes: input.notes ?? null,
        issuedBy: input.issuedBy ?? "platform",
        updatedAt: issuedAt,
        createdAt: issuedAt,
      })
      .returning();
    return rows[0]!;
  }

  const rows = await db
    .update(firmLicences)
    .set({
      edition,
      seats,
      featuresJson: features,
      status,
      issuedAt,
      expiresAt,
      notes: input.notes ?? existing.notes,
      issuedBy: input.issuedBy ?? existing.issuedBy,
      updatedAt: issuedAt,
    })
    .where(eq(firmLicences.firmId, input.firmId))
    .returning();
  return rows[0]!;
}

export async function revokeFirmLicence(
  firmId: string,
  opts?: { notes?: string; issuedBy?: string },
): Promise<FirmLicenceRow | null> {
  const existing = await getFirmLicenceRow(firmId);
  if (!existing) return null;
  const db = getDb();
  const now = new Date();
  const rows = await db
    .update(firmLicences)
    .set({
      status: "revoked",
      notes: opts?.notes ?? existing.notes,
      issuedBy: opts?.issuedBy ?? existing.issuedBy,
      updatedAt: now,
    })
    .where(eq(firmLicences.firmId, firmId))
    .returning();
  return rows[0] ?? null;
}

export async function findFirmIdBySlug(slug: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: firms.id })
    .from(firms)
    .where(eq(firms.slug, slug.trim().toLowerCase()))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function backfillTrialLicencesForAllFirms(): Promise<number> {
  const db = getDb();
  const all = await db.select({ id: firms.id }).from(firms);
  let created = 0;
  for (const firm of all) {
    const before = await getFirmLicenceRow(firm.id);
    if (!before) {
      await ensureTrialLicence(firm.id, {
        issuedBy: "cli",
        notes: "Backfill trial licence",
      });
      created += 1;
    }
  }
  return created;
}

export function serializeEffectiveLicence(lic: EffectiveLicence) {
  return {
    firmId: lic.firmId,
    edition: lic.edition,
    seats: lic.seats,
    maxMatters: lic.maxMatters,
    features: lic.features,
    status: lic.status,
    storedStatus: lic.storedStatus,
    issuedAt: lic.issuedAt.toISOString(),
    expiresAt: lic.expiresAt?.toISOString() ?? null,
    notes: lic.notes,
    issuedBy: lic.issuedBy,
    isActive: lic.isActive,
    blocksNewMatters: lic.blocksNewMatters,
    exportAllowed: lic.exportAllowed,
    reason: lic.reason,
  };
}
