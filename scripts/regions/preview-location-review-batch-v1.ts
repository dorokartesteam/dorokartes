import fs from "node:fs/promises";
import path from "node:path";

const LIMIT = Math.max(1, Math.min(100, Number(process.argv[2] || "50")));

async function main() {
  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-review-queue-v1.json",
  );

  const report = JSON.parse(await fs.readFile(p, "utf8")) as {
    queue: Array<{
      merchant: string;
      websiteUrl: string | null;
      bestScore: number;
      candidates: Array<{
        sourceType: string | null;
        city: string | null;
        addressLine: string | null;
        sourceUrl: string | null;
        reasons?: string[];
        reviewScore: number;
      }>;
    }>;
  };

  console.log(`=== LOCATION REVIEW BATCH — TOP ${LIMIT} ===`);

  for (const q of report.queue.slice(0, LIMIT)) {
    console.log("");
    console.log(`### ${q.merchant}`);
    console.log(`Website: ${q.websiteUrl || "-"}`);
    console.log(`Best score: ${q.bestScore}`);

    q.candidates.forEach((c, i) => {
      console.log(`  [${i + 1}] ${c.sourceType} | ${c.city || "-"} | score=${c.reviewScore}`);
      console.log(`      ${c.addressLine || "-"}`);
      console.log(`      ${c.sourceUrl || "-"}`);
      if (c.reasons?.length) console.log(`      reasons: ${c.reasons.join(" | ")}`);
    });
  }

  console.log("");
  console.log("READ ONLY — database unchanged.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
