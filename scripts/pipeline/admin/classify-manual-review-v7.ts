import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

type Bucket =
  | "RECOVERABLE_BRAND"
  | "THIRD_PARTY_CARD"
  | "GENERIC_OR_GARBAGE"
  | "AMOUNT_SPECIFIC_BUT_MERCHANT_OK"
  | "NEEDS_MANUAL_REVIEW";

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function host(raw?: string | null) {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function baseDomainLabel(raw?: string | null) {
  const h = host(raw);
  if (!h) return null;
  const parts = h.split(".");
  if (parts.length < 2) return h;
  const second = parts[parts.length - 2];
  return second.replace(/[-_]+/g, " ").trim();
}

function amounts(s: string) {
  const out = new Set<number>();
  const x = s.replace(/,/g, ".");
  for (const p of [
    /(?:€|eur(?:o)?s?|euro)\s*(\d+(?:\.\d{1,2})?)/gi,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|eur(?:o)?s?|euro)/gi,
  ]) {
    for (const m of x.matchAll(p)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 10000) out.add(n);
    }
  }
  return [...out].sort((a,b)=>a-b);
}

function removeMoney(s: string) {
  return s
    .replace(/(?:€|eur(?:o)?s?|euro)\s*\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)/gi, " ")
    .replace(/[|–—]+/g, " ")
    .replace(/^\s*[-/]+\s*/g, "")
    .replace(/\s*[-/]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeGiftWords(s: string) {
  return s
    .replace(/\b(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή|ηλεκτρονική\s*δωροκάρτα|ηλεκτρονικη\s*δωροκαρτα)\b/gi, " ")
    .replace(/\b(?:αξίας|αξιας|από|απο)\b/gi, " ")
    .replace(/[|–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCandidate(s: string) {
  return removeGiftWords(removeMoney(s))
    .replace(/^\s*[-/]+\s*/g, "")
    .replace(/\s*[-/]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeneric(name: string) {
  const n = norm(name);
  if (!n || n.length < 3) return true;

  const exact = new Set([
    "gift",
    "gift card",
    "gift voucher",
    "voucher",
    "card",
    "δωροκαρτα",
    "δωροκάρτα",
    "δωροεπιταγη",
    "δωροεπιταγή",
    "ηλεκτρονικη δωροκαρτα",
    "ηλεκτρονική δωροκάρτα",
    "digital gift card",
  ]);

  if (exact.has(n)) return true;
  if (/^\d/.test(n)) return true;
  if (/\b(?:други)\b/i.test(n)) return true;
  if (/^[^a-zα-ωάέήίόύώϊϋΐΰ]+$/i.test(n)) return true;

  return false;
}

function tokenSet(s: string) {
  return new Set(norm(s).split(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/i).filter(Boolean));
}

function overlap(a: string, b: string) {
  const aa = tokenSet(a), bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const x of aa) if (bb.has(x)) common++;
  return common / Math.max(aa.size, bb.size);
}

function looksThirdParty(title: string, merchant: string) {
  const t = norm(title);
  const m = norm(merchant);

  const strongBrands = [
    "nintendo", "playstation", "xbox", "steam", "roblox", "spotify",
    "netflix", "google play", "apple gift", "amazon gift", "paysafecard"
  ];

  if (strongBrands.some((b) => t.includes(b)) && !strongBrands.some((b) => m.includes(b))) {
    return true;
  }

  if (/\beshop\b/i.test(t) && !/\beshop\b/i.test(m)) return true;

  return false;
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: { in: ["ACTIVE", "DRAFT", "HIDDEN"] } },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
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

  const targets = cards.filter((c) => amounts(`${c.merchant.name} ${c.title}`).length > 0);

  const buckets: Record<Bucket, any[]> = {
    RECOVERABLE_BRAND: [],
    THIRD_PARTY_CARD: [],
    GENERIC_OR_GARBAGE: [],
    AMOUNT_SPECIFIC_BUT_MERCHANT_OK: [],
    NEEDS_MANUAL_REVIEW: [],
  };

  for (const card of targets) {
    const merchant = card.merchant.name;
    const title = card.title;
    const vals = amounts(`${merchant} ${title}`);

    const currentGeneric = isGeneric(merchant);
    const cleanedMerchant = cleanCandidate(merchant);
    const domainBrand =
      baseDomainLabel(card.merchant.websiteUrl) ||
      baseDomainLabel(card.officialUrl);

    let bucket: Bucket = "NEEDS_MANUAL_REVIEW";
    let proposedMerchant: string | null = null;
    let reason = "";

    if (looksThirdParty(title, merchant)) {
      bucket = "THIRD_PARTY_CARD";
      reason = "Title appears to name a third-party gift card/product different from merchant.";
    } else if (currentGeneric) {
      const titleCandidate = cleanCandidate(title);
      const domainCandidate = domainBrand ? domainBrand.replace(/\s+/g, " ").trim() : null;

      if (domainCandidate && !isGeneric(domainCandidate)) {
        bucket = "RECOVERABLE_BRAND";
        proposedMerchant = domainCandidate;
        reason = "Merchant name is generic/garbage; merchant brand is recoverable from website domain.";
      } else if (titleCandidate && !isGeneric(titleCandidate) && titleCandidate.length >= 3) {
        bucket = "RECOVERABLE_BRAND";
        proposedMerchant = titleCandidate;
        reason = "Merchant name is generic/garbage; brand-like value recoverable from title.";
      } else {
        bucket = "GENERIC_OR_GARBAGE";
        reason = "Merchant name is generic/garbage and no safe brand recovery was found.";
      }
    } else {
      const merchantPolluted =
        amounts(merchant).length > 0 ||
        /\b(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\b/i.test(merchant);

      if (merchantPolluted) {
        const candidate = cleanCandidate(merchant);

        if (
          candidate &&
          !isGeneric(candidate) &&
          (
            overlap(candidate, title) >= 0.5 ||
            (domainBrand && overlap(candidate, domainBrand) >= 0.5)
          )
        ) {
          bucket = "RECOVERABLE_BRAND";
          proposedMerchant = candidate;
          reason = "Merchant name is denomination/gift-card polluted but brand can be recovered safely.";
        } else {
          bucket = "NEEDS_MANUAL_REVIEW";
          reason = "Merchant name is polluted but automatic brand recovery is not confident enough.";
        }
      } else {
        bucket = "AMOUNT_SPECIFIC_BUT_MERCHANT_OK";
        proposedMerchant = merchant;
        reason = "Merchant name already looks valid; only the gift-card title/URL may be denomination-specific.";
      }
    }

    const item = {
      bucket,
      reason,
      values: vals,
      cardId: card.id,
      merchantId: card.merchant.id,
      merchantName: merchant,
      title,
      websiteUrl: card.merchant.websiteUrl,
      officialUrl: card.officialUrl,
      domainBrand,
      proposedMerchant,
      proposedCanonicalTitle: proposedMerchant ? `${proposedMerchant} Gift Card` : null,
    };

    buckets[bucket].push(item);
  }

  console.log(`Amount-specific cards classified: ${targets.length}`);
  console.log("");

  for (const [name, items] of Object.entries(buckets)) {
    console.log(`=== ${name} (${items.length}) ===`);

    for (const item of items) {
      console.log(
        `${item.merchantName} || ${item.title} || values=${item.values.map((x:number)=>`€${x}`).join(",")} || proposed=${item.proposedMerchant || "—"}`
      );
    }

    console.log("");
  }

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "review-classifier-v7.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: targets.length,
        counts: Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, v.length])),
        buckets,
      },
      null,
      2
    )
  );

  const csvPath = path.join(outDir, "review-classifier-v7.csv");
  const rows = [["bucket","merchant","title","values","proposedMerchant","reason","websiteUrl","officialUrl"]];

  for (const [bucket, items] of Object.entries(buckets)) {
    for (const item of items) {
      rows.push([
        bucket,
        item.merchantName,
        item.title,
        item.values.join("|"),
        item.proposedMerchant || "",
        item.reason,
        item.websiteUrl || "",
        item.officialUrl || "",
      ]);
    }
  }

  const esc = (x:any) => `"${String(x ?? "").replace(/"/g,'""')}"`;
  fs.writeFileSync(csvPath, rows.map(r => r.map(esc).join(",")).join("\n"));

  console.log(`JSON report: ${jsonPath}`);
  console.log(`CSV report:  ${csvPath}`);
  console.log("CLASSIFICATION ONLY — database unchanged.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
