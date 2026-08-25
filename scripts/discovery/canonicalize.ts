import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type Candidate = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  merchantName: string | null;
  title: string | null;
  status: DiscoveryStatus;
  notes: string | null;
  discoveredAt: Date;
};

function normalize(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&amp;/g, "&")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function merchantKey(item: Candidate) {
  const merchant = normalize(item.merchantName || item.sourceName || "");
  return merchant || new URL(item.sourceUrl).hostname.replace(/^www\./, "");
}

const BAD_PATH_HINTS = [
  "/events/",
  "/event/",
  "/blog/",
  "/article/",
  "/articles/",
  "/news/",
  "/gift-guide",
  "/gift-finder",
  "/spring-gift",
  "/spring-gifts",
  "/holiday-gift",
  "/xmas",
  "/christmas",
  "/gift-wrapping",
  "/packaging",
  "/engraving",
  "/collection/",
  "/promo",
  "/promotion",
  "/contest",
  "/product/dora/",
];

const GOOD_PATH_HINTS = [
  "gift-card",
  "giftcard",
  "gift-cards",
  "e-gift",
  "egift",
  "gift-voucher",
  "gift-vouchers",
  "dorokarta",
  "dwrokarta",
  "doroepitagi",
  "doroepitage",
  "sky-gift",
];

const TERMS_HINTS = [
  "terms",
  "conditions",
  "oroi",
  "terms-and-conditions",
  "oroi-hrisis",
];

const CHECKOUT_HINTS = [
  "checkout",
  "buy-now",
  "/buy/",
];

function classifyUrl(item: Candidate) {
  const url = item.sourceUrl.toLowerCase();

  if (TERMS_HINTS.some((x) => url.includes(x))) return "TERMS";
  if (CHECKOUT_HINTS.some((x) => url.includes(x))) return "CHECKOUT";
  if (BAD_PATH_HINTS.some((x) => url.includes(x))) return "PROMO_OR_CONTENT";
  if (GOOD_PATH_HINTS.some((x) => url.includes(x))) return "CANONICAL_CANDIDATE";

  return "OTHER";
}

function scoreCanonical(item: Candidate) {
  let score = 0;
  const url = item.sourceUrl.toLowerCase();
  const title = normalize(item.title || "");
  const classification = classifyUrl(item);

  if (item.status === DiscoveryStatus.VERIFIED) score += 45;
  if (item.status === DiscoveryStatus.QUEUED) score += 10;

  if (classification === "CANONICAL_CANDIDATE") score += 35;
  if (classification === "CHECKOUT") score += 15;
  if (classification === "TERMS") score -= 20;
  if (classification === "PROMO_OR_CONTENT") score -= 40;

  if (
    title.includes("gift card") ||
    title.includes("δωροκαρτα") ||
    title.includes("δωροεπιταγη") ||
    title.includes("gift voucher")
  ) {
    score += 15;
  }

  if (url.includes("product/dora/")) score -= 50;

  return score;
}

async function main() {
  const items = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: {
        in: [
          DiscoveryStatus.VERIFIED,
          DiscoveryStatus.QUEUED,
        ],
      },
      NOT: {
        sourceName: "Official Website Verifier",
      },
    },
    select: {
      id: true,
      sourceName: true,
      sourceUrl: true,
      merchantName: true,
      title: true,
      status: true,
      notes: true,
      discoveredAt: true,
    },
    orderBy: {
      discoveredAt: "asc",
    },
  });

  const groups = new Map<string, Candidate[]>();

  for (const item of items) {
    const key = merchantKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  let canonicalCount = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const [merchant, group] of groups) {
    const ranked = [...group].sort((a, b) => {
      const scoreDiff = scoreCanonical(b) - scoreCanonical(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.discoveredAt.getTime() - b.discoveredAt.getTime();
    });

    const winner = ranked[0];
    const winnerScore = scoreCanonical(winner);

    if (winnerScore < 20) {
      for (const item of ranked) {
        await prisma.discoveryItem.update({
          where: { id: item.id },
          data: {
            status: DiscoveryStatus.REJECTED,
            processedAt: new Date(),
            notes: `${item.notes ?? ""} | Canonicalizer: rejected group; no strong canonical candidate.`,
          },
        });
        rejected++;
      }

      console.log(`[REJECTED GROUP] ${merchant}`);
      continue;
    }

    canonicalCount++;

    console.log(`[CANONICAL] ${merchant}`);
    console.log(`  ${winner.sourceUrl}`);
    console.log(`  score=${winnerScore} type=${classifyUrl(winner)}`);

    await prisma.discoveryItem.update({
      where: { id: winner.id },
      data: {
        notes: `${winner.notes ?? ""} | Canonicalizer: selected as canonical official gift-card URL.`,
      },
    });

    for (const loser of ranked.slice(1)) {
      const type = classifyUrl(loser);

      if (type === "TERMS" || type === "CHECKOUT") {
        await prisma.discoveryItem.update({
          where: { id: loser.id },
          data: {
            status: DiscoveryStatus.DUPLICATE,
            processedAt: new Date(),
            notes: `${loser.notes ?? ""} | Canonicalizer: supporting ${type.toLowerCase()} URL for canonical ${winner.sourceUrl}.`,
          },
        });
        duplicates++;
        continue;
      }

      if (type === "PROMO_OR_CONTENT") {
        await prisma.discoveryItem.update({
          where: { id: loser.id },
          data: {
            status: DiscoveryStatus.REJECTED,
            processedAt: new Date(),
            notes: `${loser.notes ?? ""} | Canonicalizer: rejected promotional/content URL; canonical is ${winner.sourceUrl}.`,
          },
        });
        rejected++;
        continue;
      }

      await prisma.discoveryItem.update({
        where: { id: loser.id },
        data: {
          status: DiscoveryStatus.DUPLICATE,
          processedAt: new Date(),
          notes: `${loser.notes ?? ""} | Canonicalizer: duplicate/secondary URL; canonical is ${winner.sourceUrl}.`,
        },
      });
      duplicates++;
    }
  }

  console.log("");
  console.log("Canonicalization completed.");
  console.log(`Canonical merchant groups: ${canonicalCount}`);
  console.log(`Marked DUPLICATE: ${duplicates}`);
  console.log(`Marked REJECTED: ${rejected}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
