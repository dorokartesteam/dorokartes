import "dotenv/config";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const APPLY = process.argv.includes("--apply");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const MAPPINGS: Record<string, string> = {
  "Camper": "https://www.camper.com/el_GR/men/bags-accessories/e-gift_card/camper-e-gift_card-PR148-001",
  "SHEIN": "https://m.shein.com/roe/pay/giftcard-home/purchase",
  "Mandellos Sports": "https://www.mandellossports.gr/giftcard",
  "Me and Joe": "https://www.meandjoe.com/collections/gift-cards",
  "Aegean Airlines": "https://el.aegeanair.com/flight-deals/gift-card/",
};

async function main() {
  console.log("Dorokartes Kouponia365 Curated Resolver v2");
  console.log("=========================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log("");

  let matched = 0;
  let changed = 0;
  let already = 0;
  let missing = 0;

  for (const [merchantName, url] of Object.entries(MAPPINGS)) {
    const items = await prisma.discoveryItem.findMany({
      where: {
        sourceName: "Kouponia365 Gift Cards",
        merchantName,
      },
      select: {
        id: true,
        merchantName: true,
        possibleOfficialUrl: true,
        status: true,
        notes: true,
      },
    });

    if (items.length === 0) {
      console.log(`[NOT FOUND] ${merchantName}`);
      missing++;
      continue;
    }

    for (const item of items) {
      matched++;

      if (item.possibleOfficialUrl) {
        console.log(
          `[SKIP HAS URL] ${merchantName} -> ${item.possibleOfficialUrl}`,
        );
        already++;
        continue;
      }

      console.log(`[RESOLVE] ${merchantName} -> ${url}`);

      if (APPLY) {
        await prisma.discoveryItem.update({
          where: { id: item.id },
          data: {
            possibleOfficialUrl: url,
            status:
              item.status === DiscoveryStatus.DISCOVERED
                ? DiscoveryStatus.QUEUED
                : item.status,
            notes: [
              item.notes || "",
              "Curated official gift-card URL resolved from public web evidence without OpenAI/API usage.",
              `Resolved URL: ${url}`,
            ]
              .filter(Boolean)
              .join(" | "),
          },
        });

        changed++;
      }
    }
  }

  const remaining = await prisma.discoveryItem.count({
    where: {
      sourceName: "Kouponia365 Gift Cards",
      possibleOfficialUrl: null,
    },
  });

  console.log("");
  console.log("=========================================");
  console.log(`Mappings available: ${Object.keys(MAPPINGS).length}`);
  console.log(`Kouponia365 rows matched: ${matched}`);
  console.log(`Rows already having URL: ${already}`);
  console.log(`Rows changed: ${changed}`);
  console.log(`Mapping names missing in DB: ${missing}`);
  console.log(`Kouponia365 still without URL: ${remaining}`);
  console.log("OpenAI/API calls: 0");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
