import fs from "node:fs";

const file = "scripts/pipeline/admin/resolve-universe.ts";
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

let s = fs.readFileSync(file, "utf8");
fs.copyFileSync(file, `${file}.backup-before-v2`);

let changes = 0;

// Ensure low-context web search.
s = s.replace(
  /tools:\s*\[\{\s*type:\s*"web_search"(?:,\s*search_context_size:\s*"low")?\s*\}(?:\s+as any)?\],/,
  'tools: [{ type: "web_search", search_context_size: "low" } as any],'
);
changes++;

// Ensure output cap.
if (!/max_output_tokens:\s*500/.test(s)) {
  s = s.replace(
    /input:\s*prompt,\s*\n\s*\}\s*as any\);/,
    'input: prompt,\n    max_output_tokens: 500,\n  } as any);'
  );
  changes++;
}

// Expand foreign-locale detection: /es/es, /en/gb, /de/de etc.
s = s.replace(
  /if\s*\(\s*\/\\\/\(it-it\|fr-fr\|de-de\|es-es\|nl-nl\|pt-pt\|en-au\|fr-be\|de-at\)\(\\\/\|\$\)\/\.test\(u\.pathname\.toLowerCase\(\)\)\s*\)\s*\{\s*return "FOREIGN_ONLY" as const;\s*\}/m,
  `if (
    /\\/(it-it|fr-fr|de-de|es-es|nl-nl|pt-pt|en-au|fr-be|de-at|en-us|en-ca)(\\/|$)/.test(u.pathname.toLowerCase()) ||
    /\\/(it\\/it|fr\\/fr|de\\/de|es\\/es|nl\\/nl|pt\\/pt|en\\/au|fr\\/be|de\\/at|en\\/us|en\\/ca|en\\/gb)(\\/|$)/.test(u.pathname.toLowerCase())
  ) {
    return "FOREIGN_ONLY" as const;
  }`
);
changes++;

// Add usage fields to resolveWithWebSearch return type if absent.
if (!/inputTokens:\s*number \| null/.test(s)) {
  s = s.replace(
    /reason:\s*string;\s*\n\}> \{/,
    `reason: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}> {`
  );
  changes++;
}

// Add usage parsing to return block if absent.
if (!/const usage:\s*any = response\.usage/.test(s)) {
  s = s.replace(
    /const parsed = extractJson\(response\.output_text \|\| "\{\}"\);\s*\n\s*const confidence = Math\.max\(0, Math\.min\(1, Number\(parsed\.confidence \?\? 0\)\)\);/,
    `const parsed = extractJson(response.output_text || "{}");
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
  const usage: any = response.usage ?? {};`
  );

  s = s.replace(
    /reason:\s*String\(parsed\.reason \?\? ""\)\.slice\(0,\s*500\),\s*\n\s*\};/,
    `reason: String(parsed.reason ?? "").slice(0, 500),
    inputTokens: usage.input_tokens ?? usage.inputTokens ?? null,
    outputTokens: usage.output_tokens ?? usage.outputTokens ?? null,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? null,
  };`
  );
  changes++;
}

// Add counters if absent.
if (!/let apiCalls = 0;/.test(s)) {
  s = s.replace(
    /let errors = 0;/,
    `let errors = 0;
  let apiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;`
  );
  changes++;
}

// Count calls/usage.
if (!/apiCalls\+\+;\s*\n\s*const search = await resolveWithWebSearch/.test(s)) {
  s = s.replace(
    /const search = await resolveWithWebSearch\(client, row\);/,
    `apiCalls++;
      const search = await resolveWithWebSearch(client, row);
      inputTokens += search.inputTokens ?? 0;
      outputTokens += search.outputTokens ?? 0;
      totalTokens += search.totalTokens ?? 0;`
  );
  changes++;
}

// Add summary lines.
if (!/OpenAI web-search calls:/.test(s)) {
  s = s.replace(
    /console\.log\(`ERROR: \$\{errors\}`\);/,
    `console.log(\`ERROR: \${errors}\`);
  console.log(\`OpenAI web-search calls: \${apiCalls}\`);
  console.log(\`Input tokens: \${inputTokens || "-"}\`);
  console.log(\`Output tokens: \${outputTokens || "-"}\`);
  console.log(\`Total tokens: \${totalTokens || "-"}\`);`
  );
  changes++;
}

fs.writeFileSync(file, s, "utf8");
console.log(`Universe resolver v2 patch applied. Changes: ${changes}`);
console.log("Backup:", `${file}.backup-before-v2`);
console.log("Important: Pedro del Hierro /es/es will now be FOREIGN_ONLY, not GR.");
