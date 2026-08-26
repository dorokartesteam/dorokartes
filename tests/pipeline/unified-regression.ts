import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  isInvalidMerchantName,
  isReservedSourceLabel,
} from "../../scripts/pipeline/core/config";

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

for (const value of [
  "Prenatal",
  "SKY express",
  "attica",
  "AEGEAN",
  "The Body Shop",
  "Germanos",
  "Sephora",
  "HomeMarkt",
  "Hondos Center",
]) {
  assert.equal(
    isInvalidMerchantName(value),
    false,
    `${value} should be a valid merchant name`,
  );
}

const expectedCommands = [
  "discover",
  "verify",
  "rediscover",
  "canonicalize",
  "promote",
  "reverify",
  "review",
  "validate",
];

for (const name of expectedCommands) {
  assert.equal(
    existsSync(`scripts/pipeline/commands/${name}.ts`),
    true,
    `Missing stable command: ${name}`,
  );
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const name of expectedCommands) {
  assert.ok(pkg.scripts[`pipeline:${name}`], `Missing npm script pipeline:${name}`);
}

const forbiddenActive = [
  "discovery:canonicalize-v2",
  "discovery:canonicalize-v2.1",
  "core-fix",
  "catalog-fix-prenatal",
  "mass-discovery-v2.1",
  "pipeline:search-import",
  "pipeline:source-backed-review",
];

for (const key of forbiddenActive) {
  assert.equal(
    pkg.scripts[key],
    undefined,
    `Legacy operational script must be inactive: ${key}`,
  );
}

console.log("Unified pipeline regression tests: PASS");
