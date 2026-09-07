/**
 * Smoke: commission formula for collected fees above monthly target.
 * Run: npx tsx scripts/check-commission-formula.ts
 */
import { computeCommissionMetrics } from "../lib/finance/commission-formula";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const example = computeCommissionMetrics({
  collectedCents: 400_000,
  monthlyTargetCents: 300_000,
  commissionPercentAboveTarget: 25,
});
assert(example.remainingToTargetCents === 0, "remaining should be 0");
assert(example.aboveTargetCents === 100_000, "above should be 1000");
assert(example.commissionDueCents === 25_000, "commission due should be 250");

const under = computeCommissionMetrics({
  collectedCents: 200_000,
  monthlyTargetCents: 300_000,
  commissionPercentAboveTarget: 25,
});
assert(under.remainingToTargetCents === 100_000, "remaining should be 1000");
assert(under.aboveTargetCents === 0, "above should be 0");
assert(under.commissionDueCents === 0, "commission due should be 0");

const exact = computeCommissionMetrics({
  collectedCents: 300_000,
  monthlyTargetCents: 300_000,
  commissionPercentAboveTarget: 25,
});
assert(exact.commissionDueCents === 0, "exact target → no commission");

console.log("check-commission-formula: ok");
