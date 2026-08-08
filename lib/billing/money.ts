/** Money helpers: integer cents + currency code (Phase 3). */

export function dollarsToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }
  return null;
}

export function centsToDisplay(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null) return "n/a";
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Billable amount for a time entry: minutes × hourly rate. */
export function timeEntryAmountCents(
  minutes: number,
  rateCents: number | null | undefined,
): number | null {
  if (rateCents == null || !Number.isFinite(rateCents)) return null;
  return Math.round((minutes / 60) * rateCents);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
