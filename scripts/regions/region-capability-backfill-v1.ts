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
  "Mozilla/5.0 (compatible; DorokartesCatalogVerifier/1.0; +https://dorokartes.gr)";

type Capability = "PURCHASE_IN_STORE" | "REDEEM_IN_STORE";
type Decision =
  | "ALREADY_VERIFIED"
  | "SAFE_TO_APPLY"
  | "NO_VERIFIED_LOCATION"
  | "NO_OFFICIAL_URL"
  | "FETCH_FAILED"
  | "NO_IN_STORE_EVIDENCE"
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

function excerptAround(text: string, index: number, radius = 180) {
  if (index < 0) return null;
  return compact(
    text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)),
  ).slice(0, 700);
}

const STORE_SCOPE = [
  /σε\s+όλα\s+τα\s+καταστήματα/i,
  /σε\s+οποιοδήποτε\s+κατάστημα/i,
  /στα\s+συμμετέχοντα\s+καταστήματα/i,
  /φυσικ(?:ό|ά|ων)\s+κατάστημα/i,
  /\ball\s+(?:of\s+our\s+)?stores\b/i,
  /\bany\s+(?:of\s+our\s+)?stores\b/i,
  /\bparticipating\s+stores\b/i,
  /\bphysical\s+stores?\b/i,
  /\bretail\s+stores?\b/i,
];

const REDEEM = [
  /εξαργυρ\w{0,20}.{0,120}(?:κατάστημα|καταστήματα|φυσικ)/i,
  /(?:κατάστημα|καταστήματα|φυσικ).{0,120}εξαργυρ\w{0,20}/i,
  /χρησιμοποι\w{0,20}.{0,120}(?:κατάστημα|καταστήματα|φυσικ)/i,
  /\bredeem(?:ed|able)?\b.{0,120}\b(?:store|stores|shop|shops|physical location)/i,
  /\b(?:store|stores|shop|shops|physical location)\b.{0,120}\bredeem/i,
  /\buse\b.{0,100}\b(?:in[- ]store|physical store|retail store)/i,
];

const PURCHASE = [
  /(?:αγορά|αγοραστ|προμηθευ)\w{0,20}.{0,120}(?:κατάστημα|καταστήματα|ταμείο)/i,
  /(?:κατάστημα|καταστήματα|ταμείο).{0,120}(?:αγορά|αγοραστ|προμηθευ)\w{0,20}/i,
  /\b(?:buy|purchase)\b.{0,100}\b(?:in[- ]store|store|shop|retail location)/i,
  /\b(?:in[- ]store|store|shop|retail location)\b.{0,100}\b(?:buy|purchase)\b/i,
];

const ONLINE_ONLY = [
  /μόνο\s+online/i,
  /αποκλειστικά\s+online/i,
  /μόνο\s+ηλεκτρονικ/i,
  /\bonline[- ]only\b/i,
  /\bonly\s+(?:valid|usable|redeemable)\s+online\b/i,
  /\bnot\s+(?:valid|usable|redeemable)\s+in[- ]store\b/i,
];

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { index: match.index, text: match[0] };
  }
  return null;
}

function classifyEvidence(text: string): Evidence {
  const redeem = firstMatch(text, REDEEM);
  const purchase = firstMatch(text, PURCHASE);
  const scope = firstMatch(text, STORE_SCOPE);
  const onlineOnly = firstMatch(text, ONLINE_ONLY);

  const positiveIndex =
    redeem?.index ?? purchase?.index ?? scope?.index ?? onlineOnly?.index ?? -1;

  return {
    purchase: Boolean(purchase),
    redeem: Boolean(redeem),
    allStoreScope: Boolean(scope),
    onlineOnly: Boolean(onlineOnly) && !redeem && !purchase,
    excerpt: excerptAround(text, positiveIndex),
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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

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
      slug: true,
      officialUrl: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          locations: {
            where: { active: true, verificationStatus: "VERIFIED" },
            orderBy: [{ city: "asc" }, { addressLine: "asc" }],
            select: {
              id: true,
              city: true,
              area: true,
              administrativeArea: true,
              addressLine: true,
              sourceUrl: true,
            },
          },
        },
      },
      locationCapabilities: {
        where: { available: true, verificationStatus: "VERIFIED" },
        select: {
          id: true,
          capability: true,
          merchantLocationId: true,
        },
      },
    },
  });

  const candidates = cards.filter((card) => card.locationCapabilities.length === 0);

  console.log("=== DOROKARTES REGION CAPABILITY BACKFILL v1 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Catalog cards: ${cards.length}`);
  console.log(`Already verified: ${cards.length - candidates.length}`);
  console.log(`To inspect: ${candidates.length}`);
  console.log(`Concurrency: ${MAX_CONCURRENCY}`);
  console.log("");

  const rows = await mapLimit(candidates, MAX_CONCURRENCY, async (card, index) => {
    const prefix = `[${index + 1}/${candidates.length}] ${card.merchant.name} — ${card.title}`;

    if (!card.merchant.locations.length) {
      console.log(`${prefix}: NO_VERIFIED_LOCATION`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        officialUrl: card.officialUrl,
        verifiedLocationCount: 0,
        evidence: null,
        decision: "NO_VERIFIED_LOCATION" as Decision,
        plannedCapabilities: [] as Array<{
          merchantLocationId: string;
          capability: Capability;
        }>,
        error: null as string | null,
      };
    }

    if (!card.officialUrl || !/^https?:\/\//i.test(card.officialUrl)) {
      console.log(`${prefix}: NO_OFFICIAL_URL`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        officialUrl: card.officialUrl,
        verifiedLocationCount: card.merchant.locations.length,
        evidence: null,
        decision: "NO_OFFICIAL_URL" as Decision,
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
        officialUrl: card.officialUrl,
        verifiedLocationCount: card.merchant.locations.length,
        evidence: null,
        decision: "FETCH_FAILED" as Decision,
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
        officialUrl: card.officialUrl,
        verifiedLocationCount: card.merchant.locations.length,
        evidence,
        decision: "ONLINE_ONLY_SIGNAL" as Decision,
        plannedCapabilities: [],
        error: null as string | null,
      };
    }

    const capabilities: Capability[] = [];
    if (evidence.purchase) capabilities.push("PURCHASE_IN_STORE");
    if (evidence.redeem) capabilities.push("REDEEM_IN_STORE");

    if (!capabilities.length) {
      console.log(`${prefix}: NO_IN_STORE_EVIDENCE`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        officialUrl: card.officialUrl,
        verifiedLocationCount: card.merchant.locations.length,
        evidence,
        decision: "NO_IN_STORE_EVIDENCE" as Decision,
        plannedCapabilities: [],
        error: null as string | null,
      };
    }

    /*
     * Safety rule:
     * - If merchant has exactly one VERIFIED physical location, an explicit in-store
     *   capability can be attached there.
     * - If merchant has multiple VERIFIED locations, apply to all only when the
     *   official gift-card page explicitly contains all/any/participating/physical-store scope.
     * - Otherwise leave unresolved rather than inventing per-location applicability.
     */
    if (card.merchant.locations.length > 1 && !evidence.allStoreScope) {
      console.log(`${prefix}: AMBIGUOUS_LOCATION_SCOPE`);
      return {
        giftCardId: card.id,
        merchant: card.merchant.name,
        giftCard: card.title,
        officialUrl: card.officialUrl,
        verifiedLocationCount: card.merchant.locations.length,
        evidence,
        decision: "AMBIGUOUS_LOCATION_SCOPE" as Decision,
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

    if (APPLY && plannedCapabilities.length) {
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

    console.log(
      `${prefix}: SAFE_TO_APPLY (${plannedCapabilities.length} capability rows)`,
    );

    return {
      giftCardId: card.id,
      merchant: card.merchant.name,
      giftCard: card.title,
      officialUrl: card.officialUrl,
      verifiedLocationCount: card.merchant.locations.length,
      evidence,
      decision: "SAFE_TO_APPLY" as Decision,
      plannedCapabilities,
      error: null as string | null,
    };
  });

  const alreadyVerified = cards.length - candidates.length;
  const summary = rows.reduce<Record<Decision, number>>(
    (acc, row) => {
      acc[row.decision]++;
      return acc;
    },
    {
      ALREADY_VERIFIED: alreadyVerified,
      SAFE_TO_APPLY: 0,
      NO_VERIFIED_LOCATION: 0,
      NO_OFFICIAL_URL: 0,
      FETCH_FAILED: 0,
      NO_IN_STORE_EVIDENCE: 0,
      AMBIGUOUS_LOCATION_SCOPE: 0,
      ONLINE_ONLY_SIGNAL: 0,
    },
  );

  const plannedCapabilityRows = rows.reduce(
    (sum, row) => sum + row.plannedCapabilities.length,
    0,
  );

  const output = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "APPLY" : "DRY_RUN",
    safetyRule:
      "Never infer gift-card usability from merchant location presence alone.",
    totalCatalogCards: cards.length,
    alreadyVerified,
    inspected: candidates.length,
    plannedCapabilityRows,
    summary,
    rows,
  };

  const dir = path.resolve(process.cwd(), "reports", "regions");
  await fs.mkdir(dir, { recursive: true });

  const suffix = APPLY ? "apply" : "dry-run";
  const reportPath = path.join(
    dir,
    `region-capability-backfill-v1-${suffix}.json`,
  );

  await fs.writeFile(reportPath, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log("=== SUMMARY ===");
  console.table(summary);
  console.log(`Planned/inserted capability rows: ${plannedCapabilityRows}`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);

  if (!APPLY) {
    console.log("");
    console.log("DRY RUN ONLY — database unchanged.");
    console.log(
      "Review the report first. Apply with: npx tsx .\\scripts\\regions\\region-capability-backfill-v1.ts --apply",
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
