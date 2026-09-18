import fs from "node:fs";

const file = "scripts/pipeline/admin/resolve-official-giftcard-urls-v1.ts";

if (!fs.existsSync(file)) {
  console.error(`Missing ${file}`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (!s.includes("function isSafeAutoApplyCandidate")) {
  s = s.replace(
    /async function main\(\) \{/,
`function isSafeAutoApplyCandidate(result: any) {
  if (!result || result.status !== "HIGH_CONFIDENCE" || !result.best?.url) return false;

  try {
    const u = new URL(result.best.url);
    const path = decodeURIComponent(u.pathname + u.search).toLowerCase();

    // These can mention gift cards but are often info/legal/help pages rather than the actual card destination.
    const unsafePatterns = [
      "/faq",
      "faq/",
      "terms",
      "oroi-chrisis",
      "όροι",
      "payment-method",
      "general-info",
      "/content/",
      "/about-",
      "/about/",
      "service",
    ];

    if (unsafePatterns.some((x) => path.includes(x))) return false;

    // Avoid obvious wrong-country locale redirects.
    const wrongLocalePatterns = ["/gb/", "/uk/", "/us/"];
    if (wrongLocalePatterns.some((x) => path.includes(x))) return false;

    // Must still look explicitly related to gift-card/voucher content.
    const positive = [
      "gift-card",
      "giftcard",
      "gift-cards",
      "egift",
      "e-gift",
      "gift-voucher",
      "giftvoucher",
      "voucher",
      "dorokarta",
      "dwrokarta",
      "doroepitagi",
      "dwroepitagi",
      "δωροκαρ",
      "δωροεπιταγ",
      "wps_wgm_giftcard",
      "mwb_wgm_giftcard",
    ];

    return positive.some((x) => path.includes(x));
  } catch {
    return false;
  }
}

async function main() {`
  );
}

s = s.replace(
  /const high = results\.filter\(\(r\) => r\.status === "HIGH_CONFIDENCE"\);/,
`const high = results.filter((r) => r.status === "HIGH_CONFIDENCE");
  const safeHigh = high.filter(isSafeAutoApplyCandidate);
  const heldForReview = high.filter((r) => !isSafeAutoApplyCandidate(r));`
);

s = s.replace(
  /console\.log\("HIGH CONFIDENCE RESOLUTIONS"\);[\s\S]*?for \(const r of high\) \{/m,
`console.log("HIGH CONFIDENCE RESOLUTIONS");
  console.log("===========================");
  console.log(\`High confidence total: \${high.length}\`);
  console.log(\`Safe auto-apply: \${safeHigh.length}\`);
  console.log(\`Held for manual review: \${heldForReview.length}\`);
  console.log("");
  for (const r of high) {`
);

s = s.replace(
  /console\.log\("If the high-confidence list looks sane, run again with --apply\."\);/,
  'console.log("If the SAFE AUTO-APPLY subset looks sane, run again with --apply.");'
);

s = s.replace(
  /for \(const r of high\) \{\s*await prisma\.giftCard\.update\(/m,
  'for (const r of safeHigh) {\n    await prisma.giftCard.update('
);

s = s.replace(
  /console\.log\(`Updated: \$\{updated\}`\);/,
  'console.log(`Updated: ${updated}`);\n  console.log(`Held for manual review: ${heldForReview.length}`);'
);

fs.writeFileSync(file, s, "utf8");

console.log("Resolver v1.2 safe-apply patch installed.");
console.log("Unsafe info/help/legal/wrong-locale gift-card URLs are held for manual review.");
console.log("Re-run PREVIEW first.");
