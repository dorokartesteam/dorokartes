import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");
const OUT = path.join(ROOT, "data", "discovery", "safe-dedupe-plan-v3.csv");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const SOURCE_OR_AGGREGATOR_DOMAINS = new Set([
  "kouponia365.gr",
  "bestprice.gr",
  "skroutz.gr",
  "google.com",
  "google.gr",
  "bing.com",
]);

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function normalizeName(input?: string | null) {
  return (input || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(greece|hellas|official|eshop|e-shop|shop|store|online)\b/g, " ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function scoreItem(item: any) {
  let score = 0;
  if (item.possibleOfficialUrl) score += 50;
  if (item.title) score += 10;
  if (item.notes?.includes("HIGH_SAFE")) score += 20;
  if (item.notes?.match(/Score=(9\d|100)/)) score += 20;
  if (item.status === DiscoveryStatus.QUEUED) score += 15;
  if (item.status === DiscoveryStatus.VERIFIED) score += 30;
  return score;
}

async function main() {
  console.log("Dorokartes Safe Dedupe Cleanup v3");
  console.log("=================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log("Rule: auto-dedupe only on explicit possibleOfficialUrl domains.");
  console.log("Source-only/aggregator domains are never auto-collapsed.");
  console.log("");

  const discovery = await prisma.discoveryItem.findMany({
    where: {
      status: {
        in: [
          DiscoveryStatus.DISCOVERED,
          DiscoveryStatus.QUEUED,
          DiscoveryStatus.VERIFIED,
        ],
      },
    },
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      sourceName: true,
      status: true,
      title: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const production = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      giftCards: { select: { officialUrl: true } },
    },
  });

  const prodDomains = new Map<string, { id: string; name: string }>();
  const prodNames = new Map<string, { id: string; name: string }>();

  for (const m of production) {
    const n = normalizeName(m.name);
    if (n) prodNames.set(n, { id: m.id, name: m.name });

    const urls = [
      m.websiteUrl,
      ...m.giftCards.map((g) => g.officialUrl),
    ].filter(Boolean) as string[];

    for (const url of urls) {
      const d = domainFromUrl(url);
      if (d) prodDomains.set(d, { id: m.id, name: m.name });
    }
  }

  // Only explicit proposed official URL qualifies for automatic domain dedupe.
  const byOfficialDomain = new Map<string, typeof discovery>();

  for (const item of discovery) {
    const domain = domainFromUrl(item.possibleOfficialUrl);
    if (!domain || SOURCE_OR_AGGREGATOR_DOMAINS.has(domain)) continue;

    const arr = byOfficialDomain.get(domain) ?? [];
    arr.push(item);
    byOfficialDomain.set(domain, arr);
  }

  const plan: Record<string, unknown>[] = [];
  const duplicateIds = new Set<string>();

  // A) If explicit official domain already exists in production:
  // every discovery record for that same official domain can safely become DUPLICATE.
  for (const [domain, items] of byOfficialDomain) {
    const prod = prodDomains.get(domain);
    if (!prod) continue;

    for (const item of items) {
      duplicateIds.add(item.id);
      plan.push({
        action: "MARK_DUPLICATE_PRODUCTION",
        domain,
        keep_id: "",
        duplicate_id: item.id,
        duplicate_name: item.merchantName,
        production_id: prod.id,
        production_name: prod.name,
        source_name: item.sourceName,
        reason: "Explicit possibleOfficialUrl domain already exists in production",
      });
    }
  }

  // B) Non-production exact official-domain duplicates:
  // keep the strongest candidate, mark the rest DUPLICATE.
  for (const [domain, items] of byOfficialDomain) {
    if (prodDomains.has(domain) || items.length < 2) continue;

    const sorted = [...items].sort(
      (a, b) =>
        scoreItem(b) - scoreItem(a) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const keeper = sorted[0];

    for (const item of sorted.slice(1)) {
      duplicateIds.add(item.id);
      plan.push({
        action: "MARK_DUPLICATE_DISCOVERY",
        domain,
        keep_id: keeper.id,
        duplicate_id: item.id,
        duplicate_name: item.merchantName,
        production_id: "",
        production_name: "",
        source_name: item.sourceName,
        reason: "Same explicit possibleOfficialUrl domain as keeper",
      });
    }
  }

  // C) Exact-name production matches are report-only unless domain also matched.
  const nameReview: Record<string, unknown>[] = [];
  for (const item of discovery) {
    if (duplicateIds.has(item.id)) continue;

    const n = normalizeName(item.merchantName);
    if (!n) continue;

    const prod = prodNames.get(n);
    if (!prod) continue;

    nameReview.push({
      action: "REVIEW_NAME_MATCH",
      domain: domainFromUrl(item.possibleOfficialUrl),
      keep_id: "",
      duplicate_id: item.id,
      duplicate_name: item.merchantName,
      production_id: prod.id,
      production_name: prod.name,
      source_name: item.sourceName,
      reason: "Exact normalized merchant name matches production, but official domain did not match",
    });
  }

  plan.sort((a, b) =>
    String(a.domain).localeCompare(String(b.domain)) ||
    String(a.duplicate_name).localeCompare(String(b.duplicate_name)),
  );

  writeCsv(OUT, [...plan, ...nameReview], [
    "action",
    "domain",
    "keep_id",
    "duplicate_id",
    "duplicate_name",
    "production_id",
    "production_name",
    "source_name",
    "reason",
  ]);

  const productionDupes = plan.filter(
    (x) => x.action === "MARK_DUPLICATE_PRODUCTION",
  ).length;
  const discoveryDupes = plan.filter(
    (x) => x.action === "MARK_DUPLICATE_DISCOVERY",
  ).length;

  console.log(`Discovery items scanned: ${discovery.length}`);
  console.log(`Production merchants scanned: ${production.length}`);
  console.log(`SAFE auto-duplicate records: ${plan.length}`);
  console.log(`- Already represented in production: ${productionDupes}`);
  console.log(`- Excess same-official-domain discovery: ${discoveryDupes}`);
  console.log(`Name-only matches for manual review: ${nameReview.length}`);
  console.log("");
  console.log("SAFE PLAN SAMPLE:");

  for (const row of plan.slice(0, 60)) {
    console.log(
      `- ${row.action} | ${row.domain} | ${row.duplicate_name}` +
        `${row.production_name ? ` | PROD=${row.production_name}` : ""}`,
    );
  }

  console.log("");
  console.log(`CSV: ${OUT}`);

  if (!APPLY) {
    console.log("PLAN ONLY. No database changes were made.");
    console.log("Run with --apply only after reviewing this output.");
    return;
  }

  if (!plan.length) {
    console.log("Nothing to update.");
    return;
  }

  await prisma.$transaction(
    plan.map((row) =>
      prisma.discoveryItem.update({
        where: { id: String(row.duplicate_id) },
        data: { status: DiscoveryStatus.DUPLICATE },
      }),
    ),
  );

  console.log(`Applied: ${plan.length} DiscoveryItems marked DUPLICATE.`);
  console.log("No records were deleted. Existing evidence/notes were preserved.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
