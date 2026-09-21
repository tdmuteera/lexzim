import assert from "node:assert/strict";
import { calculateStampDutyDollars } from "../lib/proforma/stamp-duty";

assert.equal(calculateStampDutyDollars(4000), 40);
assert.equal(calculateStampDutyDollars(5000), 50);
assert.equal(calculateStampDutyDollars(10000), 150);
assert.equal(calculateStampDutyDollars(50000), 1250);
assert.equal(calculateStampDutyDollars(100000), 2750);
assert.equal(calculateStampDutyDollars(120000), 3550);
console.log("stamp-duty smoke ok");
