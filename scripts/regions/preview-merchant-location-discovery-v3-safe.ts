import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const limit = Number(process.argv[2] || 150);

  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v3-dry-run.json",
  );

  const report = JSON.parse(await fs.readFile(p, "utf8"));

  const safe: any[] = [];

  for (const r of report.results || []) {
    for (const c of r.candidates || []) {
      if (c.decision === "SAFE_CANDIDATE") {
        safe.push(c);
      }
    }
  }

  safe.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  console.log(`=== DISCOVERY v3 SAFE CANDIDATES — TOP ${limit} ===`);

  for (const c of safe.slice(0, limit)) {
    console.log(`\n### ${c.merchant}`);
    console.log(
      `${c.sourceType} | confidence=${c.confidence} | ${c.city || "-"} | ${c.addressLine}`,
    );
    console.log(c.sourceUrl);

    if (c.reasons?.length) {
      console.log(`reasons: ${c.reasons.join("; ")}`);
    }
  }

  console.log("\nREAD ONLY.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
