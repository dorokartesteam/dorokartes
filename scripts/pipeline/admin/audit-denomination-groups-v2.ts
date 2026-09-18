import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const LIMIT_ARG = process.argv.find((x) => x.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : undefined;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[|/\\()[\]{}:;,_+*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDomain(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function parseAmounts(value: string): number[] {
  const out = new Set<number>();
  const s = value.replace(/,/g, ".");
  const patterns = [
    /(?:€|eur(?:o)?s?|euro)\s*(\d+(?:\.\d{1,2})?)/gi,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|eur(?:o)?s?|euro)/gi,
    /(?:gift\s*card|giftcard|voucher|δωροκαρτα|δωροκάρτα)\s*(?:των\s*)?(\d+(?:\.\d{1,2})?)/gi,
  ];

  for (const p of patterns) {
    for (const m of s.matchAll(p)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 10000) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function stripGeneric(value: string) {
  return normalizeText(value)
    .replace(/\b\d+(?:\.\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)\b/g, " ")
    .replace(/\b(?:€|eur(?:o)?s?|euro)\s*\d+(?:\.\d{1,2})?\b/g, " ")
    .replace(/\bgift\s*card\b/g, " ")
    .replace(/\bgiftcard\b/g, " ")
    .replace(/\bvoucher\b/g, " ")
    .replace(/\bδωροκαρτα\b/g, " ")
    .replace(/\bδωροκάρτα\b/g, " ")
    .replace(/\bcard\b/g, " ")
    .replace(/\bvalue\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMerchantName(name: string) {
  return stripGeneric(name)
    .replace(/^\d+(?:\.\d{1,2})?\s+/g, "")
    .replace(/\s+\d+(?:\.\d{1,2})?$/g, "")
    .trim();
}

function tokenSimilarity(a: string, b: string) {
  const aa = new Set(a.split(" ").filter(Boolean));
  const bb = new Set(b.split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;

  let common = 0;
  for (const token of aa) if (bb.has(token)) common++;
  return common / Math.max(aa.size, bb.size);
}

function groupingKey(card: any) {
  const domain =
    normalizeDomain(card.merchant.websiteUrl) ||
    normalizeDomain(card.officialUrl);

  if (domain) return `domain:${domain}`;
  return `name:${cleanMerchantName(card.merchant.name)}`;
}

function likelySameProgram(a: any, b: any) {
  const amountsA = parseAmounts(`${a.merchant.name} ${a.title}`);
  const amountsB = parseAmounts(`${b.merchant.name} ${b.title}`);

  if (!amountsA.length || !amountsB.length) return false;
  if (amountsA.join(",") === amountsB.join(",")) return false;

  const merchantA = cleanMerchantName(a.merchant.name);
  const merchantB = cleanMerchantName(b.merchant.name);
  const titleA = stripGeneric(a.title);
  const titleB = stripGeneric(b.title);

  const domainA =
    normalizeDomain(a.merchant.websiteUrl) ||
    normalizeDomain(a.officialUrl);
  const domainB =
    normalizeDomain(b.merchant.websiteUrl) ||
    normalizeDomain(b.officialUrl);

  const sameDomain = !!domainA && !!domainB && domainA === domainB;

  return (
    sameDomain ||
    merchantA === merchantB ||
    tokenSimilarity(merchantA, merchantB) >= 0.72 ||
    tokenSimilarity(titleA, titleB) >= 0.72
  );
}

function buildGroups(cards: any[]) {
  const buckets = new Map<string, any[]>();

  for (const card of cards) {
    const key = groupingKey(card);
    const arr = buckets.get(key) || [];
    arr.push(card);
    buckets.set(key, arr);
  }

  const groups: any[][] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    const parent = bucket.map((_, i) => i);
    const find = (x: number): number => {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (likelySameProgram(bucket[i], bucket[j])) union(i, j);
      }
    }

    const clusters = new Map<number, any[]>();
    for (let i = 0; i < bucket.length; i++) {
      const root = find(i);
      const arr = clusters.get(root) || [];
      arr.push(bucket[i]);
      clusters.set(root, arr);
    }

    for (const cluster of clusters.values()) {
      const distinctAmounts = new Set(
        cluster.flatMap((c) => parseAmounts(`${c.merchant.name} ${c.title}`))
      );
      if (cluster.length >= 2 && distinctAmounts.size >= 2) groups.push(cluster);
    }
  }

  return groups;
}

function canonicalMerchantName(group: any[]) {
  const names = group
    .map((c) => cleanMerchantName(c.merchant.name))
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);
  return names[0] || group[0].merchant.name;
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: { in: ["ACTIVE", "DRAFT", "HIDDEN"] } },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    ...(LIMIT ? { take: LIMIT } : {}),
    select: {
      id: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
        },
      },
    },
  });

  const groups = buildGroups(cards);

  console.log(`Gift cards scanned: ${cards.length}`);
  console.log(`Potential denomination groups: ${groups.length}`);
  console.log("");

  const report = groups.map((group, index) => {
    const values = [...new Set(
      group.flatMap((c) => parseAmounts(`${c.merchant.name} ${c.title}`))
    )].sort((a, b) => a - b);

    const canonicalName = canonicalMerchantName(group);
    const domains = [...new Set(
      group
        .map((c) =>
          normalizeDomain(c.merchant.websiteUrl) ||
          normalizeDomain(c.officialUrl)
        )
        .filter(Boolean)
    )];

    console.log(`GROUP ${index + 1}`);
    console.log(`Canonical merchant: ${canonicalName}`);
    console.log(`Domains: ${domains.join(", ") || "—"}`);
    console.log(`Detected values: ${values.map((x) => `€${x}`).join(", ")}`);
    console.log(`Suggested card title: ${canonicalName} Gift Card`);

    for (const card of group) {
      console.log(`  - merchant: ${card.merchant.name}`);
      console.log(`    title: ${card.title}`);
      console.log(`    cardId: ${card.id}`);
      console.log(`    merchantId: ${card.merchant.id}`);
      console.log(`    merchantWebsite: ${card.merchant.websiteUrl || "—"}`);
      console.log(`    officialUrl: ${card.officialUrl || "—"}`);
    }
    console.log("");

    return {
      canonicalMerchant: canonicalName,
      domains,
      detectedValues: values,
      suggestedGiftCardTitle: `${canonicalName} Gift Card`,
      records: group.map((card) => ({
        cardId: card.id,
        merchantId: card.merchant.id,
        merchantName: card.merchant.name,
        title: card.title,
        status: card.status,
        merchantWebsite: card.merchant.websiteUrl,
        officialUrl: card.officialUrl,
      })),
    };
  });

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "denomination-consolidation-audit-v2.json");

  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scanned: cards.length,
        groupCount: report.length,
        groups: report,
      },
      null,
      2
    )
  );

  console.log(`Report written: ${outFile}`);
  console.log("AUDIT ONLY — no database changes were made.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
