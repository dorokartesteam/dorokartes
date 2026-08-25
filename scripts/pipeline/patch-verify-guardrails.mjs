import fs from "node:fs";

const path = "scripts/pipeline/verify.ts";
let s = fs.readFileSync(path, "utf8");

if (!s.includes('from "./verification-guardrails"')) {
  s = s.replace(
    'import { classifyPreflight } from "./preflight";',
    `import { classifyPreflight } from "./preflight";
import {
  logHashComparison,
  recordFetchObservation,
  guardProductionRoleChange,
} from "./verification-guardrails";`
  );
}

// Add hash logging once evidence is usable, before manual/cache/LLM.
if (!s.includes("await logHashComparison(")) {
  const anchor = `
    const manual = await prisma.manualVerificationOverride.findUnique({`;
  const insert = `
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
  if (!s.includes(anchor)) {
    console.error("Could not find manual override anchor.");
    process.exit(1);
  }
  s = s.replace(anchor, insert + anchor);
}

// Guard positive role changes for already-production-verified URLs.
if (!s.includes("Production role change requires review")) {
  const old = `
      if (positive) {
        next = DiscoveryStatus.VERIFIED;
        result = VerificationAttemptResult.PASSED;
        verified++;
      } else if (negative) {`;

  const oldAlt = `
      if (positive) {
        next = DiscoveryStatus.VERIFIED;
        attemptResult = VerificationAttemptResult.PASSED;
        verified++;
      } else if (negative) {`;

  const replacementForResult = `
      if (positive) {
        const roleGuard = await guardProductionRoleChange(prisma, {
          officialUrl: item.sourceUrl,
          newRole: classification.pageRole as VerificationPageRole,
        });

        if (roleGuard.blocked) {
          next = DiscoveryStatus.QUEUED;
          result = VerificationAttemptResult.AMBIGUOUS;
          queued++;
          console.log(
            \`  -> REVIEW_REQUIRED role changed \${roleGuard.previousRole} -> \${classification.pageRole}\`,
          );
        } else {
          next = DiscoveryStatus.VERIFIED;
          result = VerificationAttemptResult.PASSED;
          verified++;
        }
      } else if (negative) {`;

  const replacementForAttempt = replacementForResult.replace(/\bresult\b/g, "attemptResult");

  if (s.includes(old)) {
    s = s.replace(old, replacementForResult);
  } else if (s.includes(oldAlt)) {
    s = s.replace(oldAlt, replacementForAttempt);
  } else {
    console.error("Could not find positive-decision block.");
    process.exit(1);
  }

  s += `\n// Production role change requires review.\n`;
}

fs.writeFileSync(path, s);
console.log("verify.ts patched with hash logging + production role-change guard.");
