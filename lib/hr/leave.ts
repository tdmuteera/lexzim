/** Default leave type codes seeded per firm (P6-13). */
export const DEFAULT_LEAVE_TYPES = [
  { code: "annual", name: "Annual leave", isPaid: true },
  { code: "sick", name: "Sick leave", isPaid: true },
  { code: "unpaid", name: "Unpaid leave", isPaid: false },
  { code: "other", name: "Other", isPaid: true },
] as const;

export const LEAVE_REQUEST_STATUSES = ["requested", "approved", "rejected", "cancelled"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

/** Inclusive calendar days between two dates (UTC midnight based). */
export function leaveDaysInclusive(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days < 1) {
    throw new Error("Leave end date must be on or after start date.");
  }
  return days;
}

export function yearBoundsUtc(year: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}
