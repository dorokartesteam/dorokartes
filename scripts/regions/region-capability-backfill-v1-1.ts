import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import * as cheerio from "cheerio";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");
const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(12, Number(process.env.REGION_BACKFILL_CONCURRENCY || "6")),
);
const FETCH_TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.REGION_BACKFILL_TIMEOUT_MS || "12000"),
);
const USER_AGENT =
  "Mozilla/5.0 (compatible; DorokartesCatalogVerifier/1.1; +https://dorokartes.gr)";

type Capability = "PURCHASE_IN_STORE" | "REDEEM_IN_STORE";
type Decision =
  | "ALREADY_VERIFIED"
  | "SAFE_TO_APPLY"
  | "NO_VERIFIED_LOCATION"
  | "NO_OFFICIAL_URL"
  | "FETCH_FAILED"
  | "NO_GIFT_CARD_IN_STORE_EVIDENCE"
  | "AMBIGUOUS_LOCATION_SCOPE"
  | "ONLINE_ONLY_SIGNAL";

type Evidence = {
  purchase: boolean;
  redeem: boolean;
  allStoreScope: boolean;
  onlineOnly: boolean;
  excerpt: string | null;
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function excerptAround(text: string, index: number, radius = 240) {
  if (index < 0) return null;
  return compact(
    text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)),
  ).slice(0, 900);
}

function within(text: string, a: RegExp, b: RegExp, distance = 220) {
  const aMatch = a.exec(text);
  if (!aMatch) return null;

  const start = Math.max(0, aMatch.index - distance);
  const end = Math.min(text.length, aMatch.index + aMatch[0].length + distance);
  const window = text.slice(start, end);
  const bMatch = b.exec(window);

  return bMatch
    ? { index: aMatch.index, excerpt: excerptAround(text, aMatch.index) }
    : null;
}

const GIFT_CARD = /(?:gift\s*card|gift\s*voucher|e-?gift\s*card|δωροκάρτ\w*|δωροεπιταγ\w*)/i;
const STORE = /(?:in[- ]store|physical\s+store|retail\s+store|store|shop|κατάστημα\w*|φυσικ\w+\s+κατάστημα\w*)/i;

const PURCHASE = /(?:buy|purchase|αγοράζ\w*|αγοράστ\w*|αγορά\w*)/i;
const REDEEM = /(?:redeem\w*|use\w*|εξαργυρ\w*|χρησιμοποι\w*)/i;

const ALL_STORE_SCOPE = /(?:all\s+(?:our\s+)?stores|any\s+(?:of\s+our\s+)?stores|participating\s+stores|σε\s+όλα\s+τα\s+καταστήματα|σε\s+οποιοδήποτε\s+κατάστημα|στα\s+συμμετέχοντα\s+καταστήματα)/i;

const ONLINE_ONLY = /(?:online[- ]only|only\s+(?:valid|usable|redeemable)\s+online|not\s+(?:valid|usable|redeemable)\s+in[- ]store|μόνο\s+online|αποκλειστικά\s+online|μόνο\s+ηλεκτρονικ\w*)/i;

function classifyEvidence(text: string): Evidence {
  const normalized = compact(text);

  const giftStore = within(normalized, GIFT_CARD, STORE, 260) || within(normalized, STORE, GIFT_CARD, 260);

  if (!giftStore) {
    return {
      purchase: false,
      redeem: false,
      allStoreScope: false,
      onlineOnly: ONLINE_ONLY.test(normalized) && GIFT_CARD.test(normalized),
      excerpt: null,
    };
  }

  const excerpt = giftStore.excerpt || "";
  const purchase = PURCHASE.test(excerpt) && GIFT_CARD.test(excerpt) && STORE.test(excerpt);
  const redeem = REDEEM.test(excerpt) && GIFT_CARD.test(excerpt) && STORE.test(excerpt);
  const allStoreScope = ALL_STORE_SCOPE.test(excerpt);
  const onlineOnly = ONLINE_ONLY.test(excerpt) && !purchase && !redeem;

  return {
    purchase,
    redeem,
    allStoreScope,
    onlineOnly,
    excerpt: excerpt || null,
  };
}

async function fetchPageText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`Unsupported content-type: ${contentType || "unknown"}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    $("script,style,noscript,svg").remove();
    return compact($("body").text()).slice(0, 700_000);
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const cards = await prisma.giftCard.findMany({
    where: {
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      merchant: { status: "ACTIVE" },
    },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      officialUrl: true,
      merchant: {
        select: {
          name: true,
          locations: {
            where: { active: true, verificationStatus: "VERIFIED" },
            select: { id: true, city: true, sourceUrl: true },
          },
        },
      },
      locationCapabilities: {
        where: { available: true, verificationStatus: "VERIFIED" },
        select: { id: true },
      },
    },
  });

  const candidates = cards.filter((card) => card.locationCapabilities.length === 0);

  console.log("=== DOROKARTES REGION CAPABILITY BACKFILL v1.1 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Catalog cards: ${cards.length}`);
  console.log(`Already verified: ${cards.length - candidates.length}`);
  console.log(`To inspect: ${candidates.length}`);
  console.log("");

  const rows = await mapLimit(candidates, MAX_CONCURRENCY, async (card, index) => {
    const prefix = `[${index + 1}/${candidates.length}] ${card.merchant.name} — ${card.title}`;

    if (!card.merchant.locations.length) {
      console.log(`${prefix}: NO_VERIFIED_LOCATION`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        decision: "NO_VERIFIED_LOCATION" as Decision,
        evidence: null,
        plannedCapabilities: [] as Array<{ merchantLocationId: string; capability: Capability }>,
        error: null as string | null,
      };
    }

    if (!card.officialUrl || !/^https?:\/\//i.test(card.officialUrl)) {
      console.log(`${prefix}: NO_OFFICIAL_URL`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        decision: "NO_OFFICIAL_URL" as Decision,
        evidence: null,
        plannedCapabilities: [],
        error: null as string | null,
      };
    }

    let text: string;
    try {
      text = await fetchPageText(card.officialUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${prefix}: FETCH_FAILED (${message})`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        decision: "FETCH_FAILED" as Decision,
        evidence: null,
        plannedCapabilities: [],
        error: message,
      };
    }

    const evidence = classifyEvidence(text);

    if (evidence.onlineOnly) {
      console.log(`${prefix}: ONLINE_ONLY_SIGNAL`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        decision: "ONLINE_ONLY_SIGNAL" as Decision,
        evidence,
        plannedCapabilities: [],
        error: null as string | null,
      };
    }

    const capabilities: Capability[] = [];
    if (evidence.purchase) capabilities.push("PURCHASE_IN_STORE");
    if (evidence.redeem) capabilities.push("REDEEM_IN_STORE");

    if (!capabilities.length) {
      console.log(`${prefix}: NO_GIFT_CARD_IN_STORE_EVIDENCE`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        decision: "NO_GIFT_CARD_IN_STORE_EVIDENCE" as Decision,
        evidence,
        plannedCapabilities: [],
        error: null as string | null,
      };
    }

    if (card.merchant.locations.length > 1 && !evidence.allStoreScope) {
      console.log(`${prefix}: AMBIGUOUS_LOCATION_SCOPE`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        decision: "AMBIGUOUS_LOCATION_SCOPE" as Decision,
        evidence,
        plannedCapabilities: [],
        error: null as string | null,
      };
    }

    const plannedCapabilities = card.merchant.locations.flatMap((location) =>
      capabilities.map((capability) => ({
        merchantLocationId: location.id,
        capability,
      })),
    );

    if (APPLY) {
      const now = new Date();

      await prisma.giftCardLocationCapability.createMany({
        data: plannedCapabilities.map((item) => ({
          giftCardId: card.id,
          merchantLocationId: item.merchantLocationId,
          capability: item.capability,
          available: true,
          verificationStatus: "VERIFIED",
          sourceUrl: card.officialUrl!,
          sourceExcerpt: evidence.excerpt,
          lastVerifiedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    console.log(`${prefix}: SAFE_TO_APPLY (${plannedCapabilities.length} capability rows)`);

    return {
      giftCardId: card.id,
      merchant: card.merchant.name,
      giftCard: card.title,
      decision: "SAFE_TO_APPLY" as Decision,
      evidence,
      plannedCapabilities,
      error: null as string | null,
    };
  });

  const summary = {
    ALREADY_VERIFIED: cards.length - candidates.length,
    SAFE_TO_APPLY: 0,
    NO_VERIFIED_LOCATION: 0,
    NO_OFFICIAL_URL: 0,
    FETCH_FAILED: 0,
    NO_GIFT_CARD_IN_STORE_EVIDENCE: 0,
    AMBIGUOUS_LOCATION_SCOPE: 0,
    ONLINE_ONLY_SIGNAL: 0,
  };

  for (const row of rows) {
    summary[row.decision]++;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "APPLY" : "DRY_RUN",
    version: "1.1",
    rule:
      "Gift-card wording, store wording and purchase/redeem wording must occur in the same nearby evidence window.",
    summary,
    rows,
  };

  const dir = path.resolve(process.cwd(), "reports", "regions");
  await fs.mkdir(dir, { recursive: true });

  const reportPath = path.join(
    dir,
    `region-capability-backfill-v1.1-${APPLY ? "apply" : "dry-run"}.json`,
  );

  await fs.writeFile(reportPath, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log("=== SUMMARY ===");
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);

  if (!APPLY) console.log("DRY RUN ONLY — database unchanged.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
