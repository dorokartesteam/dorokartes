import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  DiscoveryStatus,
  MerchantStatus,
  GiftCardStatus,
  VerificationStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");
const OUT = path.join(
  process.cwd(),
  "data",
  "discovery",
  "bulk-promotion-plan-v1.csv",
);

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

function slugify(input: string) {
  const base = normalizeName(input)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `merchant-${Math.random().toString(36).slice(2, 8)}`;
}

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function canonicalUrl(raw?: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function getGiftCardTitle(merchantName: string, title?: string | null) {
  const t = (title || "").trim();
  if (t && !/^gift\s*card$/i.test(t) && !/^giftcard$/i.test(t)) return t;
  return `${merchantName} Gift Card`;
}

async function uniqueMerchantSlug(base: string) {
  let slug = base;
  let i = 2;
  while (await prisma.merchant.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

async function uniqueGiftCardSlug(base: string) {
  let slug = base;
  let i = 2;
  while (await prisma.giftCard.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

async function main() {
  console.log("Dorokartes Safe Bulk Promotion v1");
  console.log("=================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log("");

  const candidates = await prisma.discoveryItem.findMany({
    where: {
      status: DiscoveryStatus.QUEUED,
    },
    select: {
      id: true,
      merchantName: true,
      title: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      sourceName: true,
      notes: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const production = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      giftCards: {
        select: {
          id: true,
          title: true,
          slug: true,
          officialUrl: true,
        },
      },
    },
  });

  const byDomain = new Map<string, typeof production[number]>();
  const byName = new Map<string, typeof production[number]>();

  for (const m of production) {
    const n = normalizeName(m.name);
    if (n) byName.set(n, m);

    if (m.websiteUrl) {
      const d = domainFromUrl(m.websiteUrl);
      if (d) byDomain.set(d, m);
    }

    for (const g of m.giftCards) {
      if (!g.officialUrl) continue;
      const d = domainFromUrl(g.officialUrl);
      if (d) byDomain.set(d, m);
    }
  }

  const plan: Record<string, unknown>[] = [];
  const seenDomains = new Set<string>();

  let createMerchant = 0;
  let reuseMerchant = 0;
  let skipNoUrl = 0;
  let skipNoMerchant = 0;
  let skipDuplicateDomain = 0;

  for (const item of candidates) {
    const merchantName = (item.merchantName || "").trim();
    const officialUrl = canonicalUrl(item.possibleOfficialUrl);
    const domain = domainFromUrl(officialUrl);

    if (!merchantName) {
      skipNoMerchant++;
      plan.push({
        action: "SKIP_REVIEW",
        discovery_id: item.id,
        merchant_name: "",
        official_domain: domain,
        official_url: officialUrl || "",
        existing_merchant: "",
        gift_card_title: "",
        source_name: item.sourceName,
        reason: "Missing merchantName",
      });
      continue;
    }

    if (!officialUrl || !domain) {
      skipNoUrl++;
      plan.push({
        action: "SKIP_REVIEW",
        discovery_id: item.id,
        merchant_name: merchantName,
        official_domain: "",
        official_url: "",
        existing_merchant: "",
        gift_card_title: getGiftCardTitle(merchantName, item.title),
        source_name: item.sourceName,
        reason: "Missing or invalid possibleOfficialUrl",
      });
      continue;
    }

    if (seenDomains.has(domain)) {
      skipDuplicateDomain++;
      plan.push({
        action: "SKIP_DUPLICATE_DOMAIN",
        discovery_id: item.id,
        merchant_name: merchantName,
        official_domain: domain,
        official_url: officialUrl,
        existing_merchant: "",
        gift_card_title: getGiftCardTitle(merchantName, item.title),
        source_name: item.sourceName,
        reason: "Another QUEUED candidate in this run already uses the same official domain",
      });
      continue;
    }
    seenDomains.add(domain);

    const normalized = normalizeName(merchantName);
    const existing = byDomain.get(domain) || byName.get(normalized);

    if (existing) reuseMerchant++;
    else createMerchant++;

    plan.push({
      action: existing ? "REUSE_MERCHANT_CREATE_CARD" : "CREATE_MERCHANT_AND_CARD",
      discovery_id: item.id,
      merchant_name: merchantName,
      official_domain: domain,
      official_url: officialUrl,
      existing_merchant: existing?.name || "",
      existing_merchant_id: existing?.id || "",
      gift_card_title: getGiftCardTitle(merchantName, item.title),
      source_name: item.sourceName,
      reason: existing
        ? "Merchant already exists by exact domain/name; create/reuse card safely"
        : "New distinct merchant candidate",
    });
  }

  writeCsv(OUT, plan, [
    "action",
    "discovery_id",
    "merchant_name",
    "official_domain",
    "official_url",
    "existing_merchant",
    "existing_merchant_id",
    "gift_card_title",
    "source_name",
    "reason",
  ]);

  const promotable = plan.filter((x) =>
    ["CREATE_MERCHANT_AND_CARD", "REUSE_MERCHANT_CREATE_CARD"].includes(String(x.action)),
  );

  console.log(`QUEUED candidates scanned: ${candidates.length}`);
  console.log(`Promotable candidates: ${promotable.length}`);
  console.log(`- New merchants to create: ${createMerchant}`);
  console.log(`- Existing merchants to reuse: ${reuseMerchant}`);
  console.log(`Skipped / review: ${plan.length - promotable.length}`);
  console.log(`- Missing/invalid official URL: ${skipNoUrl}`);
  console.log(`- Missing merchant name: ${skipNoMerchant}`);
  console.log(`- Duplicate domain inside this run: ${skipDuplicateDomain}`);
  console.log("");
  console.log(`CSV: ${OUT}`);

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No database changes were made.");
    console.log("Run with --apply only after reviewing the summary.");
    return;
  }

  let createdMerchants = 0;
  let reusedMerchants = 0;
  let createdCards = 0;
  let reusedCards = 0;
  let markedVerified = 0;
  let failed = 0;

  for (let i = 0; i < promotable.length; i++) {
    const row = promotable[i];
    const discoveryId = String(row.discovery_id);
    const merchantName = String(row.merchant_name);
    const officialUrl = String(row.official_url);
    const domain = String(row.official_domain);
    const cardTitle = String(row.gift_card_title);

    try {
      await prisma.$transaction(async (tx) => {
        let merchant = row.existing_merchant_id
          ? await tx.merchant.findUnique({
              where: { id: String(row.existing_merchant_id) },
            })
          : null;

        if (!merchant) {
          const baseSlug = slugify(merchantName);
          let slug = baseSlug;
          let n = 2;
          while (await tx.merchant.findUnique({ where: { slug }, select: { id: true } })) {
            slug = `${baseSlug}-${n++}`;
          }

          merchant = await tx.merchant.create({
            data: {
              name: merchantName,
              slug,
              websiteUrl: `https://${domain}`,
              status: MerchantStatus.ACTIVE,
            },
          });
          createdMerchants++;
        } else {
          reusedMerchants++;
        }

        const existingCard =
          (await tx.giftCard.findFirst({
            where: {
              merchantId: merchant.id,
              OR: [
                { officialUrl },
                { title: cardTitle },
              ],
            },
          })) || null;

        if (!existingCard) {
          const baseCardSlug = slugify(`${merchantName}-${cardTitle}`);
          let cardSlug = baseCardSlug;
          let n = 2;
          while (await tx.giftCard.findUnique({ where: { slug: cardSlug }, select: { id: true } })) {
            cardSlug = `${baseCardSlug}-${n++}`;
          }

          await tx.giftCard.create({
            data: {
              merchantId: merchant.id,
              title: cardTitle,
              slug: cardSlug,
              status: GiftCardStatus.ACTIVE,
              verificationStatus: VerificationStatus.VERIFIED,
              officialUrl,
              lastVerifiedAt: new Date(),
            },
          });
          createdCards++;
        } else {
          await tx.giftCard.update({
            where: { id: existingCard.id },
            data: {
              status: GiftCardStatus.ACTIVE,
              verificationStatus: VerificationStatus.VERIFIED,
              officialUrl: existingCard.officialUrl || officialUrl,
              lastVerifiedAt: new Date(),
            },
          });
          reusedCards++;
        }

        await tx.discoveryItem.update({
          where: { id: discoveryId },
          data: {
            status: DiscoveryStatus.VERIFIED,
          },
        });

        markedVerified++;
      }, { timeout: 15000 });

      if ((i + 1) % 25 === 0 || i === promotable.length - 1) {
        console.log(`Progress: ${i + 1}/${promotable.length}`);
      }
    } catch (error) {
      failed++;
      console.error(
        `FAILED ${merchantName} (${discoveryId}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("");
  console.log("APPLY SUMMARY");
  console.log(`Created merchants: ${createdMerchants}`);
  console.log(`Reused merchants: ${reusedMerchants}`);
  console.log(`Created gift cards: ${createdCards}`);
  console.log(`Reused gift cards: ${reusedCards}`);
  console.log(`Discovery marked VERIFIED: ${markedVerified}`);
  console.log(`Failed: ${failed}`);
  console.log("No discovery rows were deleted.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
