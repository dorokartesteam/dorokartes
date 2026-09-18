import fs from "node:fs";

const file = "scripts/pipeline/admin/resolve-official-giftcard-urls-v1.ts";

if (!fs.existsSync(file)) {
  console.error(`Missing ${file}`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

const start = s.indexOf("function isSafeAutoApplyCandidate");
const end = s.indexOf("\nasync function main()", start);

if (start === -1 || end === -1) {
  console.error("Could not locate v1.2 safe-apply function. Install v1.2 first.");
  process.exit(1);
}

const strictFn = String.raw`function safeDecodeForFilter(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hasUnsafeDestinationPattern(url: string) {
  try {
    const u = new URL(url);
    const path = safeDecodeForFilter(u.pathname + u.search).toLowerCase();

    const unsafePatterns = [
      "faq",
      "general-info",
      "terms",
      "term-",
      "oroi",
      "όροι",
      "privacy",
      "cookie",
      "payment-method",
      "payment_methods",
      "about-e-gift",
      "about-gift",
      "/about/",
      "/help/",
      "/support/",
      "/blog/",
      "/news/",
      "%22",
      "\"",
    ];

    if (unsafePatterns.some((x) => path.includes(x))) return true;

    const wrongLocales = [
      "/gb/",
      "/uk/",
      "/us/",
      "/en-gb/",
      "/en-us/",
    ];

    if (wrongLocales.some((x) => path.includes(x))) return true;

    return false;
  } catch {
    return true;
  }
}

function looksLikeTransactionalGiftCardDestination(url: string) {
  try {
    const u = new URL(url);
    const path = safeDecodeForFilter(u.pathname + u.search).toLowerCase();

    const transactionalPatterns = [
      "/product/",
      "/products/",
      "/product-category/",
      "/collections/",
      "/category/",
      "/cat/",
      "/shop/",
      "/buy/",
      "/c/",
      "/p/",
      "gift-card",
      "giftcard",
      "gift-cards",
      "egift",
      "e-gift",
      "gift-voucher",
      "giftvoucher",
      "dorokarta",
      "dwrokarta",
      "doroepitagi",
      "dwroepitagi",
      "δωροκαρ",
      "δωροεπιταγ",
      "wps_wgm_giftcard",
      "mwb_wgm_giftcard",
    ];

    return transactionalPatterns.some((x) => path.includes(x));
  } catch {
    return false;
  }
}

function isSafeAutoApplyCandidate(result: any) {
  if (!result || result.status !== "HIGH_CONFIDENCE" || !result.best?.url) return false;
  if (hasUnsafeDestinationPattern(result.best.url)) return false;
  return looksLikeTransactionalGiftCardDestination(result.best.url);
}

function pageStillLooksLikeGiftCard(html: string) {
  const text = stripTags(html).toLowerCase();

  const positive = [
    "gift card",
    "gift cards",
    "e-gift",
    "egift",
    "gift voucher",
    "δωροκάρτα",
    "δωροκαρτα",
    "δωροκάρτες",
    "δωροκαρτες",
    "δωροεπιταγή",
    "δωροεπιταγη",
    "δωροεπιταγές",
    "δωροεπιταγες",
  ];

  return positive.some((x) => text.includes(x));
}

async function validateBeforeApply(result: any) {
  const fetched = await fetchHtml(result.best.url);
  if (!fetched) return { ok: false as const, reason: "candidate fetch failed" };

  if (hasUnsafeDestinationPattern(fetched.finalUrl)) {
    return { ok: false as const, reason: "unsafe final redirect" };
  }

  if (!looksLikeTransactionalGiftCardDestination(fetched.finalUrl)) {
    return { ok: false as const, reason: "final URL no longer looks like gift-card destination" };
  }

  if (!pageStillLooksLikeGiftCard(fetched.html)) {
    return { ok: false as const, reason: "page content does not confirm gift-card context" };
  }

  return {
    ok: true as const,
    finalUrl: fetched.finalUrl,
  };
}
`;

s = s.slice(0, start) + strictFn + s.slice(end);

// Replace apply loop with validation-aware loop.
const oldLoop = /let updated = 0;\s*for \(const r of safeHigh\) \{[\s\S]*?console\.log\(`Updated: \$\{updated\}`\);\s*console\.log\(`Held for manual review: \$\{heldForReview\.length\}`\);/m;

if (!oldLoop.test(s)) {
  console.error("Could not locate v1.2 apply loop.");
  process.exit(1);
}

s = s.replace(oldLoop, `let updated = 0;
  let validationRejected = 0;

  for (const r of safeHigh) {
    const validated = await validateBeforeApply(r);

    if (!validated.ok) {
      validationRejected++;
      console.log(\`SKIP | \${r.card.merchant?.name} | \${validated.reason} | \${r.best.url}\`);
      continue;
    }

    await prisma.giftCard.update({
      where: { id: r.card.id },
      data: {
        officialUrl: validated.finalUrl,
        verificationStatus: "NEEDS_REVIEW",
      },
    });

    updated++;
    console.log(\`UPDATED | \${r.card.merchant?.name} | \${validated.finalUrl}\`);
  }

  console.log(\`Updated: \${updated}\`);
  console.log(\`Rejected during live validation: \${validationRejected}\`);
  console.log(\`Held for manual review: \${heldForReview.length}\`);`);

fs.writeFileSync(file, s, "utf8");

console.log("Resolver v1.3 strict-apply patch installed.");
console.log("- excludes FAQ/about/terms/payment/help/wrong-locale/malformed destinations");
console.log("- validates candidate page live immediately before DB update");
console.log("- requires gift-card text on destination page");
console.log("- follows redirects and stores the final valid URL");
console.log("Run PREVIEW once, then --apply.");
