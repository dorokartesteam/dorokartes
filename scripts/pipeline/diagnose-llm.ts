import "dotenv/config";
import {
  fetchHttp,
  fetchPlaywright,
  looksJavascriptThin,
} from "./fetch-evidence";
import {
  classifyWithLlm,
  PROMPT_VERSION,
  VERIFICATION_TEMPERATURE,
  REASONING_EFFORT,
} from "./llm-classifier";
import { VERIFICATION_MODEL } from "./config";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const url = arg("--url");
const merchant = arg("--merchant");
const runs = Number(arg("--runs") ?? "5");

if (!url) {
  console.error(
    'Usage: npm run pipeline:diagnose-llm -- --url "https://..." --merchant "Name" --runs 5',
  );
  process.exit(2);
}

async function main() {
  console.log("Frozen-evidence LLM consistency diagnostic");
  console.log(`URL: ${url}`);
  console.log(`Model: ${VERIFICATION_MODEL}`);
  console.log(`Prompt version: ${PROMPT_VERSION}`);
  console.log(`Temperature: ${VERIFICATION_TEMPERATURE === null ? "unsupported/not sent" : VERIFICATION_TEMPERATURE}`);
  console.log(`Reasoning effort: ${REASONING_EFFORT}`);
  console.log(`Runs: ${runs}`);
  console.log("");

  // Fetch ONCE. All LLM calls below see the exact same EvidencePackage.
  let evidence = await fetchHttp(url!);

  if (!evidence || looksJavascriptThin(evidence)) {
    evidence = await fetchPlaywright(url!);
  }

  if (!evidence) {
    throw new Error("Could not obtain usable evidence.");
  }

  console.log(`Frozen content hash: ${evidence.contentHash}`);
  console.log(`Fetch tier: ${evidence.fetchTier}`);
  console.log(`Visible chars: ${evidence.visibleText.length}`);
  console.log("");

  const signatures: string[] = [];

  for (let i = 1; i <= runs; i++) {
    const { classification, usage } =
      await classifyWithLlm(
        merchant,
        new URL(url!).origin,
        evidence,
      );

    const decision =
      classification.isGiftCardProgram &&
      ["CANONICAL_PURCHASE", "CHECKOUT"].includes(classification.pageRole)
        ? "POSITIVE"
        : !classification.isGiftCardProgram
          ? "NEGATIVE"
          : "AMBIGUOUS";

    const signature =
      `${decision}|${classification.pageRole}|${classification.giftCardType}`;

    signatures.push(signature);

    console.log(
      `#${i} ${decision} ` +
      `role=${classification.pageRole} ` +
      `confidence=${classification.confidence.toFixed(2)} ` +
      `type=${classification.giftCardType} ` +
      `tokens=${usage.totalTokens ?? "-"}`,
    );
    console.log(
      `   reasons=${classification.reasonCodes.join(", ")}`,
    );
    console.log(
      `   evidence=${classification.evidence.join(" | ")}`,
    );
  }

  const distinct = new Set(signatures);

  console.log("");
  console.log(`Distinct decision signatures: ${distinct.size}`);

  if (distinct.size === 1) {
    console.log(
      "DIAGNOSIS: decision signature is stable on frozen evidence.",
    );
  } else {
    console.log(
      "DIAGNOSIS: model/prompt is decision-unstable even on identical evidence.",
    );
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
