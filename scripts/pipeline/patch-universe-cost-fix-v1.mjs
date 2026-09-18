import fs from "node:fs";

const file = "scripts/pipeline/admin/resolve-universe.ts";

if (!fs.existsSync(file)) {
  throw new Error(`Missing ${file}`);
}

let text = fs.readFileSync(file, "utf8");
let changes = 0;

// 1) Lower search context
if (text.includes('tools: [{ type: "web_search" }],')) {
  text = text.replace(
    'tools: [{ type: "web_search" }],',
    'tools: [{ type: "web_search", search_context_size: "low" } as any],'
  );
  changes++;
}

// 2) Cap model output
if (text.includes('input: prompt,\n  } as any);')) {
  text = text.replace(
    'input: prompt,\n  } as any);',
    'input: prompt,\n    max_output_tokens: 500,\n  } as any);'
  );
  changes++;
}

// 3) Add usage fields to resolveWithWebSearch return type
const oldReturnType = `  reason: string;
}> {`;

const newReturnType = `  reason: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}> {`;

if (text.includes(oldReturnType)) {
  text = text.replace(oldReturnType, newReturnType);
  changes++;
}

// 4) Parse usage and return it
const oldParsedBlock = `  const parsed = extractJson(response.output_text || "{}");
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));

  return {
    officialUrl: normalizeUrl(parsed.officialUrl),
    confidence,
    market: ["GR", "EU_WITH_GR", "GLOBAL", "FOREIGN_ONLY", "UNKNOWN"].includes(parsed.market)
      ? parsed.market
      : "UNKNOWN",
    reason: String(parsed.reason ?? "").slice(0, 500),
  };`;

const newParsedBlock = `  const parsed = extractJson(response.output_text || "{}");
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
  const usage: any = response.usage ?? {};

  return {
    officialUrl: normalizeUrl(parsed.officialUrl),
    confidence,
    market: ["GR", "EU_WITH_GR", "GLOBAL", "FOREIGN_ONLY", "UNKNOWN"].includes(parsed.market)
      ? parsed.market
      : "UNKNOWN",
    reason: String(parsed.reason ?? "").slice(0, 500),
    inputTokens: usage.input_tokens ?? usage.inputTokens ?? null,
    outputTokens: usage.output_tokens ?? usage.outputTokens ?? null,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? null,
  };`;

if (text.includes(oldParsedBlock)) {
  text = text.replace(oldParsedBlock, newParsedBlock);
  changes++;
}

// 5) Add counters
const oldCounters = `  let resolvedCount = 0;
  let marketReview = 0;
  let ambiguous = 0;
  let unavailable = 0;
  let errors = 0;`;

const newCounters = `  let resolvedCount = 0;
  let marketReview = 0;
  let ambiguous = 0;
  let unavailable = 0;
  let errors = 0;
  let apiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;`;

if (text.includes(oldCounters)) {
  text = text.replace(oldCounters, newCounters);
  changes++;
}

// 6) Count each call + usage
const oldSearchCall = `      const search = await resolveWithWebSearch(client, row);`;

const newSearchCall = `      apiCalls++;
      const search = await resolveWithWebSearch(client, row);
      inputTokens += search.inputTokens ?? 0;
      outputTokens += search.outputTokens ?? 0;
      totalTokens += search.totalTokens ?? 0;`;

if (text.includes(oldSearchCall)) {
  text = text.replace(oldSearchCall, newSearchCall);
  changes++;
}

// 7) Add token info to unavailable/ambiguous line
const oldLine1 = '        console.log(`[${item.status}] ${row.merchant_name} -> ${item.officialUrl ?? "NONE"} conf=${item.confidence.toFixed(2)}`);';
const newLine1 = '        console.log(`[${item.status}] ${row.merchant_name} -> ${item.officialUrl ?? "NONE"} conf=${item.confidence.toFixed(2)} tokens=${search.totalTokens ?? "-"}`);';

if (text.includes(oldLine1)) {
  text = text.replace(oldLine1, newLine1);
  changes++;
}

// 8) Add token info to resolved/market-review line
const oldLine2 = `        \`[${status}] ${row.merchant_name} -> ${item.finalUrl ?? "NONE"} \` +
        \`market=${item.market} conf=${item.confidence.toFixed(2)} http=${item.validationStatus ?? "-"}\``;

const newLine2 = `        \`[${status}] ${row.merchant_name} -> ${item.finalUrl ?? "NONE"} \` +
        \`market=${item.market} conf=${item.confidence.toFixed(2)} http=${item.validationStatus ?? "-"} tokens=${search.totalTokens ?? "-"}\``;

if (text.includes(oldLine2)) {
  text = text.replace(oldLine2, newLine2);
  changes++;
}

// 9) Add cost summary
const oldSummary = `  console.log(\`ERROR: ${errors}\`);
  console.log(\`Total scan-ready rows after rebuild: ${scanReady.length}\`);
  console.log(\`State: ${STATE_PATH}\`);`;

const newSummary = `  console.log(\`ERROR: ${errors}\`);
  console.log(\`OpenAI web-search calls: ${apiCalls}\`);
  console.log(\`Input tokens: ${inputTokens || "-"}\`);
  console.log(\`Output tokens: ${outputTokens || "-"}\`);
  console.log(\`Total tokens: ${totalTokens || "-"}\`);
  console.log(\`Total scan-ready rows after rebuild: ${scanReady.length}\`);
  console.log(\`State: ${STATE_PATH}\`);`;

if (text.includes(oldSummary)) {
  text = text.replace(oldSummary, newSummary);
  changes++;
}

if (changes === 0) {
  console.log("No changes applied. File may already be patched or differs from expected resolver version.");
  process.exit(0);
}

fs.copyFileSync(file, `${file}.backup-before-cost-fix`);
fs.writeFileSync(file, text, "utf8");

console.log(`Patched ${file}`);
console.log(`Changes applied: ${changes}`);
console.log("- web_search context: low");
console.log("- max_output_tokens: 500");
console.log("- token/API usage summary enabled");
console.log("- backup created: resolve-universe.ts.backup-before-cost-fix");
