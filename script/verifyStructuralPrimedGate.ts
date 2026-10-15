import assert from "node:assert/strict";
import { qualifiesForStructuralPrimed } from "../server/scanner";

assert.equal(qualifiesForStructuralPrimed(["PRE_RANGE_COMPRESSION"]), true);
assert.equal(qualifiesForStructuralPrimed(["PRE_HIGH_CLOSE_LOCATION"]), true);
assert.equal(qualifiesForStructuralPrimed(["TV_DIRECTION_MATCH", "TV_ADX_SUPPORT"]), false);
assert.equal(qualifiesForStructuralPrimed([]), false);

console.log("Structural PRIMED gate verified.");
