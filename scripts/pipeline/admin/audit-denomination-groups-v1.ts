import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

const LIMIT_ARG = process.argv.find((x) => x.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : undefined;

type Card = {
  id: string;
  title: string;
  slug: string;
  officialUrl: string | null;
  status: string;
  merchant: {
    id: string;
    name: string;
    slug: string;
  };
};

type ParsedTitle = {
  amounts: number[];
  normalizedBase: string;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[|/\\()[\]{}:;,_+*-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmounts(title: string): number[] {
  const out = new Set<number>();
  const normalized = title.replace(/,/g, ".");

  const patterns = [
    /(?:€|eur(?:o)?s?|euro)\s*(\d+(?:\.\d{1,2})?)/gi,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|eur(?:o)?s?|euro)/gi,
    /(?:gift\s*card|giftcard|δωροκαρτα|δωροκάρτα)\s*(?:των\s*)?(\d+(?:\.\d{1,2})?)/gi,
  ];

  for (const pattern of patterns) {
    for (const m of normalized.matchAll(pattern)) {
      const value = Number(m[1]);
      if (Number.isFinite(value) && value > 0 && value <= 10000) out.add(value);
    }
  }

  return [...out].sort((a, b) => a - b);
}

function stripAmountsAndGenericWords(title: string) {
  return normalizeText(title)
    .replace(/\b\d+(?:\.\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)\b/g, " ")
    .replace(/\b(?:€|eur(?:o)?s?|euro)\s*\d+(?:\.\d{1,2})?\b/g, " ")
    .replace(/\bgift\s*card\b/g, " ")
    .replace(/\bgiftcard\b/g, " ")
    .replace(/\bδωροκαρτα\b/g, " ")
    .replace(/\bδωροκάρτα\b/g, " ")
    .replace(/\bvoucher\b/g, " ")
    .replace(/\bcard\b/g, " ")
    .replace(/\bvalue\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTitle(title: string, merchantName: string): ParsedTitle {
  const amounts = parseAmounts(title);
  const merchantNorm = normalizeText(merchantName);

  let base = stripAmountsAndGenericWords(title);

  if (merchantNorm && base.includes(merchantNorm)) {
    base = base.replace(merchantNorm, " ").replace(/\s+/g, " ").trim();
  }

  if (!base) base = merchantNorm || "gift-card";

  return { amounts, normalizedBase: base };
}

function urlBase(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const pathname = u.pathname
      .toLowerCase()
      .replace(/\/+$/, "")
      .replace(/(?:^|[-_/])(?:50|100|150|200|250|300|500|1000)(?:[-_/]|$)/g, "/")
      .replace(/\/+/g, "/");

    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${pathname}`;
  } catch {
    return null;
  }
}

function titleSimilarity(a: ParsedTitle, b: ParsedTitle) {
  if (a.normalizedBase === b.normalizedBase) return 1;

  const aa = new Set(a.normalizedBase.split(" ").filter(Boolean));
  const bb = new Set(b.normalizedBase.split(" ").filter(Boolean));

  if (!aa.size || !bb.size) return 0;

  let common = 0;
  for (const token of aa) if (bb.has(token)) common++;

  return common / Math.max(aa.size, bb.size);
}

function shouldGroup(a: Card, b: Card) {
  if (a.merchant.id !== b.merchant.id) return false;

  const pa = parseTitle(a.title, a.merchant.name);
  const pb = parseTitle(b.title, b.merchant.name);

  const bothHaveAmount = pa.amounts.length > 0 && pb.amounts.length > 0;
  const differentAmounts =
    bothHaveAmount &&
    pa.amounts.join(",") !== pb.amounts.join(",");

  const similarity = titleSimilarity(pa, pb);

  const ua = urlBase(a.officialUrl);
  const ub = urlBase(b.officialUrl);
  const urlsRelated = !!ua && !!ub && (ua === ub || ua.includes(ub) || ub.includes(ua));

  return (
    (differentAmounts && similarity >= 0.55) ||
    (differentAmounts && urlsRelated) ||
    (similarity >= 0.86 && (pa.amounts.length > 0 || pb.amounts.length > 0))
  );
}

function buildGroups(cards: Card[]) {
  const byMerchant = new Map<string, Card[]>();

  for (const card of cards) {
    const arr = byMerchant.get(card.merchant.id) || [];
    arr.push(card);
    byMerchant.set(card.merchant.id, arr);
  }

  const groups: Card[][] = [];

  for (const merchantCards of byMerchant.values()) {
    if (merchantCards.length < 2) continue;

    const parent = merchantCards.map((_, i) => i);

    const find = (x: number): number => {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };

    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    for (let i = 0; i < merchantCards.length; i++) {
      for (let j = i + 1; j < merchantCards.length; j++) {
        if (shouldGroup(merchantCards[i], merchantCards[j])) {
          union(i, j);
        }
      }
    }

    const clusters = new Map<number, Card[]>();
    for (let i = 0; i < merchantCards.length; i++) {
      const root = find(i);
      const arr = clusters.get(root) || [];
      arr.push(merchantCards[i]);
      clusters.set(root, arr);
    }

    for (const cluster of clusters.values()) {
      if (cluster.length >= 2) groups.push(cluster);
    }
  }

  return groups;
}

function recommendedTitle(group: Card[]) {
  const merchant = group[0].merchant.name;
  return `${merchant} Gift Card`;
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT", "HIDDEN"] },
    },
    orderBy: [
      { merchant: { name: "asc" } },
      { title: "asc" },
    ],
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
        },
      },
    },
  }) as Card[];

  const groups = buildGroups(cards);

  console.log(`Gift cards scanned: ${cards.length}`);
  console.log(`Potential denomination groups: ${groups.length}`);
  console.log("");

  const report = groups.map((group, index) => {
    const amounts = [...new Set(group.flatMap((card) => parseAmounts(card.title)))].sort((a, b) => a - b);

    console.log(`GROUP ${index + 1}`);
    console.log(`Merchant: ${group[0].merchant.name}`);
    console.log(`Recommended canonical title: ${recommendedTitle(group)}`);
    console.log(`Detected values: ${amounts.length ? amounts.map((x) => `€${x}`).join(", ") : "none"}`);

    for (const card of group) {
      console.log(`  - ${card.title}`);
      console.log(`    id: ${card.id}`);
      console.log(`    url: ${card.officialUrl || "—"}`);
    }

    console.log("");

    return {
      merchantId: group[0].merchant.id,
      merchant: group[0].merchant.name,
      recommendedCanonicalTitle: recommendedTitle(group),
      detectedValues: amounts,
      cards: group.map((card) => ({
        id: card.id,
        title: card.title,
        slug: card.slug,
        status: card.status,
        officialUrl: card.officialUrl,
      })),
    };
  });

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, "denomination-consolidation-audit.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    scanned: cards.length,
    groups: report,
  }, null, 2));

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
