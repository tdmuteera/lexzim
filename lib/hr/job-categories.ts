/**
 * HR job categories (Phase 10). Distinct from RBAC role codes.
 */

export const HR_JOB_CATEGORIES = [
  "Managing Partner",
  "Partner",
  "Senior Associate",
  "Junior Associate",
  "Attorney",
  "custom",
] as const;

export type HrJobCategory = (typeof HR_JOB_CATEGORIES)[number];

const LAWYER_CATEGORIES = new Set<string>([
  "Managing Partner",
  "Partner",
  "Senior Associate",
  "Junior Associate",
  "Attorney",
]);

export function isHrJobCategory(value: string): value is HrJobCategory {
  return (HR_JOB_CATEGORIES as readonly string[]).includes(value);
}

/** Categories that imply lawyer eligibility unless manually cleared. */
export function jobCategoryImpliesLawyer(category: string | null | undefined): boolean {
  if (!category) return false;
  return LAWYER_CATEGORIES.has(category);
}

export function jobCategoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  if (category === "custom") return "Custom title";
  return category;
}
