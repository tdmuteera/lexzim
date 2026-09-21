/**
 * Zimbabwe stamp duty on registration of acquisition of immovable property
 * (Finance Act Cap 23:04, Schedule to Chapter II, Item 6 — foreign currency bands).
 *
 * Progressive / “so much of the value” method:
 *   0–5,000:        US$1 per US$100 (1%)
 *   next to 20,000: US$2 per US$100 (2%)
 *   next to 100,000: US$3 per US$100 (3%)
 *   above 100,000:  US$4 per US$100 (4%)
 *
 * Prefill only; staff may edit the amount on the Pro Forma.
 */

function dutyOnSliceDollars(amountDollars: number, dollarsPerHundred: number): number {
  if (amountDollars <= 0) return 0;
  const hundreds = Math.ceil(amountDollars / 100 - 1e-9);
  return hundreds * dollarsPerHundred;
}

/** Stamp duty in whole US dollars (rounded to cents via caller). */
export function calculateStampDutyDollars(propertyValueDollars: number): number {
  if (!Number.isFinite(propertyValueDollars) || propertyValueDollars <= 0) return 0;

  const v = propertyValueDollars;
  const band1 = Math.min(v, 5_000);
  const band2 = Math.min(Math.max(v - 5_000, 0), 15_000);
  const band3 = Math.min(Math.max(v - 20_000, 0), 80_000);
  const band4 = Math.max(v - 100_000, 0);

  return (
    dutyOnSliceDollars(band1, 1) +
    dutyOnSliceDollars(band2, 2) +
    dutyOnSliceDollars(band3, 3) +
    dutyOnSliceDollars(band4, 4)
  );
}

export function stampDutyBandLabel(propertyValueDollars: number): string {
  if (!Number.isFinite(propertyValueDollars) || propertyValueDollars <= 0) {
    return "Enter property value";
  }
  if (propertyValueDollars <= 5_000) return "Band: up to US$5,000 (1%)";
  if (propertyValueDollars <= 20_000) return "Band: above US$5,000 to US$20,000 (2% on excess)";
  if (propertyValueDollars <= 100_000) {
    return "Band: above US$20,000 to US$100,000 (3% on excess)";
  }
  return "Band: above US$100,000 (4% on excess)";
}
