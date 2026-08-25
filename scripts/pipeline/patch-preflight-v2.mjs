import fs from "node:fs";

const path = "scripts/pipeline/verify.ts";
let s = fs.readFileSync(path, "utf8");

// Replace the existing evidence acquisition block with a retry-aware version.
// We retry ONLY before any LLM call, and only when the first rendered evidence
// looks transient/insufficient. This costs network/browser time, not LLM tokens.

const old = `
    let evidence = await fetchHttp(item.sourceUrl);
    if ((!evidence || looksJavascriptThin(evidence)) && USE_PLAYWRIGHT) {
      browserUsed++;
      const b = await fetchPlaywright(item.sourceUrl);
      if (b) evidence = b;
    }

    if (!evidence) {
      queued++;
      console.log("  -> QUEUED (no usable evidence)");
      await updateItem(item, DiscoveryStatus.QUEUED, "No usable HTTP/Playwright evidence.");
      if (APPLY) await ensureRediscovery(item, "NO_USABLE_EVIDENCE");
      continue;
    }

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

const replacement = `
    let evidence = await fetchHttp(item.sourceUrl);

    if ((!evidence || looksJavascriptThin(evidence)) && USE_PLAYWRIGHT) {
      browserUsed++;
      const b = await fetchPlaywright(item.sourceUrl);
      if (b) evidence = b;
    }

    if (!evidence) {
      queued++;
      console.log("  -> QUEUED (no usable evidence)");
      await updateItem(item, DiscoveryStatus.QUEUED, "No usable HTTP/Playwright evidence.");
      if (APPLY) await ensureRediscovery(item, "NO_USABLE_EVIDENCE");
      continue;
    }

    let preflight = classifyPreflight(evidence);

    // Retry one browser render for transient/soft states only.
    // Hard 401/403/404/410/429 and 5xx are not retried here.
    const hardHttpFailure =
      [401, 403, 404, 410, 429].includes(evidence.httpStatus ?? -1) ||
      ((evidence.httpStatus ?? 0) >= 500);

    if (
      USE_PLAYWRIGHT &&
      !preflight.usableForLlm &&
      !hardHttpFailure &&
      ["EMPTY", "NOT_FOUND", "BLOCKED"].includes(preflight.kind)
    ) {
      browserUsed++;
      const retryEvidence = await fetchPlaywright(item.sourceUrl);

      if (retryEvidence) {
        const retryPreflight = classifyPreflight(retryEvidence);

        console.log(
          \`  -> preflight retry: \${preflight.kind} -> \${retryPreflight.kind}\`,
        );

        evidence = retryEvidence;
        preflight = retryPreflight;
      }
    }

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

if (!s.includes(old)) {
  console.error("Could not find expected preflight block in verify.ts. No changes made.");
  process.exit(1);
}

s = s.replace(old, replacement);
fs.writeFileSync(path, s);
console.log("verify.ts patched: conservative preflight + one browser retry.");
