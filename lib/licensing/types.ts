/** SaaS licence editions and feature flags (P4-04 / P4-05). */

export type LicenceEdition = "trial" | "solo" | "firm";
export type LicenceStatus = "active" | "expired" | "revoked";

/** Commercial feature keys for canUse(). */
export type LicenceFeatureKey =
  | "trust"
  | "reports"
  | "billing"
  | "calendar"
  | "ai"
  | "ai_byo"
  | "ai_proxy"
  | "export";

export const LICENCE_EDITIONS: LicenceEdition[] = ["trial", "solo", "firm"];

export const LICENCE_FEATURE_KEYS: LicenceFeatureKey[] = [
  "trust",
  "reports",
  "billing",
  "calendar",
  "ai",
  "ai_byo",
  "ai_proxy",
  "export",
];

export const DEFAULT_SEATS: Record<LicenceEdition, number> = {
  trial: 10,
  solo: 2,
  firm: 15,
};

/** Trial matter cap (total matters). Solo/Firm unlimited (null). */
export const DEFAULT_MAX_MATTERS: Record<LicenceEdition, number | null> = {
  trial: 25,
  solo: null,
  firm: null,
};

/** Default trial length for new firms / backfill. */
export const DEFAULT_TRIAL_DAYS = 30;

export type LicenceFeatures = Partial<Record<LicenceFeatureKey, boolean>> & {
  [key: string]: unknown;
};

export type EditionLimits = {
  seats: number;
  maxMatters: number | null;
  features: Record<LicenceFeatureKey, boolean>;
};

export const EDITION_MATRIX: Record<LicenceEdition, EditionLimits> = {
  trial: {
    seats: DEFAULT_SEATS.trial,
    maxMatters: DEFAULT_MAX_MATTERS.trial,
    features: {
      trust: true,
      reports: true,
      billing: true,
      calendar: true,
      ai: true,
      ai_byo: true,
      ai_proxy: false,
      export: true,
    },
  },
  solo: {
    seats: DEFAULT_SEATS.solo,
    maxMatters: DEFAULT_MAX_MATTERS.solo,
    features: {
      trust: true,
      reports: true,
      billing: true,
      calendar: true,
      ai: true,
      ai_byo: true,
      ai_proxy: false,
      export: true,
    },
  },
  firm: {
    seats: DEFAULT_SEATS.firm,
    maxMatters: DEFAULT_MAX_MATTERS.firm,
    features: {
      trust: true,
      reports: true,
      billing: true,
      calendar: true,
      ai: true,
      ai_byo: true,
      ai_proxy: true,
      export: true,
    },
  },
};

export function defaultFeaturesForEdition(edition: LicenceEdition): LicenceFeatures {
  return { ...EDITION_MATRIX[edition].features };
}

/**
 * Merge stored features_json over edition defaults.
 * Export is always true (never hostage data).
 * While commercial enforcement is deferred, all edition features are treated as on.
 */
export function resolveFeatures(
  edition: LicenceEdition,
  _stored: LicenceFeatures | null | undefined,
): Record<LicenceFeatureKey, boolean> {
  const base = { ...EDITION_MATRIX[edition].features };
  for (const key of LICENCE_FEATURE_KEYS) {
    base[key] = true;
  }
  return base;
}

export function isLicenceEdition(raw: string): raw is LicenceEdition {
  return LICENCE_EDITIONS.includes(raw as LicenceEdition);
}

export function isLicenceFeatureKey(raw: string): raw is LicenceFeatureKey {
  return (LICENCE_FEATURE_KEYS as string[]).includes(raw);
}
