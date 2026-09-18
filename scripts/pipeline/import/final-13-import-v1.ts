import "dotenv/config";
import { PrismaClient, DiscoveryStatus } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const TARGETS = [
  { domain: "business-travel.gr", merchantName: "Business Travel", officialUrl: "https://business-travel.gr/" },
  { domain: "chania-culture.gr", merchantName: "Chania Culture", officialUrl: "https://shop.chania-culture.gr/" },
  { domain: "clachic.gr", merchantName: "Cla Chic", officialUrl: "https://www.clachic.gr/" },
  { domain: "digas.gr", merchantName: "Digas", officialUrl: "https://www.digas.gr/" },
  { domain: "dioptra.gr", merchantName: "Dioptra", officialUrl: "https://www.dioptra.gr/" },
  { domain: "kois.e-pragma.gr", merchantName: "KOIS Optics", officialUrl: "https://kois.e-pragma.gr/" },
  { domain: "lego.storegreece.gr", merchantName: "LEGO Store Greece", officialUrl: "https://www.lego.storegreece.gr/" },
  { domain: "lvk.ufr.gr", merchantName: "LVK Premium Fitness", officialUrl: "https://lvk.ufr.gr/" },
  { domain: "maccosmetics.gr", merchantName: "MAC Cosmetics Greece", officialUrl: "https://www.maccosmetics.gr/" },
  { domain: "royalgrandhotel.gr", merchantName: "Royal Grand Hotel", officialUrl: "https://royalgrandhotel.gr/" },
  { domain: "santowines.gr", merchantName: "Santo Wines", officialUrl: "https://santowines.gr/" },
  { domain: "sportsdirect.gr", merchantName: "Sports Direct Greece", officialUrl: "https://www.sportsdirect.gr/" },
  { domain: "summitgym.ufr.gr", merchantName: "Summit Gym", officialUrl: "https://summitgym.ufr.gr/" },
];

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

async function main() {
  const [discoveries, merchants] = await Promise.all([
    prisma.discoveryItem.findMany({
      select: {
        id: true,
        merchantName: true,
        possibleOfficialUrl: true,
        sourceUrl: true,
        status: true,
        sourceType: true,
      },
    }),
    prisma.merchant.findMany({
      select: {
        websiteUrl: true,
        giftCards: { select: { officialUrl: true } },
      },
    }),
  ]);

  const prodDomains = new Set<string>();
  for (const m of merchants) {
    for (const u of [m.websiteUrl, ...m.giftCards.map(g => g.officialUrl)]) {
      const d = domainFromUrl(u);
      if (d) prodDomains.add(d);
    }
  }

  const plan: any[] = [];

  for (const t of TARGETS) {
    if (prodDomains.has(t.domain)) {
      plan.push({ ...t, action: "SKIP_PRODUCTION" });
      continue;
    }

    const existing = discoveries.find(d => {
      const d1 = domainFromUrl(d.possibleOfficialUrl);
      const d2 = domainFromUrl(d.sourceUrl);
      return d1 === t.domain || d2 === t.domain;
    });

    if (existing) {
      plan.push({
        ...t,
        action: "UPDATE_EXISTING",
        id: existing.id,
        currentStatus: existing.status,
      });
    } else {
      plan.push({ ...t, action: "CREATE_NEW" });
    }
  }

  console.log("Dorokartes Final 13 Import v1");
  console.log("=============================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log("");

  for (const row of plan) {
    console.log(
      `- ${row.domain} | ${row.merchantName} | ${row.action}` +
      (row.currentStatus ? ` | current=${row.currentStatus}` : "")
    );
  }

  const createCount = plan.filter(x => x.action === "CREATE_NEW").length;
  const updateCount = plan.filter(x => x.action === "UPDATE_EXISTING").length;
  const skipCount = plan.filter(x => x.action === "SKIP_PRODUCTION").length;

  console.log("");
  console.log(`Create new discovery rows: ${createCount}`);
  console.log(`Update existing discovery rows: ${updateCount}`);
  console.log(`Already production / skipped: ${skipCount}`);

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No database changes were made.");
    return;
  }

  const template = discoveries[0];
  if (!template && createCount > 0) {
    throw new Error("No DiscoveryItem exists to reuse sourceType.");
  }

  let created = 0;
  let updated = 0;

  for (const row of plan) {
    if (row.action === "SKIP_PRODUCTION") continue;

    if (row.action === "UPDATE_EXISTING") {
      await prisma.discoveryItem.update({
        where: { id: row.id },
        data: {
          merchantName: row.merchantName,
          title: `${row.merchantName} Gift Card`,
          possibleOfficialUrl: row.officialUrl,
          status: DiscoveryStatus.QUEUED,
          notes:
            `[FINAL_13_IMPORT_V1]\n` +
            `Final historical mining batch\n` +
            `domain=${row.domain}`,
        },
      });
      updated++;
      continue;
    }

    await prisma.discoveryItem.create({
      data: {
        sourceType: template!.sourceType,
        sourceName: "Final 13 Import v1",
        sourceUrl: row.officialUrl,
        title: `${row.merchantName} Gift Card`,
        merchantName: row.merchantName,
        status: DiscoveryStatus.QUEUED,
        possibleOfficialUrl: row.officialUrl,
        notes:
          `[FINAL_13_IMPORT_V1]\n` +
          `Final historical mining batch\n` +
          `domain=${row.domain}`,
      },
    });
    created++;
  }

  console.log("");
  console.log(`Created QUEUED: ${created}`);
  console.log(`Updated to QUEUED: ${updated}`);
  console.log("Next: npm run pipeline:bulk-promote");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
