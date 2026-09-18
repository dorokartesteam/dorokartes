import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");
const CONCURRENCY = 8;
const TIMEOUT_MS = 10000;

const urlHints = [
  "gift-card",
  "giftcard",
  "gift-cards",
  "egift",
  "e-gift",
  "gift-voucher",
  "giftvoucher",
  "voucher",
  "dwrokarta",
  "dorokarta",
  "doro-karta",
  "dwro-karta",
  "dwroepitagi",
  "doroepitagi",
  "doro-epitagi",
  "δωροκαρ",
  "δωροεπιταγ",
];

const textHints = [
  "gift card",
  "gift cards",
  "e-gift",
  "egift",
  "gift voucher",
  "voucher",
  "δωροκάρτα",
  "δωροκαρτα",
  "δωροκάρτες",
  "δωροκαρτες",
  "δωροεπιταγή",
  "δωροεπιταγη",
  "δωροεπιταγές",
  "δωροεπιταγες",
];

function cleanHost(host: string) {
  return host.toLowerCase().replace(/^www\./, "");
}

function normalizeUrl(input?: string | null) {
  if (!input) return null;
  try {
    const u = new URL(input);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function rootish(url?: string | null) {
  if (!url) return true;
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, "");
    return !p || p === "/";
  } catch {
    return true;
  }
}

function sameSite(candidate: URL, merchant: URL) {
  const a = cleanHost(candidate.hostname);
  const b = cleanHost(merchant.hostname);
  return a === b || a.endsWith("." + b) || b.endsWith("." + a);
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function scoreLink(url: URL, text: string) {
  const hayUrl = safeDecodeURIComponent(url.pathname + url.search).toLowerCase();
  const hayText = text.toLowerCase();

  let score = 0;

  for (const hint of urlHints) {
    if (hayUrl.includes(hint)) score += 55;
  }

  for (const hint of textHints) {
    if (hayText.includes(hint)) score += 35;
  }

  if (!rootish(url.toString())) score += 10;

  // Strong penalties for clearly irrelevant/legal/help areas.
  const bad = [
    "privacy", "terms", "cookie", "contact", "login", "account",
    "wishlist", "cart", "checkout", "blog", "news", "faq",
  ];
  if (bad.some((x) => hayUrl.includes(x))) score -= 50;

  return score;
}

async function fetchHtml(url: string) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36",
        "accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "el-GR,el;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return null;

    return {
      html: await res.text(),
      finalUrl: res.url || url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(html: string, baseUrl: string) {
  const links: Array<{ url: string; text: string }> = [];
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = re.exec(html))) {
    const href = m[1] || m[2] || m[3] || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    try {
      const u = new URL(decodeEntities(href), baseUrl);
      if (!["http:", "https:"].includes(u.protocol)) continue;
      links.push({ url: u.toString(), text: stripTags(m[4] || "") });
    } catch {}
  }

  return links;
}

async function resolveOne(card: any) {
  const merchantUrl = normalizeUrl(card.merchant?.websiteUrl);
  const current = normalizeUrl(card.officialUrl);

  if (!merchantUrl) {
    return { card, status: "NO_MERCHANT_URL" as const };
  }

  const merchant = new URL(merchantUrl);

  // Only work on records that are actually suspicious.
  const suspicious =
    !current ||
    rootish(current) ||
    (current && cleanHost(new URL(current).hostname) === cleanHost(merchant.hostname) &&
      new URL(current).pathname.replace(/\/+$/, "") === merchant.pathname.replace(/\/+$/, ""));

  if (!suspicious) {
    return { card, status: "ALREADY_DEEP" as const };
  }

  const fetched = await fetchHtml(merchantUrl);
  if (!fetched) {
    return { card, status: "FETCH_FAILED" as const };
  }

  const candidates = extractLinks(fetched.html, fetched.finalUrl)
    .map((l) => {
      const u = new URL(l.url);
      if (!sameSite(u, merchant)) return null;
      const score = scoreLink(u, l.text);
      return { ...l, score };
    })
    .filter(Boolean) as Array<{ url: string; text: string; score: number }>;

  // Deduplicate URLs, keeping best score.
  const bestByUrl = new Map<string, { url: string; text: string; score: number }>();
  for (const c of candidates) {
    const key = c.url.replace(/#.*$/, "");
    const prev = bestByUrl.get(key);
    if (!prev || c.score > prev.score) bestByUrl.set(key, c);
  }

  const ranked = [...bestByUrl.values()]
    .filter((x) => x.score >= 70)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return { card, status: "NO_CANDIDATE" as const };
  }

  const best = ranked[0];
  const second = ranked[1];

  // High confidence = strong score and meaningful gap to runner-up,
  // or an exceptionally strong single result.
  const highConfidence =
    best.score >= 100 &&
    (!second || best.score - second.score >= 20 || best.score >= 145);

  return {
    card,
    status: highConfidence ? ("HIGH_CONFIDENCE" as const) : ("REVIEW" as const),
    best,
    second,
  };
}

function safeDecodeForFilter(value: string) {
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

async function main() {
  const cards = await prisma.giftCard.findMany({
    select: {
      id: true,
      title: true,
      officialUrl: true,
      merchant: {
        select: {
          name: true,
          websiteUrl: true,
        },
      },
    },
    orderBy: {
      merchant: {
        name: "asc",
      },
    },
  });

  const suspicious = cards.filter((card) => {
    const current = normalizeUrl(card.officialUrl);
    const merchant = normalizeUrl(card.merchant?.websiteUrl);

    if (!current) return true;
    if (rootish(current)) return true;
    if (!merchant) return false;

    try {
      const a = new URL(current);
      const b = new URL(merchant);
      return (
        cleanHost(a.hostname) === cleanHost(b.hostname) &&
        a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "")
      );
    } catch {
      return true;
    }
  });

  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  console.log(`Total gift cards: ${cards.length}`);
  console.log(`Suspicious to inspect: ${suspicious.length}`);
  console.log("");

  const results: any[] = [];
  for (let i = 0; i < suspicious.length; i += CONCURRENCY) {
    const batch = suspicious.slice(i, i + CONCURRENCY);
    const resolved = await Promise.all(batch.map(resolveOne));
    results.push(...resolved);

    const done = Math.min(i + CONCURRENCY, suspicious.length);
    process.stdout.write(`\rChecked ${done}/${suspicious.length}`);
  }
  console.log("\n");

  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.status, (counts.get(r.status) || 0) + 1);

  console.log("SUMMARY");
  console.log("=======");
  for (const key of [
    "HIGH_CONFIDENCE",
    "REVIEW",
    "NO_CANDIDATE",
    "FETCH_FAILED",
    "NO_MERCHANT_URL",
  ]) {
    console.log(`${key}: ${counts.get(key) || 0}`);
  }

  const high = results.filter((r) => r.status === "HIGH_CONFIDENCE");
  const safeHigh = high.filter(isSafeAutoApplyCandidate);
  const heldForReview = high.filter((r) => !isSafeAutoApplyCandidate(r));

  console.log("");
  console.log("HIGH CONFIDENCE RESOLUTIONS");
  console.log("===========================");
  console.log(`High confidence total: ${high.length}`);
  console.log(`Safe auto-apply: ${safeHigh.length}`);
  console.log(`Held for manual review: ${heldForReview.length}`);
  console.log("");
  for (const r of high) {
    console.log(
      `${r.card.merchant?.name} | ${r.card.officialUrl || "(missing)"} -> ${r.best.url} | score=${r.best.score} | ${r.card.id}`
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PREVIEW ONLY — database unchanged.");
    console.log("If the SAFE AUTO-APPLY subset looks sane, run again with --apply.");
    return;
  }

  console.log("");
  console.log("APPLYING HIGH-CONFIDENCE URLS");
  console.log("=============================");

  let updated = 0;
  let validationRejected = 0;

  for (const r of safeHigh) {
    const validated = await validateBeforeApply(r);

    if (!validated.ok) {
      validationRejected++;
      console.log(`SKIP | ${r.card.merchant?.name} | ${validated.reason} | ${r.best.url}`);
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
    console.log(`UPDATED | ${r.card.merchant?.name} | ${validated.finalUrl}`);
  }

  console.log(`Updated: ${updated}`);
  console.log(`Rejected during live validation: ${validationRejected}`);
  console.log(`Held for manual review: ${heldForReview.length}`);
  console.log("Updated cards were intentionally set to NEEDS_REVIEW, not VERIFIED.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
