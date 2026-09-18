import "dotenv/config";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
  MerchantStatus,
  GiftCardStatus,
  VerificationStatus,
  VerificationResult,
  GiftCardVariantType,
  ReviewFlagType,
  ReviewFlagStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isInvalidMerchantName,
  isReservedSourceLabel,
} from "../core/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");
const APPROVE_URL_CHANGES = process.argv.includes("--approve-url-changes");
const REVIEW_DAYS = Number(process.env.REVERIFY_DAYS || "30");

function domainOf(input: string) {
  const u = new URL(input);
  return (
    getDomain(u.hostname, { allowPrivateDomains: true }) ??
    u.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function slugify(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function cleanDomainName(domain: string) {
  const base = domain.split(".")[0];
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function nextReviewDate(from = new Date()) {
  return new Date(from.getTime() + REVIEW_DAYS * 86400_000);
}

async function safeMerchantName(row: any, domain: string) {
  const override = await prisma.manualCanonicalOverride.findUnique({
    where: { merchantDomain: domain },
  });

  const candidates = [
    override?.active ? override.forcedMerchantName : null,
    row.merchantName,
    cleanDomainName(domain),
  ].filter(Boolean) as string[];

  const chosen = candidates.find(
    (x) => !isInvalidMerchantName(x) && !isReservedSourceLabel(x),
  );

  if (!chosen) {
    throw new Error(`No safe merchant name for ${domain}`);
  }

  return chosen.trim();
}

async function latestVerificationMeta(row: any) {
  const manual = await prisma.manualVerificationOverride.findUnique({
    where: { sourceUrl: row.sourceUrl },
  });

  if (manual?.active) {
    return {
      role: manual.forcedPageRole,
      giftCardType: null,
      source: "MANUAL",
    };
  }

  const attempt = await prisma.discoveryVerificationAttempt.findFirst({
    where: { discoveryItemId: row.id },
    orderBy: { checkedAt: "desc" },
  });

  let giftCardType: string | null = null;
  try {
    const ev: any = attempt?.evidence ?? {};
    giftCardType = ev?.giftCardType ?? null;
  } catch {}

  return {
    role: attempt?.pageRole ?? null,
    giftCardType,
    source: attempt?.method ?? "UNKNOWN",
  };
}

function variantType(value: string | null) {
  if (!value) return null;
  if (value === "DIGITAL") return GiftCardVariantType.DIGITAL;
  if (value === "PHYSICAL") return GiftCardVariantType.PHYSICAL;
  if (value === "DIGITAL_AND_PHYSICAL") return GiftCardVariantType.DIGITAL_AND_PHYSICAL;
  if (value === "CORPORATE") return GiftCardVariantType.CORPORATE;
  if (value === "EXPERIENCE") return GiftCardVariantType.EXPERIENCE;
  if (value === "THIRD_PARTY_PREPAID") return GiftCardVariantType.THIRD_PARTY_PREPAID;
  return null;
}

async function main() {
  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: DiscoveryStatus.VERIFIED,
      NOT: { sourceName: "Official Website Verifier" },
    },
    orderBy: { sourceUrl: "asc" },
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const d = domainOf(row.sourceUrl);
    const list = groups.get(d) ?? [];
    list.push(row);
    groups.set(d, list);
  }

  const conflicts = [...groups.entries()].filter(([, list]) => list.length > 1);
  if (conflicts.length) {
    console.error("ABORT: multiple VERIFIED rows remain in canonical domains.");
    for (const [domain, list] of conflicts) {
      console.error(`- ${domain}`);
      list.forEach((x) => console.error(`  ${x.sourceUrl}`));
    }
    console.error("Run pipeline:canonicalize -- --apply first.");
    process.exit(2);
  }

  const existingMerchants = await prisma.merchant.findMany({
    include: { giftCards: true },
  });

  let createdMerchants = 0;
  let createdCards = 0;
  let updatedCards = 0;
  let urlReviewFlags = 0;

  console.log("Dorokartes Stable Promoter");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Approve URL changes: ${APPROVE_URL_CHANGES}`);
  console.log(`Canonical domains: ${groups.size}`);
  console.log("");

  for (const [domain, [row]] of [...groups.entries()].sort()) {
    const name = await safeMerchantName(row, domain);
    const meta = await latestVerificationMeta(row);

    console.log(`=== ${name} (${domain}) ===`);
    console.log(`Official URL: ${row.sourceUrl}`);
    console.log(`Verification role: ${meta.role ?? "-"}`);

    // Domain is the primary production merchant identity key during promotion.
    let merchant = existingMerchants.find((m) => {
      if (!m.websiteUrl) return false;
      try { return domainOf(m.websiteUrl) === domain; } catch { return false; }
    }) ?? null;

    if (!merchant) {
      const merchantSlug = slugify(name);

      if (!APPLY) {
        console.log(`WOULD CREATE merchant=${name}`);
        console.log("");
        continue;
      }

      merchant = await prisma.merchant.create({
        data: {
          name,
          slug: merchantSlug,
          websiteUrl: new URL(row.sourceUrl).origin,
          country: "GR",
          status: MerchantStatus.ACTIVE,
        },
        include: { giftCards: true },
      });
      existingMerchants.push(merchant);
      createdMerchants++;
    }

    const cardTitle = `${name} Gift Card`;
    const cardSlug = `${slugify(name)}-gift-card`;
    let card = merchant.giftCards[0] ?? null;

    if (card?.officialUrl && card.officialUrl !== row.sourceUrl) {
      console.log(`URL CHANGE: ${card.officialUrl} -> ${row.sourceUrl}`);

      if (!APPROVE_URL_CHANGES) {
        console.log("REVIEW REQUIRED: production canonical URL change");

        if (APPLY) {
          const existingFlag = await prisma.productionReviewFlag.findFirst({
            where: {
              giftCardId: card.id,
              type: ReviewFlagType.CANONICAL_URL_CHANGED,
              status: ReviewFlagStatus.OPEN,
              newValue: row.sourceUrl,
            },
          });

          if (!existingFlag) {
            await prisma.productionReviewFlag.create({
              data: {
                giftCardId: card.id,
                type: ReviewFlagType.CANONICAL_URL_CHANGED,
                oldValue: card.officialUrl,
                newValue: row.sourceUrl,
                reason:
                  `Verified canonical DiscoveryItem ${row.id} proposes a new official URL.`,
              },
            });
            urlReviewFlags++;
          }
        }

        console.log("");
        continue;
      }
    }

    if (!APPLY) {
      console.log(card ? "WOULD UPDATE" : "WOULD CREATE GIFT CARD");
      console.log("");
      continue;
    }

    const verifiedAt = row.processedAt ?? new Date();

    if (!card) {
      card = await prisma.giftCard.create({
        data: {
          merchantId: merchant.id,
          title: cardTitle,
          slug: cardSlug,
          status: GiftCardStatus.ACTIVE,
          verificationStatus: VerificationStatus.VERIFIED,
          officialUrl: row.sourceUrl,
          lastVerifiedAt: verifiedAt,
          nextReviewAt: nextReviewDate(verifiedAt),
        },
      });
      createdCards++;
    } else {
      card = await prisma.giftCard.update({
        where: { id: card.id },
        data: {
          title: cardTitle,
          status: GiftCardStatus.ACTIVE,
          verificationStatus: VerificationStatus.VERIFIED,
          officialUrl: row.sourceUrl,
          lastVerifiedAt: verifiedAt,
          nextReviewAt: nextReviewDate(verifiedAt),
        },
      });
      updatedCards++;
    }

    // Source lineage: source labels are metadata ONLY, never merchant identity.
    const source = await prisma.sourceRecord.findFirst({
      where: {
        giftCardId: card.id,
        sourceType: SourceType.OFFICIAL,
        sourceUrl: row.sourceUrl,
      },
    });

    if (!source) {
      await prisma.sourceRecord.create({
        data: {
          sourceType: SourceType.OFFICIAL,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          merchantId: merchant.id,
          giftCardId: card.id,
          rawTitle: row.title,
          firstSeenAt: row.discoveredAt,
          lastSeenAt: new Date(),
          active: true,
        },
      });
    } else {
      await prisma.sourceRecord.update({
        where: { id: source.id },
        data: { lastSeenAt: new Date(), active: true, rawTitle: row.title },
      });
    }

    const vt = variantType(meta.giftCardType);
    if (vt) {
      const existingVariant = await prisma.giftCardVariant.findFirst({
        where: { giftCardId: card.id, type: vt },
      });

      if (!existingVariant) {
        await prisma.giftCardVariant.create({
          data: {
            giftCardId: card.id,
            name: vt === GiftCardVariantType.DIGITAL ? "Digital" : null,
            type: vt,
            purchaseUrl: row.sourceUrl,
            active: true,
          },
        });
      }
    }

    const existingEvent = await prisma.verificationEvent.findFirst({
      where: {
        giftCardId: card.id,
        result: VerificationResult.PASSED,
        url: row.sourceUrl,
      },
    });

    if (!existingEvent) {
      await prisma.verificationEvent.create({
        data: {
          giftCardId: card.id,
          result: VerificationResult.PASSED,
          url: row.sourceUrl,
          notes:
            `Promoted from DiscoveryItem ${row.id}; role=${meta.role ?? "UNKNOWN"}; verificationSource=${meta.source}.`,
          checkedAt: verifiedAt,
        },
      });
    }

    console.log("PROMOTED");
    console.log("");
  }

  console.log("====================================");
  console.log(`Merchants created: ${createdMerchants}`);
  console.log(`GiftCards created: ${createdCards}`);
  console.log(`GiftCards updated: ${updatedCards}`);
  console.log(`URL review flags created: ${urlReviewFlags}`);

  if (!APPLY) {
    console.log("Dry run only. Production data unchanged.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
