import fs from "node:fs";

const path = "scripts/pipeline/commands/verify.ts";
let s = fs.readFileSync(path, "utf8");

const oldHelper = `function isHighConfidenceNonCanonical(
  pageRole: VerificationPageRole | string | null | undefined,
  confidence: number | null | undefined,
) {
  return (
    ["TERMS", "CONTENT", "GIFT_GUIDE", "PROMOTION"].includes(String(pageRole)) &&
    (confidence ?? 0) >= VERIFY_NONCANONICAL_THRESHOLD
  );
}`;

const newHelper = `function hasStrongGiftCardProgramEvidence(input: {
  isGiftCardProgram?: boolean | null;
  reasonCodes?: unknown;
}) {
  if (input.isGiftCardProgram === true) return true;

  const codes = Array.isArray(input.reasonCodes)
    ? input.reasonCodes.map((x) => String(x).toUpperCase())
    : [];

  return codes.some((code) =>
    [
      "DIRECT_GIFT_CARD_PROGRAM",
      "MERCHANT_GIFT_CARD_PROGRAM_EVIDENCE",
      "MERCHANT_PROGRAM_CONFIRMED",
      "PHYSICAL_CARD_EVIDENCE",
      "PHYSICAL_PURCHASE_ONLY",
      "IN_STORE_PURCHASE_ONLY",
      "PURCHASE_LINK_PRESENT",
      "GIFT_CARD_PROGRAM_EVIDENCE",
    ].some((signal) => code.includes(signal))
  );
}

function isNonCanonicalRole(
  pageRole: VerificationPageRole | string | null | undefined,
) {
  return ["TERMS", "CONTENT", "GIFT_GUIDE", "PROMOTION"].includes(
    String(pageRole),
  );
}

function isHighConfidenceNonCanonical(
  pageRole: VerificationPageRole | string | null | undefined,
  confidence: number | null | undefined,
  hasProgramEvidence = false,
) {
  return (
    isNonCanonicalRole(pageRole) &&
    (confidence ?? 0) >= VERIFY_NONCANONICAL_THRESHOLD &&
    !hasProgramEvidence
  );
}

function isHighConfidenceProgramInfo(
  pageRole: VerificationPageRole | string | null | undefined,
  confidence: number | null | undefined,
  hasProgramEvidence = false,
) {
  return (
    isNonCanonicalRole(pageRole) &&
    (confidence ?? 0) >= VERIFY_NONCANONICAL_THRESHOLD &&
    hasProgramEvidence
  );
}`;

if (s.includes(oldHelper)) {
  s = s.replace(oldHelper, newHelper);
} else if (!s.includes("function hasStrongGiftCardProgramEvidence")) {
  throw new Error("Could not find previous non-canonical helper block.");
}

const oldCachedDecision = `      const cachedNonCanonical = isHighConfidenceNonCanonical(
        cached.pageRole,
        cached.confidence,
      );

      let next = DiscoveryStatus.QUEUED;

      if (cached.result === VerificationAttemptResult.PASSED) {
        next = DiscoveryStatus.VERIFIED;
        verified++;
      } else if (
        cached.result === VerificationAttemptResult.FAILED ||
        cachedNonCanonical
      ) {
        next = DiscoveryStatus.REJECTED;
        rejected++;
      } else {
        queued++;
      }`;

const newCachedDecision = `      const cachedProgramEvidence = hasStrongGiftCardProgramEvidence({
        reasonCodes: cached.reasonCodes,
        isGiftCardProgram:
          typeof (cached.evidence as any)?.isGiftCardProgram === "boolean"
            ? (cached.evidence as any).isGiftCardProgram
            : undefined,
      });

      const cachedNonCanonical = isHighConfidenceNonCanonical(
        cached.pageRole,
        cached.confidence,
        cachedProgramEvidence,
      );

      const cachedProgramInfo = isHighConfidenceProgramInfo(
        cached.pageRole,
        cached.confidence,
        cachedProgramEvidence,
      );

      const cachedSiblingVerified = cachedProgramInfo
        ? await hasVerifiedSiblingOnDomain(item)
        : false;

      let next = DiscoveryStatus.QUEUED;

      if (cached.result === VerificationAttemptResult.PASSED) {
        next = DiscoveryStatus.VERIFIED;
        verified++;
      } else if (
        cachedNonCanonical ||
        (cachedProgramInfo && cachedSiblingVerified) ||
        (
          cached.result === VerificationAttemptResult.FAILED &&
          !cachedProgramInfo
        )
      ) {
        next = DiscoveryStatus.REJECTED;
        rejected++;
      } else {
        queued++;
      }`;

if (s.includes(oldCachedDecision)) {
  s = s.replace(oldCachedDecision, newCachedDecision);
} else if (!s.includes("const cachedProgramEvidence")) {
  throw new Error("Could not patch cached decision block.");
}

const oldCachedLog = `        (cachedNonCanonical ? " reason=HIGH_CONFIDENCE_NON_CANONICAL" : ""),
      );`;

const newCachedLog = `        (
          cachedNonCanonical
            ? " reason=HIGH_CONFIDENCE_NON_CANONICAL"
            : cachedProgramInfo && cachedSiblingVerified
              ? " reason=NON_CANONICAL_WITH_VERIFIED_SIBLING"
              : cachedProgramInfo
                ? " reason=PROGRAM_INFO_NEEDS_CANONICAL"
                : ""
        ),
      );`;

if (s.includes(oldCachedLog)) {
  s = s.replace(oldCachedLog, newCachedLog);
}

const oldFresh = `      const highConfidenceNonCanonical = isHighConfidenceNonCanonical(
        classification.pageRole,
        classification.confidence,
      );

      let next = DiscoveryStatus.QUEUED;`;

const newFresh = `      const programEvidence = hasStrongGiftCardProgramEvidence({
        isGiftCardProgram: classification.isGiftCardProgram,
        reasonCodes: classification.reasonCodes,
      });

      const highConfidenceNonCanonical = isHighConfidenceNonCanonical(
        classification.pageRole,
        classification.confidence,
        programEvidence,
      );

      const highConfidenceProgramInfo = isHighConfidenceProgramInfo(
        classification.pageRole,
        classification.confidence,
        programEvidence,
      );

      const programInfoSiblingVerified = highConfidenceProgramInfo
        ? await hasVerifiedSiblingOnDomain(item)
        : false;

      let next = DiscoveryStatus.QUEUED;`;

if (s.includes(oldFresh)) {
  s = s.replace(oldFresh, newFresh);
} else if (!s.includes("const programEvidence = hasStrongGiftCardProgramEvidence")) {
  throw new Error("Could not patch fresh semantic decision setup.");
}

const oldFreshBranch = `      } else if (negative || highConfidenceNonCanonical) {
        next = DiscoveryStatus.REJECTED;
        result = VerificationAttemptResult.FAILED;
        rejected++;
      } else {
        queued++;
      }`;

const newFreshBranch = `      } else if (
        highConfidenceNonCanonical ||
        (highConfidenceProgramInfo && programInfoSiblingVerified) ||
        (negative && !highConfidenceProgramInfo)
      ) {
        next = DiscoveryStatus.REJECTED;
        result = VerificationAttemptResult.FAILED;
        rejected++;
      } else {
        next = DiscoveryStatus.QUEUED;
        result = VerificationAttemptResult.AMBIGUOUS;
        queued++;
      }`;

if (s.includes(oldFreshBranch)) {
  s = s.replace(oldFreshBranch, newFreshBranch);
} else if (!s.includes("programInfoSiblingVerified")) {
  throw new Error("Could not patch fresh decision branch.");
}

const oldFreshLog = `        (highConfidenceNonCanonical ? " reason=HIGH_CONFIDENCE_NON_CANONICAL" : ""),
      );`;

const newFreshLog = `        (
          highConfidenceNonCanonical
            ? " reason=HIGH_CONFIDENCE_NON_CANONICAL"
            : highConfidenceProgramInfo && programInfoSiblingVerified
              ? " reason=NON_CANONICAL_WITH_VERIFIED_SIBLING"
              : highConfidenceProgramInfo
                ? " reason=PROGRAM_INFO_NEEDS_CANONICAL"
                : ""
        ),
      );`;

if (s.includes(oldFreshLog)) {
  s = s.replace(oldFreshLog, newFreshLog);
}

const oldRediscoveryReason = `            highConfidenceNonCanonical
              ? \`NON_CANONICAL_\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`
              : \`\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`,
          );`;

const newRediscoveryReason = `            highConfidenceProgramInfo
              ? \`PROGRAM_INFO_\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`
              : highConfidenceNonCanonical
                ? \`NON_CANONICAL_\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`
                : \`\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`,
          );`;

if (s.includes(oldRediscoveryReason)) {
  s = s.replace(oldRediscoveryReason, newRediscoveryReason);
}

fs.writeFileSync(path, s);

console.log("Physical/in-store gift-card program semantics installed.");
console.log("- real program evidence on TERMS/CONTENT pages is no longer auto-rejected");
console.log("- verified sibling => non-canonical page can still be rejected");
console.log("- no verified sibling => QUEUED + rediscovery for better canonical URL");
