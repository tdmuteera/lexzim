/**
 * P11-08 smoke: trust shortfall policy (enough / short+allow / short+block).
 * Run: npx tsx scripts/check-trust-shortfall-policy.ts
 */
import assert from "node:assert/strict";
import { evaluateTrustShortfall } from "../lib/finance/trust-shortfall-evaluate";

const enough = evaluateTrustShortfall({
  amountCents: 25_000,
  trustBalanceCents: 50_000,
  blockIfShort: false,
});
assert.equal(enough.isShort, false);
assert.equal(enough.preferTrust, true);
assert.equal(enough.allowFirmFloat, true);
assert.equal(enough.shortfallCents, 0);

const shortAllow = evaluateTrustShortfall({
  amountCents: 50_000,
  trustBalanceCents: 20_000,
  blockIfShort: false,
});
assert.equal(shortAllow.isShort, true);
assert.equal(shortAllow.shortfallCents, 30_000);
assert.equal(shortAllow.allowFirmFloat, true);
assert.equal(shortAllow.preferTrust, false);
assert.match(shortAllow.message, /firm float/i);

const shortBlock = evaluateTrustShortfall({
  amountCents: 50_000,
  trustBalanceCents: 20_000,
  blockIfShort: true,
});
assert.equal(shortBlock.isShort, true);
assert.equal(shortBlock.allowFirmFloat, false);
assert.match(shortBlock.message, /blocks/i);

console.log("trust shortfall policy checks passed");
