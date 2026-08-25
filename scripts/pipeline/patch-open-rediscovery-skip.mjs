
import fs from "node:fs";

const path = "scripts/pipeline/verify.ts";
let s = fs.readFileSync(path, "utf8");

// Add explicit recheck flag.
if (!s.includes('const RECHECK_OPEN_REDISCOVERY')) {
  s = s.replace(
    'const USE_LLM = process.env.VERIFICATION_USE_LLM !== "false";',
    'const USE_LLM = process.env.VERIFICATION_USE_LLM !== "false";\nconst RECHECK_OPEN_REDISCOVERY = process.argv.includes("--recheck-open");'
  );
}

// Replace the initial discoveryItem query with a broader fetch + open-task suppression.
// We intentionally do NOT keep re-verifying the same failing trigger URL while a
// rediscovery task is already open. That is both cheaper and semantically correct.
const oldStart = `  const items = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: {
        in: [DiscoveryStatus.DISCOVERED, DiscoveryStatus.QUEUED],
      },
      NOT: { sourceName: "Official Website Verifier" },
    },
    orderBy: { discoveredAt: "asc" },
    take: LIMIT,
  });`;

const oldStartCompact = `  const items = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: { in: [DiscoveryStatus.DISCOVERED, DiscoveryStatus.QUEUED] },
      NOT: { sourceName: "Official Website Verifier" }
    },
    orderBy: { discoveredAt: "asc" },
    take: LIMIT
  });`;

const replacement = `  const rawItems = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: {
        in: [DiscoveryStatus.DISCOVERED, DiscoveryStatus.QUEUED],
      },
      NOT: { sourceName: "Official Website Verifier" },
    },
    orderBy: { discoveredAt: "asc" },
    take: Math.max(LIMIT * 4, LIMIT),
  });

  const openTasks = RECHECK_OPEN_REDISCOVERY
    ? []
    : await prisma.domainRediscoveryTask.findMany({
        where: {
          status: {
            in: [
              RediscoveryTaskStatus.PENDING,
              RediscoveryTaskStatus.RUNNING,
              RediscoveryTaskStatus.MANUAL_REVIEW,
            ],
          },
        },
        select: {
          merchantDomain: true,
          triggerUrl: true,
        },
      });

  const openTaskKeys = new Set(
    openTasks.map(
      (t) => \`\${t.merchantDomain.toLowerCase()}|\${t.triggerUrl}\`,
    ),
  );

  const skippedOpen: typeof rawItems = [];

  const items = rawItems
    .filter((item) => {
      if (RECHECK_OPEN_REDISCOVERY) return true;

      const key =
        \`\${domainOf(item.sourceUrl).toLowerCase()}|\${item.sourceUrl}\`;

      if (openTaskKeys.has(key)) {
        skippedOpen.push(item);
        return false;
      }

      return true;
    })
    .slice(0, LIMIT);`;

if (s.includes(oldStart)) {
  s = s.replace(oldStart, replacement);
} else if (s.includes(oldStartCompact)) {
  s = s.replace(oldStartCompact, replacement);
} else if (!s.includes("const rawItems = await prisma.discoveryItem.findMany")) {
  console.error("Could not find discoveryItem query block. No changes made.");
  process.exit(1);
}

// Add startup reporting.
if (!s.includes("Open rediscovery URLs skipped:")) {
  s = s.replace(
    'console.log(`Batch size: ${items.length}`);',
    'console.log(`Batch size: ${items.length}`);\n  console.log(`Open rediscovery URLs skipped: ${skippedOpen.length}`);\n  console.log(`Recheck open rediscovery: ${RECHECK_OPEN_REDISCOVERY}`);'
  );
}

fs.writeFileSync(path, s);
console.log("verify.ts patched: open rediscovery trigger URLs are skipped by default.");
