import fs from "node:fs";

const file = "scripts/pipeline/admin/resolve-kouponia365.ts";

if (!fs.existsSync(file)) {
  throw new Error(`Missing ${file}. Install paid resolver v1 first.`);
}

let text = fs.readFileSync(file, "utf8");
let changed = false;

const oldTools = 'tools: [{ type: "web_search" }],';
const newTools = 'tools: [{ type: "web_search", search_context_size: "low" } as any],';

if (text.includes(oldTools)) {
  text = text.replace(oldTools, newTools);
  changed = true;
}

const oldInput = "input: prompt,\n  } as any);";
const newInput = 'input: prompt,\n    max_output_tokens: 500,\n  } as any);';

if (text.includes(oldInput)) {
  text = text.replace(oldInput, newInput);
  changed = true;
}

if (!changed) {
  console.log("No patch applied: expected paid-resolver patterns were not found.");
  console.log("The file may already be patched or may differ from v1.");
  process.exit(0);
}

fs.writeFileSync(file, text, "utf8");
console.log("Patched Kouponia365 paid resolver:");
console.log("- web_search context: low");
console.log("- max_output_tokens: 500");
console.log("- existing checkpoint/state behavior preserved");
