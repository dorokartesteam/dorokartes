import fs from "node:fs";

const path = "scripts/pipeline/verify.ts";
let s = fs.readFileSync(path, "utf8");
const original = s;

let changes = 0;

// 1) Import guardrail helpers.
if (!s.includes('from "./verification-guardrails"')) {
  const importAnchor = 'import { classifyPreflight } from "./preflight";';

  if (!s.includes(importAnchor)) {
    console.error("Could not find preflight import.");
    process.exit(1);
  }

  s = s.replace(
    importAnchor,
    `${importAnchor}
import {
  logHashComparison,
  recordFetchObservation,
  guardProductionRoleChange,
} from "./verification-guardrails";`
  );

  changes++;
}

// 2) Add hash logging before manual/cache/LLM processing.
// Use the manual-override lookup as the stable insertion point.
if (!s.includes("await logHashComparison(")) {
  const manualRegex =
    /(\n\s*const manual\s*=\s*await prisma\.manualVerificationOverride\.findUnique\(\{)/m;

  if (!manualRegex.test(s)) {
    console.error("Could not find manual verification override lookup.");
    process.exit(1);
  }

  const block = `
    await logHashComparison(
      prisma,
      item.id,
      evidence.contentHash ?? null,
    );

    if (APPLY) {
      await recordFetchObservation(prisma, {
        discoveryItemId: item.id,
        preflightKind: preflight.kind,
        contentHash: evidence.contentHash ?? null,
        httpStatus: evidence.httpStatus ?? null,
        fetchTier: evidence.fetchTier ?? null,
      });
    }
`;

  s = s.replace(manualRegex, `${block}$1`);
  changes++;
}

// 3) Guard the positive decision.
// Match both compact and multiline versions.
if (!s.includes("REVIEW_REQUIRED role changed")) {
  const positiveRegex =
    /if\s*\(\s*positive\s*\)\s*\{\s*next\s*=\s*DiscoveryStatus\.VERIFIED\s*;\s*(?:result|attemptResult)\s*=\s*VerificationAttemptResult\.PASSED\s*;\s*verified\+\+\s*;\s*\}\s*else\s+if\s*\(\s*negative\s*\)\s*\{/m;

  const match = s.match(positiveRegex);

  if (!match) {
    console.error("Could not find positive-decision block.");
    console.error("No changes written to verify.ts.");
    process.exit(1);
  }

  const usesAttemptResult = match[0].includes("attemptResult");
  const resultVar = usesAttemptResult ? "attemptResult" : "result";

  const guarded = `if (positive) {
        const roleGuard = await guardProductionRoleChange(prisma, {
          officialUrl: item.sourceUrl,
          newRole: classification.pageRole as VerificationPageRole,
        });

        if (roleGuard.blocked) {
          next = DiscoveryStatus.QUEUED;
          ${resultVar} = VerificationAttemptResult.AMBIGUOUS;
          queued++;

          console.log(
            \`  -> REVIEW_REQUIRED role changed \${roleGuard.previousRole} -> \${classification.pageRole}\`,
          );
        } else {
          next = DiscoveryStatus.VERIFIED;
          ${resultVar} = VerificationAttemptResult.PASSED;
          verified++;
        }
      } else if (negative) {`;

  s = s.replace(positiveRegex, guarded);
  changes++;
}

if (s === original) {
  console.log("verify.ts already contains the guardrails. No changes needed.");
  process.exit(0);
}

// Safety: only write after every required patch succeeded.
fs.writeFileSync(path, s);
console.log(`verify.ts patched successfully. Changes applied: ${changes}`);
console.log("Added: content-hash logging + fetch observation + production role-change guard.");
