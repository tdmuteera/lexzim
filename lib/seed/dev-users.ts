/**
 * Dev-only demo user definitions (P0-11).
 * Password is documented in docs/DEV_SEEDS.md — never use in production.
 */
export const DEV_SEED_PASSWORD = "<set-in-env>";

export type DevSeedUserDef = {
  roleCode: "senior_associate" | "junior_associate" | "secretary" | "accounts";
  email: string;
  fullName: string;
};

/** Staff roles seeded into the primary pilot firm (Managing Partner skipped if one exists). */
export const PILOT_FIRM_DEV_USERS: DevSeedUserDef[] = [
  {
    roleCode: "senior_associate",
    email: "senior@lexzim.local",
    fullName: "Sarah Senior Associate",
  },
  {
    roleCode: "junior_associate",
    email: "junior@lexzim.local",
    fullName: "John Junior Associate",
  },
  {
    roleCode: "secretary",
    email: "secretary@lexzim.local",
    fullName: "Mary Secretary",
  },
  {
    roleCode: "accounts",
    email: "accounts@lexzim.local",
    fullName: "Peter Accounts",
  },
];

export const ISOLATION_FIRM = {
  name: "Isolation Test Firm",
  slug: "isolation-test-firm",
  mpEmail: "isolation@lexzim.local",
  mpName: "Isolation Managing Partner",
};
