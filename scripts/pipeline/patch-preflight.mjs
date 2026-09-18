import fs from "node:fs";

const path = "scripts/pipeline/verify.ts";
let s = fs.readFileSync(path, "utf8");

if (!s.includes('from "./preflight"')) {
  s = s.replace(
    'import { fetchHttp, fetchPlaywright, looksJavascriptThin } from "./fetch-evidence";',
    'import { fetchHttp, fetchPlaywright, looksJavascriptThin } from "./fetch-evidence";\nimport { classifyPreflight } from "./preflight";'
  );
}

// Add preflight immediately after evidence collection / no-evidence branch,
// before manual override and before cache/LLM.
const anchor = `
    if (!evidence) {
      queued++;
      console.log("  -> QUEUED (no usable evidence)");
      await updateItem(item, DiscoveryStatus.QUEUED, "No usable HTTP/Playwright evidence.");
      if (APPLY) await ensureRediscovery(item, "NO_USABLE_EVIDENCE");
      continue;
    }
`;

if (!s.includes("const preflight = classifyPreflight(evidence);")) {
  const insert = anchor + `
    const preflight = classifyPreflight(evidence);

    if (!preflight.usableForLlm) {
      queued++;
      console.log(
        \`  -> QUEUED preflight=\${preflight.kind} reason=\${preflight.reasonCodes.join(",")}\`,
      );

      await updateItem(
        item,
        DiscoveryStatus.QUEUED,
        \`Preflight blocked semantic verification: \${preflight.note}\`,
      );

      if (APPLY) {
        await ensureRediscovery(
          item,
          \`PREFLIGHT_\${preflight.kind}:\${preflight.reasonCodes.join(",")}\`,
        );
      }

      continue;
    }
`;
  s = s.replace(anchor, insert);
}

fs.writeFileSync(path, s);
console.log("verify.ts patched: preflight gate now runs before LLM.");
