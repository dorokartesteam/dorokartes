import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");

const RULES = [
  {
    sourceUrl: "https://www.germanos.gr/product/germanos-e-gift-card/?productId=29905080",
    status: DiscoveryStatus.DUPLICATE,
    reason:
      "SUPERSEDED_BY_VERIFIED_CANONICAL: replaced by https://www.germanos.gr/category/egift-new/?categoryId=cat4460003",
  },
  {
    sourceUrl: "https://sephora.gr/Gift-Card.html",
    status: DiscoveryStatus.DUPLICATE,
    reason:
      "SUPERSEDED_BY_VERIFIED_CANONICAL: replaced by https://giftcard.sephora.gr/",
  },
  {
    sourceUrl: "https://homemarkt.gr/el/consents/dorokarta-",
    status: DiscoveryStatus.REJECTED,
    reason:
      "NON_CANONICAL_TERMS_PAGE: verified canonical is https://www.homemarkt.gr/el/doroepitages/",
  },
  {
    sourceUrl: "https://hondoscenter.com/el/gift-card.html",
    status: DiscoveryStatus.DUPLICATE,
    reason:
      "SUPERSEDED_BY_VERIFIED_CANONICAL: canonical verified record uses https://www.hondoscenter.com/el/gift-card.html",
  },
];

async function main() {
  console.log("Dorokartes Stale Discovery Cleanup");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  let found = 0;
  let changed = 0;

  for (const rule of RULES) {
    // sourceUrl is NOT unique in the Prisma schema, so use findFirst.
    const item = await prisma.discoveryItem.findFirst({
      where: { sourceUrl: rule.sourceUrl },
      orderBy: { createdAt: "asc" },
    });

    if (!item) {
      console.log(`[MISSING] ${rule.sourceUrl}`);
      continue;
    }

    found++;
    console.log(`[FOUND] ${item.merchantName ?? item.sourceName}`);
    console.log(`  ${item.sourceUrl}`);
    console.log(`  ${item.status} -> ${rule.status}`);
    console.log(`  ${rule.reason}`);

    if (APPLY && item.status !== rule.status) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          status: rule.status,
          processedAt: new Date(),
          notes: `${item.notes ?? ""}${item.notes ? " | " : ""}${rule.reason}`,
        },
      });
      changed++;
    }

    console.log("");
  }

  console.log("====================================");
  console.log(`Matched: ${found}`);
  console.log(`Changed: ${changed}`);

  if (!APPLY) {
    console.log("Dry run only. No DiscoveryItem changed.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
