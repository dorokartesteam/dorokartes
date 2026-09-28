import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v6-high-confidence.json",
  );

  const report = JSON.parse(await fs.readFile(p, "utf8")) as {
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

  console.log("=== V6 HIGH-CONFIDENCE SAFE PREVIEW ===");
  console.log(`Final SAFE rows: ${safe.length}`);

  for (const r of safe) {
    console.log(`${r.merchant} — ${r.city} — ${r.addressLine} — ${r.sourceType} — ${r.sourceUrl}`);
  }

  console.log("");
  console.log("READ ONLY — database unchanged.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
