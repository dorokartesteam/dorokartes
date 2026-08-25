import fs from "node:fs";

const path = "scripts/pipeline/verify.ts";
let s = fs.readFileSync(path, "utf8");

s = s.replace(
  'import { classifyWithLlm, PROMPT_VERSION, VERIFICATION_TEMPERATURE } from "./llm-classifier";',
  'import { classifyWithLlm, PROMPT_VERSION, VERIFICATION_TEMPERATURE, REASONING_EFFORT } from "./llm-classifier";'
);

// If the previous diagnostics package added a temperature cache predicate,
// remove it because Luna does not support temperature.
s = s.replace(
  /\s*temperature:\s*VERIFICATION_TEMPERATURE,\r?\n/g,
  "\n"
);

// Ensure promptVersion/model remain part of cache identity.
if (!s.includes("promptVersion: PROMPT_VERSION")) {
  s = s.replace(
    "contentHash: evidence.contentHash,",
    "contentHash: evidence.contentHash,\n        modelName: VERIFICATION_MODEL,\n        promptVersion: PROMPT_VERSION,"
  );
}

// Store null temperature + prompt version in new LLM attempts.
s = s.replace(
  /modelName:\s*VERIFICATION_MODEL,\s*\r?\n\s*contentHash:\s*evidence\.contentHash,/,
  'modelName: VERIFICATION_MODEL,\n            promptVersion: PROMPT_VERSION,\n            contentHash: evidence.contentHash,\n            temperature: null,'
);

fs.writeFileSync(path, s);
console.log("verify.ts patched for Luna: no temperature parameter/cache predicate.");
