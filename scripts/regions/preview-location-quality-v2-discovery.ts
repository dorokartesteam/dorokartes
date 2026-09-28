import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v2-discovery.json",
  );

  const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
    rows: Array<{
      merchant: string;
      city: string | null;
      addressLine: string | null;
      sourceUrl: string | null;
      sourceType: string | null;
      reviewDecision: "SAFE" | "REVIEW" | "REJECT";
    }>;
  };

  const safe = report.rows.filter(r => r.reviewDecision === "SAFE");

  console.log("=== DISCOVERY v2 SAFE PREVIEW ===");
  console.log(`Final SAFE rows: ${safe.length}`);
  console.log("");

  for (const row of safe) {
    console.log(
      `${row.merchant} — ${row.city} — ${row.addressLine} — ${row.sourceType} — ${row.sourceUrl}`,
    );
  }

  console.log("");
  console.log("READ ONLY — database unchanged.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
