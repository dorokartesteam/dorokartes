import "dotenv/config";
import {
  fetchHttp,
  fetchPlaywright,
  looksJavascriptThin,
} from "../core/fetch-evidence";
import { classifyPreflight } from "../core/preflight";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const url = arg("--url");

if (!url) {
  console.error(
    'Usage: npm run pipeline:preflight -- --url "https://..."',
  );
  process.exit(2);
}

async function main() {
  let evidence = await fetchHttp(url!);

  if (!evidence || looksJavascriptThin(evidence)) {
    evidence = await fetchPlaywright(url!);
  }

  const result = classifyPreflight(evidence);

  console.log(`URL: ${url}`);
  console.log(`Preflight: ${result.kind}`);
  console.log(`Usable for LLM: ${result.usableForLlm}`);
  console.log(`Reason codes: ${result.reasonCodes.join(",") || "-"}`);
  console.log(`Note: ${result.note}`);

  if (evidence) {
    console.log(`HTTP status: ${evidence.httpStatus ?? "-"}`);
    console.log(`Fetch tier: ${evidence.fetchTier}`);
    console.log(`Content hash: ${evidence.contentHash}`);
    console.log(`Visible chars: ${evidence.visibleText.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
