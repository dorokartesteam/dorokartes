import "dotenv/config";
import { fetchHttp, fetchPlaywright, looksJavascriptThin } from "../core/fetch-evidence";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const url = arg("--url");
const runs = Number(arg("--runs") ?? "3");

if (!url) {
  console.error(
    'Usage: npm run pipeline:diagnose-content -- --url "https://..." --runs 3',
  );
  process.exit(2);
}

async function getEvidence() {
  let evidence = await fetchHttp(url!);
  if (!evidence || looksJavascriptThin(evidence)) {
    evidence = await fetchPlaywright(url!);
  }
  return evidence;
}

async function main() {
  console.log("Repeated-fetch content stability diagnostic");
  console.log(`URL: ${url}`);
  console.log(`Runs: ${runs}`);
  console.log("");

  const hashes: string[] = [];
  for (let i = 1; i <= runs; i++) {
    const e = await getEvidence();
    if (!e) {
      console.log(`#${i} NO EVIDENCE`);
      continue;
    }
    hashes.push(e.contentHash);
    console.log(
      `#${i} hash=${e.contentHash} tier=${e.fetchTier} chars=${e.visibleText.length}`,
    );
  }

  console.log("");
  console.log(`Distinct content hashes: ${new Set(hashes).size}`);

  if (hashes.length > 1 && new Set(hashes).size > 1) {
    console.log(
      "DIAGNOSIS: fetched evidence changes between loads; model runs are not directly comparable.",
    );
  } else {
    console.log("DIAGNOSIS: fetched evidence is stable across these loads.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
