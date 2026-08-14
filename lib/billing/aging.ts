/** AR ageing bucket codes (from due date). */
export const AR_AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

export type ArAgingBucket = (typeof AR_AGING_BUCKETS)[number];

/** Days between two dates (floor). */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

/** Days past due (positive). Null if not past due or no due date. */
export function daysPastDue(dueDate: string | null, now = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const ms = now.getTime() - due.getTime();
  if (ms <= 0) return null;
  return Math.floor(ms / 86400000);
}

/** Ageing bucket from due date (reports + debtors desk). */
export function agingBucketFromDueDate(
  dueDate: Date | null,
  now = new Date(),
): ArAgingBucket {
  if (!dueDate || dueDate.getTime() >= now.getTime()) return "current";
  const days = daysBetween(dueDate, now);
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function agingBucketFromDueDateString(
  dueDate: string | null,
  now = new Date(),
): ArAgingBucket {
  if (!dueDate) return "current";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "current";
  return agingBucketFromDueDate(due, now);
}

/** Human label for bucket chip / table. */
export function agingBucketDisplay(bucket: ArAgingBucket | string): string {
  switch (bucket) {
    case "current":
      return "Current";
    case "1-30":
      return "1–30 days";
    case "31-60":
      return "31–60 days";
    case "61-90":
      return "61–90 days";
    case "90+":
      return "90+ days";
    default:
      return bucket;
  }
}

/** Short ageing hint for invoicing list rows. */
export function ageingBucketLabel(dueDate: string | null, now = new Date()): string | null {
  const bucket = agingBucketFromDueDateString(dueDate, now);
  if (bucket === "current") return null;
  return agingBucketDisplay(bucket);
}
