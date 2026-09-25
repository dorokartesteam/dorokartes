import "dotenv/config";
import { getSearchConsoleEvidence } from "../lib/admin/search-console";

async function main() {
  const evidence = await getSearchConsoleEvidence();

  console.log("=== DOROKARTES SEARCH CONSOLE TEST ===");
  console.log(JSON.stringify(evidence, null, 2));

  if (!evidence.connected) {
    console.error("");
    console.error("STOP: Search Console is not connected.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("PASS: Search Console API connected.");
  console.log(`Property: ${evidence.siteUrl}`);
  console.log(`Data through: ${evidence.dataThrough}`);
  console.log(`30d clicks: ${evidence.clicks}`);
  console.log(`30d impressions: ${evidence.impressions}`);
  console.log(`30d CTR: ${evidence.ctr}%`);
  console.log(`30d average position: ${evidence.averagePosition}`);
}

main().catch((error) => {
  console.error("STOP:", error);
  process.exitCode = 1;
});
