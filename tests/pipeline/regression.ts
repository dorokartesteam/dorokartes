import assert from "node:assert/strict";
import { isInvalidMerchantName, isReservedSourceLabel } from "../../scripts/pipeline/config";

for (const value of [
  "Official Website Scanner",
  "Official Website Verifier",
  "Official Websites",
  "Gift Card",
  "Scanner",
]) {
  assert.equal(
    isInvalidMerchantName(value) || isReservedSourceLabel(value),
    true,
    `${value} must be rejected`,
  );
}

for (const value of ["Prenatal","SKY express","attica","AEGEAN","The Body Shop"]) {
  assert.equal(isInvalidMerchantName(value), false, `${value} should be valid`);
}

console.log("Pipeline regression tests: PASS");
