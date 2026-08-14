/** Default firm service catalogue (Phase 7 §4.1). */
export type ServiceSeedRow = {
  code: string;
  name: string;
  description?: string;
  defaultPriceCents: number;
  revenueGlCode: string;
  sortOrder: number;
};

export const DEFAULT_FIRM_SERVICES: ServiceSeedRow[] = [
  {
    code: "REV-ADV",
    name: "Advance Payments",
    description: "Retainer / advance (trust until earned)",
    defaultPriceCents: 0,
    revenueGlCode: "4040",
    sortOrder: 10,
  },
  {
    code: "REV-CONV",
    name: "Conveyancing Fees",
    description: "Property and conveyancing work",
    defaultPriceCents: 0,
    revenueGlCode: "4010",
    sortOrder: 20,
  },
  {
    code: "REV-ADMIN",
    name: "Administration Fees",
    description: "General administration and filing",
    defaultPriceCents: 0,
    revenueGlCode: "4020",
    sortOrder: 30,
  },
  {
    code: "REV-CONS",
    name: "Consultation Fees",
    description: "Legal consultation and advice",
    defaultPriceCents: 0,
    revenueGlCode: "4030",
    sortOrder: 40,
  },
];
