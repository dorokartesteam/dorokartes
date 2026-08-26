import fs from "node:fs";

const verifyPath = "scripts/pipeline/commands/verify.ts";
const configPath = "scripts/pipeline/core/config.ts";

let verify = fs.readFileSync(verifyPath, "utf8");
let config = fs.readFileSync(configPath, "utf8");

if (!config.includes("VERIFY_NONCANONICAL_THRESHOLD")) {
  config = config.replace(
    "export const VERIFY_NEGATIVE_THRESHOLD = 0.92;",
    `export const VERIFY_NEGATIVE_THRESHOLD = 0.92;
export const VERIFY_NONCANONICAL_THRESHOLD = 0.97;`
  );
}

verify = verify.replace(
`  VERIFICATION_MODEL, VERIFY_POSITIVE_THRESHOLD, VERIFY_NEGATIVE_THRESHOLD
} from "../core/config";`,
`  VERIFICATION_MODEL,
  VERIFY_POSITIVE_THRESHOLD,
  VERIFY_NEGATIVE_THRESHOLD,
  VERIFY_NONCANONICAL_THRESHOLD
} from "../core/config";`
);

if (!verify.includes("function isHighConfidenceNonCanonical")) {
  const anchor = `function domainOf(url: string) {
  const u = new URL(url);
  return getDomain(u.hostname, { allowPrivateDomains: true }) ?? u.hostname.replace(/^www\\./,"");
}
`;

  const helper = anchor + `
function isHighConfidenceNonCanonical(
  pageRole: VerificationPageRole | string | null | undefined,
  confidence: number | null | undefined,
) {
  return (
    ["TERMS", "CONTENT", "GIFT_GUIDE", "PROMOTION"].includes(String(pageRole)) &&
    (confidence ?? 0) >= VERIFY_NONCANONICAL_THRESHOLD
  );
}

async function hasVerifiedSiblingOnDomain(item: any) {
  const domain = domainOf(item.sourceUrl);

  const siblings = await prisma.discoveryItem.findMany({
    where: {
      id: { not: item.id },
      status: DiscoveryStatus.VERIFIED,
      sourceType: SourceType.OFFICIAL,
    },
    select: { sourceUrl: true },
  });

  return siblings.some((s) => {
    try {
      return domainOf(s.sourceUrl) === domain;
    } catch {
      return false;
    }
  });
}
`;

  if (!verify.includes(anchor)) {
    throw new Error("Could not find domainOf() anchor in verify.ts");
  }
  verify = verify.replace(anchor, helper);
}

// Upgrade exact-cache behavior: prior AMBIGUOUS TERMS/CONTENT/GIFT_GUIDE/PROMOTION
// decisions become REJECTED URL decisions without another LLM call.
const oldCache = `    if (cached) {
      cacheHits++;
      let next = DiscoveryStatus.QUEUED;
      if (cached.result === VerificationAttemptResult.PASSED) { next=DiscoveryStatus.VERIFIED; verified++; }
      else if (cached.result === VerificationAttemptResult.FAILED) { next=DiscoveryStatus.REJECTED; rejected++; }
      else queued++;
      console.log(\`  -> \${next} CACHE_HIT role=\${cached.pageRole} confidence=\${cached.confidence ?? "-"}\`);
      await updateItem(item, next, \`Cached LLM decision \${cached.id}; content unchanged.\`);
      if (APPLY && next !== DiscoveryStatus.VERIFIED) await ensureRediscovery(item, \`CACHED_\${cached.pageRole}\`);
      continue;
    }`;

const newCache = `    if (cached) {
      cacheHits++;

      const cachedNonCanonical = isHighConfidenceNonCanonical(
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
      }

      console.log(
        \`  -> \${next} CACHE_HIT role=\${cached.pageRole} confidence=\${cached.confidence ?? "-"}\` +
        (cachedNonCanonical ? " reason=HIGH_CONFIDENCE_NON_CANONICAL" : ""),
      );

      await updateItem(
        item,
        next,
        cachedNonCanonical
          ? \`Cached semantic role \${cached.pageRole} at confidence \${cached.confidence}; rejected URL as non-canonical.\`
          : \`Cached LLM decision \${cached.id}; content unchanged.\`,
      );

      if (APPLY && next !== DiscoveryStatus.VERIFIED) {
        const siblingVerified = await hasVerifiedSiblingOnDomain(item);

        if (!siblingVerified) {
          await ensureRediscovery(
            item,
            cachedNonCanonical
              ? \`NON_CANONICAL_\${cached.pageRole}\`
              : \`CACHED_\${cached.pageRole}\`,
          );
        } else {
          console.log("  -> rediscovery skipped: verified sibling exists on domain");
        }
      }

      continue;
    }`;

if (verify.includes(oldCache)) {
  verify = verify.replace(oldCache, newCache);
} else if (!verify.includes("HIGH_CONFIDENCE_NON_CANONICAL")) {
  throw new Error("Could not patch cache branch in verify.ts");
}

// Add semantic auto-reject after classification.
const oldDecision = `      const negative =
        !classification.isGiftCardProgram &&
        classification.confidence >= VERIFY_NEGATIVE_THRESHOLD;

      let next = DiscoveryStatus.QUEUED;`;

const newDecision = `      const negative =
        !classification.isGiftCardProgram &&
        classification.confidence >= VERIFY_NEGATIVE_THRESHOLD;

      const highConfidenceNonCanonical = isHighConfidenceNonCanonical(
        classification.pageRole,
        classification.confidence,
      );

      let next = DiscoveryStatus.QUEUED;`;

if (verify.includes(oldDecision)) {
  verify = verify.replace(oldDecision, newDecision);
} else if (!verify.includes("const highConfidenceNonCanonical")) {
  throw new Error("Could not patch classification decision setup");
}

const oldBranch = `      } else if (negative) { next=DiscoveryStatus.REJECTED; result=VerificationAttemptResult.FAILED; rejected++; }
      else queued++;

      console.log(\`  -> \${next} role=\${classification.pageRole} confidence=\${classification.confidence.toFixed(2)} type=\${classification.giftCardType}\`);`;

const newBranch = `      } else if (negative || highConfidenceNonCanonical) {
        next = DiscoveryStatus.REJECTED;
        result = VerificationAttemptResult.FAILED;
        rejected++;
      } else {
        queued++;
      }

      console.log(
        \`  -> \${next} role=\${classification.pageRole} confidence=\${classification.confidence.toFixed(2)} type=\${classification.giftCardType}\` +
        (highConfidenceNonCanonical ? " reason=HIGH_CONFIDENCE_NON_CANONICAL" : ""),
      );`;

if (verify.includes(oldBranch)) {
  verify = verify.replace(oldBranch, newBranch);
} else if (!verify.includes('reason=HIGH_CONFIDENCE_NON_CANONICAL')) {
  throw new Error("Could not patch classification decision branch");
}

// Avoid unnecessary rediscovery when another verified official candidate already
// exists on the same domain.
const oldRediscovery = `      if (APPLY && next !== DiscoveryStatus.VERIFIED) {
        await ensureRediscovery(item, \`\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`);
      }`;

const newRediscovery = `      if (APPLY && next !== DiscoveryStatus.VERIFIED) {
        const siblingVerified = await hasVerifiedSiblingOnDomain(item);

        if (!siblingVerified) {
          await ensureRediscovery(
            item,
            highConfidenceNonCanonical
              ? \`NON_CANONICAL_\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`
              : \`\${classification.pageRole}:\${classification.reasonCodes.join(",")}\`,
          );
        } else {
          console.log("  -> rediscovery skipped: verified sibling exists on domain");
        }
      }`;

if (verify.includes(oldRediscovery)) {
  verify = verify.replace(oldRediscovery, newRediscovery);
}

fs.writeFileSync(configPath, config);
fs.writeFileSync(verifyPath, verify);

console.log("Auto-reject non-canonical verifier patch installed.");
console.log("Threshold: 0.97");
console.log("Roles: TERMS, CONTENT, GIFT_GUIDE, PROMOTION");
console.log("Verified sibling on same domain suppresses rediscovery.");
