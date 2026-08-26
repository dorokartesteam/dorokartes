import "dotenv/config";
import { getDomain } from "tldts";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isInvalidMerchantName, isReservedSourceLabel } from "../core/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function domainOf(input?: string | null) {
  if (!input) return null;
  try {
    const u = new URL(input);
    return getDomain(u.hostname, { allowPrivateDomains: true })
      ?? u.hostname.replace(/^www\./, "");
  } catch { return null; }
}

async function main() {
  const merchants = await prisma.merchant.findMany({
    include: { giftCards: { include: { variants: true } } },
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  const domains = new Map<string,string>();

  for (const merchant of merchants) {
    if (isInvalidMerchantName(merchant.name) || isReservedSourceLabel(merchant.name)) {
      errors.push(`Invalid merchant name: ${merchant.name}`);
    }
    const d = domainOf(merchant.websiteUrl);
    if (d) {
      const prior = domains.get(d);
      if (prior && prior !== merchant.id) errors.push(`Duplicate production domain: ${d}`);
      domains.set(d, merchant.id);
    }
    for (const card of merchant.giftCards) {
      if (!card.officialUrl) errors.push(`Missing officialUrl: ${card.title}`);
      if (card.variants.length === 0) warnings.push(`No inferred variant: ${card.title}`);
    }
  }

  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);
  warnings.forEach(x => console.log(`WARN ${x}`));
  errors.forEach(x => console.log(`ERROR ${x}`));
  if (errors.length) process.exit(2);
  console.log("Production validation: PASS");
}

main().finally(async () => prisma.$disconnect());
