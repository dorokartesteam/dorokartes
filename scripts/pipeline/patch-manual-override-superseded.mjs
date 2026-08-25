import fs from "node:fs";

const path = "scripts/pipeline/verify.ts";
let s = fs.readFileSync(path, "utf8");

// 1) Skip ALL rediscovery trigger URLs, including RESOLVED ones.
// Once a trigger URL has entered rediscovery history it is a known bad/superseded URL
// and should not re-enter normal verification.
s = s.replace(
`              RediscoveryTaskStatus.PENDING,
              RediscoveryTaskStatus.RUNNING,
              RediscoveryTaskStatus.MANUAL_REVIEW,`,
`              RediscoveryTaskStatus.PENDING,
              RediscoveryTaskStatus.RUNNING,
              RediscoveryTaskStatus.MANUAL_REVIEW,
              RediscoveryTaskStatus.RESOLVED,`
);

// 2) Move unconditional manual overrides BEFORE fetch/preflight.
// If lockUntilContentChanges=false, no page fetch is needed at all.
// This is essential for source-backed manual review of crawler-blocked official pages.

const loopAnchor = `  for (const item of items) {
    console.log(\`=== \${item.merchantName ?? item.sourceName} ===\`);
    console.log(item.sourceUrl);
`;

if (!s.includes("UNCONDITIONAL_MANUAL_LOCK")) {
  if (!s.includes(loopAnchor)) {
    console.error("Could not find item loop anchor.");
    process.exit(1);
  }

  const earlyManual = loopAnchor + `
    const earlyManual = await prisma.manualVerificationOverride.findUnique({
      where: { sourceUrl: item.sourceUrl },
    });

    if (
      earlyManual?.active &&
      earlyManual.lockUntilContentChanges === false
    ) {
      manualHits++;

      const next = earlyManual.forcedStatus;

      if (next === DiscoveryStatus.VERIFIED) verified++;
      else if (next === DiscoveryStatus.REJECTED) rejected++;
      else queued++;

      console.log(
        \`  -> \${next} UNCONDITIONAL_MANUAL_LOCK role=\${earlyManual.forcedPageRole}\`,
      );

      await updateItem(
        item,
        next,
        \`Manual verification override by \${earlyManual.setBy}: \${earlyManual.reason}\`,
        earlyManual.forcedMerchantName,
      );

      continue;
    }
`;

  s = s.replace(loopAnchor, earlyManual);
}

// 3) Avoid duplicate manual lookup if an unconditional override already exists.
// Existing later manual logic remains for hash-bound manual overrides.
fs.writeFileSync(path, s);
console.log("verify.ts patched:");
console.log("- unconditional manual overrides run before fetch/preflight");
console.log("- resolved rediscovery trigger URLs stay permanently skipped");
