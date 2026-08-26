import "dotenv/config";
import { createHash } from "node:crypto";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  RediscoveryTaskStatus,
  SourceType,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  fetchHttp,
  fetchPlaywright,
  looksJavascriptThin,
} from "../core/fetch-evidence";
import { classifyPreflight } from "../core/preflight";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.env.REDISCOVERY_BATCH_SIZE || "10");
const USE_PLAYWRIGHT = process.env.VERIFICATION_USE_PLAYWRIGHT !== "false";

const DISCOVERY_HINTS = [
  "gift-card",
  "giftcard",
  "gift-cards",
  "giftcards",
  "e-gift",
  "egift",
  "voucher",
  "gift-voucher",
  "doroepitagi",
  "doro-epitagi",
  "dorokarta",
  "dwrokarta",
];

const HARD_NEGATIVE_URL_HINTS = [
  "/blog/",
  "/news/",
  "/events/",
  "/article/",
  "/articles/",
  "/gift-guide",
  "/gift-ideas",
  "/wrapping",
  "/packaging",
  "/engraving",
  "/promo",
  "/promotion",
];

const GAMING_HINTS = [
  "playstation",
  "xbox",
  "nintendo",
  "steam",
  "ps5",
  "gaming",
  "game",
  "fc-24",
  "ea-sports",
];

function domainOf(input: string) {
  const u = new URL(input);
  return (
    getDomain(u.hostname, { allowPrivateDomains: true }) ??
    u.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function normalizeUrl(raw: string, base: string) {
  try {
    const u = new URL(raw, base);
    u.hash = "";
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      u.searchParams.delete(k);
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function fingerprint(domain: string, url: string) {
  return createHash("sha256")
    .update(`rediscovery|${domain}|${url}`)
    .digest("hex");
}

function discoveryScore(url: string, label = "", source = "") {
  const hay = `${url} ${label}`.toLowerCase();

  let score = source === "homepage" || source.includes("sitemap") ? 25 : 0;

  for (const hint of DISCOVERY_HINTS) {
    if (hay.includes(hint)) score += 18;
  }

  if (/gift[-_ ]?card/.test(hay)) score += 22;
  if (/doro.?epit|dorokarta|dwrokarta/.test(hay)) score += 22;
  if (/voucher/.test(hay)) score += 8;

  for (const bad of HARD_NEGATIVE_URL_HINTS) {
    if (hay.includes(bad)) score -= 50;
  }

  if (/terms|faq|consents|policy|legal/.test(hay)) score -= 18;
  if (/checkout|cart|basket/.test(hay)) score -= 8;

  if (GAMING_HINTS.some((x) => hay.includes(x))) score -= 60;

  return score;
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "DorokartesRediscovery/1.1 (+official gift-card discovery; respectful low-rate fetch)",
        accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
    });

    const text = res.ok ? await res.text() : "";

    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html: string, base: string) {
  const out = new Map<string, string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html))) {
    const url = normalizeUrl(m[1], base);
    if (!url) continue;

    const label = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();

    out.set(url, label);
  }

  return out;
}

function extractSitemapUrls(xml: string, base: string) {
  const urls = new Set<string>();
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml))) {
    const url = normalizeUrl(m[1].trim(), base);
    if (url) urls.add(url);
  }

  return [...urls];
}

function evidenceGiftSignals(e: any) {
  const text = [
    e.title ?? "",
    ...(e.headings ?? []),
    ...(e.ctas ?? []),
    e.visibleText ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const positive = [
    "gift card",
    "giftcard",
    "e-gift",
    "e gift",
    "δωροκάρτα",
    "δωροκαρτα",
    "δωροεπιταγή",
    "δωροεπιταγη",
    "doroepitagi",
    "dorokarta",
    "dwrokarta",
  ];

  const gaming = GAMING_HINTS.filter((x) => text.includes(x)).length;
  const positives = positive.filter((x) => text.includes(x)).length;

  const purchaseSignals = [
    "αγορά",
    "αγορα",
    "buy",
    "purchase",
    "send",
    "στείλε",
    "στειλε",
    "amount",
    "ποσό",
    "ποσο",
    "recipient",
    "παραλήπτη",
    "παραληπτη",
  ].filter((x) => text.includes(x)).length;

  return { positives, purchaseSignals, gaming };
}

async function validateCandidate(candidate: any, merchantDomain: string) {
  if (domainOf(candidate.url) !== merchantDomain) {
    return { ok: false, reason: "CROSS_DOMAIN" };
  }

  let evidence = await fetchHttp(candidate.url);

  if ((!evidence || looksJavascriptThin(evidence)) && USE_PLAYWRIGHT) {
    evidence = await fetchPlaywright(candidate.url);
  }

  if (!evidence) {
    return { ok: false, reason: "NO_EVIDENCE" };
  }

  const preflight = classifyPreflight(evidence);

  if (!preflight.usableForLlm) {
    return {
      ok: false,
      reason: `PREFLIGHT_${preflight.kind}`,
      httpStatus: evidence.httpStatus,
    };
  }

  const sig = evidenceGiftSignals(evidence);

  // Deterministic validation only. We do NOT call the LLM here.
  // A candidate is good enough to enter DiscoveryItem only when the rendered
  // page itself contains strong gift-card evidence.
  if (sig.positives < 1) {
    return { ok: false, reason: "NO_GIFT_CARD_SIGNAL" };
  }

  if (sig.gaming >= 2 && sig.purchaseSignals < 1) {
    return { ok: false, reason: "LIKELY_GAMING_VOUCHER" };
  }

  return {
    ok: true,
    evidence,
    signals: sig,
  };
}

async function discoverForTask(task: any) {
  const domain = task.merchantDomain.toLowerCase();
  const origin = new URL(task.triggerUrl).origin;

  const raw = new Map<
    string,
    { url: string; label: string; score: number; source: string }
  >();

  const home = await fetchText(origin);

  if (home.ok) {
    for (const [url, label] of extractLinks(home.text, home.finalUrl)) {
      if (domainOf(url) !== domain) continue;
      const score = discoveryScore(url, label, "homepage");
      if (score >= 20) {
        raw.set(url, { url, label, score, source: "homepage" });
      }
    }
  }

  const sitemapUrl = `${origin}/sitemap.xml`;
  const sitemap = await fetchText(sitemapUrl);

  if (sitemap.ok) {
    const sitemapUrls = extractSitemapUrls(sitemap.text, sitemap.finalUrl);
    const childSitemaps = sitemapUrls
      .filter((u) => /\.xml($|\?)/i.test(u))
      .slice(0, 8);

    for (const url of sitemapUrls) {
      if (domainOf(url) !== domain) continue;
      const score = discoveryScore(url, "", "sitemap");
      if (score >= 20) {
        raw.set(url, { url, label: "", score, source: "sitemap" });
      }
    }

    for (const child of childSitemaps) {
      const childRes = await fetchText(child);
      if (!childRes.ok) continue;

      for (const url of extractSitemapUrls(childRes.text, childRes.finalUrl)) {
        if (domainOf(url) !== domain) continue;
        const score = discoveryScore(url, "", "child-sitemap");
        if (score >= 20) {
          raw.set(url, {
            url,
            label: "",
            score,
            source: "child-sitemap",
          });
        }
      }
    }
  }

  // Known paths are hypotheses only. They MUST validate before being returned.
  const probes = [
    "/gift-card",
    "/gift-cards",
    "/giftcard",
    "/e-gift-card",
    "/gift-voucher",
    "/doroepitagi",
    "/dorokarta",
    "/el/gift-card",
    "/el/gift-cards",
    "/el/doroepitagi",
    "/el/dorokarta",
  ];

  for (const path of probes) {
    const url = normalizeUrl(path, origin);
    if (!url) continue;
    const score = discoveryScore(url, "", "known-path");
    if (score >= 20 && !raw.has(url)) {
      raw.set(url, {
        url,
        label: "",
        score,
        source: "known-path",
      });
    }
  }

  raw.delete(task.triggerUrl.replace(/\/$/, ""));

  const ranked = [...raw.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const validated: any[] = [];

  for (const c of ranked) {
    const validation = await validateCandidate(c, domain);

    if (!validation.ok) {
      console.log(
        `  [DROP] ${c.url} (${c.source}) reason=${validation.reason}`,
      );
      continue;
    }

    validated.push({
      ...c,
      finalUrl: validation.evidence.finalUrl,
      httpStatus: validation.evidence.httpStatus,
      contentHash: validation.evidence.contentHash,
      visibleChars: validation.evidence.visibleText.length,
      signals: validation.signals,
    });
  }

  return validated.slice(0, 8);
}

async function saveCandidate(task: any, c: any) {
  const domain = task.merchantDomain.toLowerCase();

  const existing = await prisma.discoveryItem.findFirst({
    where: { sourceUrl: c.url },
  });

  if (existing) return { action: "EXISTS", id: existing.id };

  const created = await prisma.discoveryItem.create({
    data: {
      sourceType: SourceType.OFFICIAL,
      sourceName: "Rediscovery Engine",
      sourceUrl: c.url,
      title: c.label || null,
      merchantName: task.merchantName,
      status: DiscoveryStatus.QUEUED,
      possibleOfficialUrl: c.finalUrl || c.url,
      fingerprint: fingerprint(domain, c.url),
      notes:
        `Validated rediscovery candidate for task ${task.id}; ` +
        `source=${c.source}; score=${c.score}; ` +
        `http=${c.httpStatus}; hash=${c.contentHash}; ` +
        `giftSignals=${c.signals.positives}; purchaseSignals=${c.signals.purchaseSignals}; ` +
        `trigger=${task.triggerUrl}`,
    },
  });

  return { action: "CREATED", id: created.id };
}

async function main() {
  const tasks = await prisma.domainRediscoveryTask.findMany({
    where: {
      status: {
        in: [
          RediscoveryTaskStatus.PENDING,
          RediscoveryTaskStatus.RUNNING,
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
  });

  console.log("Dorokartes Automatic Rediscovery v1.1");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Tasks: ${tasks.length}`);
  console.log("");

  let foundTotal = 0;
  let createdTotal = 0;

  for (const task of tasks) {
    console.log(
      `=== ${task.merchantName ?? task.merchantDomain} (${task.merchantDomain}) ===`,
    );

    const candidates = await discoverForTask(task);

    if (candidates.length === 0) {
      console.log("  No validated replacement candidates found.");

      if (APPLY) {
        await prisma.domainRediscoveryTask.update({
          where: { id: task.id },
          data: {
            status: RediscoveryTaskStatus.MANUAL_REVIEW,
            attempts: { increment: 1 },
            lastAttemptAt: new Date(),
          },
        });
      }

      continue;
    }

    foundTotal += candidates.length;

    for (const c of candidates) {
      console.log(
        `  [KEEP ${c.score}] ${c.url} (${c.source}) ` +
        `signals=${c.signals.positives}/${c.signals.purchaseSignals}`,
      );

      if (APPLY) {
        const saved = await saveCandidate(task, c);
        if (saved.action === "CREATED") createdTotal++;
        console.log(`     -> ${saved.action}`);
      }
    }

    if (APPLY) {
      await prisma.domainRediscoveryTask.update({
        where: { id: task.id },
        data: {
          status: RediscoveryTaskStatus.RUNNING,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    }
  }

  console.log("");
  console.log("====================================");
  console.log(`Validated candidates found: ${foundTotal}`);
  console.log(`DiscoveryItems created: ${createdTotal}`);

  if (!APPLY) {
    console.log("Dry run only. No database changes.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
