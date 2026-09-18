import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

type Bucket =
  | "AUTO_RECOVER_MERCHANT"
  | "TITLE_ONLY_CLEANUP"
  | "GENERAL_URL_CANDIDATE"
  | "POSSIBLE_DUPLICATE_PROGRAM"
  | "THIRD_PARTY_CARD"
  | "GENERIC_OR_UNCLEAR"
  | "CLEAN";

function norm(s: string) {
  return s.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function host(raw?: string | null) {
  if (!raw) return null;
  try { return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase(); }
  catch { return null; }
}

function domainBrand(raw?: string | null) {
  const h = host(raw);
  if (!h) return null;

  const parts = h.split(".");
  const rawLabel = parts.length >= 2 ? parts[parts.length - 2] : parts[0];

  const known: Record<string,string> = {
    carrotstore: "Carrot Store",
    luckyboutique: "Lucky Boutique",
    waragod: "WARAGOD",
    zador: "Zador",
    hobbywood: "Hobbywood",
    petridi: "Petridis Stores",
    momandme: "Mom & Me",
    feedmepetshop: "Feed Me",
    naninails: "NaniNails.gr",
    gatos: "Gatos Shoes",
  };

  return known[rawLabel] || rawLabel
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, m => m.toUpperCase())
    .trim();
}

function hasMoney(s: string) {
  return /(?:€|eur(?:o)?s?|euro)\s*\d|\d+(?:[.,]\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)/i.test(s);
}

function merchantPolluted(s: string) {
  return hasMoney(s) ||
    /\b(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή|ηλεκτρονική\s*δωροκάρτα|ηλεκτρονικη\s*δωροκαρτα)\b/i.test(s);
}

function genericMerchant(s: string) {
  const n = norm(s);
  if (!n || n.length < 3) return true;

  const exact = new Set([
    "gift", "gift card", "gift voucher", "voucher",
    "δωροκαρτα", "δωροκάρτα", "δωροεπιταγη", "δωροεπιταγή",
    "digital gift card", "ηλεκτρονικη δωροκαρτα", "ηλεκτρονική δωροκάρτα"
  ]);

  return exact.has(n) || /^\d/.test(n);
}

function titlePolluted(s: string) {
  return hasMoney(s) ||
    /(?:\|\s*https?:\/\/|::|gift\s*card\s*-\s*gift\s*card|gif?card_?\d+)/i.test(s);
}

function looksThirdParty(title: string, merchant: string) {
  const t = norm(title);
  const m = norm(merchant);

  const brands = [
    "nintendo", "playstation", "xbox", "steam", "roblox",
    "spotify", "netflix", "google play", "apple gift",
    "amazon gift", "paysafecard"
  ];

  return brands.some((b) => t.includes(b) && !m.includes(b));
}

function specificGiftUrl(raw?: string | null) {
  if (!raw) return false;

  try {
    const u = new URL(raw);
    const p = decodeURIComponent(u.pathname).toLowerCase();

    return (
      /gift[-_\/ ]?(?:card|voucher)[-_\/ ]?\d+/i.test(p) ||
      /(?:dorokarta|δωροκαρτα|doroepitagi|voucher)[-_\/ ]?\d+/i.test(p) ||
      /(?:^|[-_/])\d+(?:[-_/]|$)/.test(p)
    );
  } catch {
    return false;
  }
}

function generalParentCandidate(raw?: string | null) {
  if (!raw) return null;

  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";

    const parts = u.pathname.split("/").filter(Boolean);

    for (let i = parts.length - 2; i >= 0; i--) {
      if (/(gift[-_ ]?(?:card|cards|voucher|vouchers)|voucher|δωρο|dwro)/i.test(parts[i])) {
        const c = new URL(u.toString());
        c.pathname = "/" + parts.slice(0, i + 1).join("/") + "/";
        return c.toString();
      }
    }
    return null;
  } catch {
    return null;
  }
}

function compact(s: string) {
  return norm(s).replace(/[^a-z0-9α-ω]/gi, "");
}

function brandSupportedByTitle(title: string, brand: string) {
  const t = compact(title);
  const b = compact(brand);
  return b.length >= 4 && t.includes(b);
}

function duplicateKey(card: any) {
  const d = host(card.merchant.websiteUrl) || host(card.officialUrl);
  return d || `merchant:${card.merchant.id}`;
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      verificationStatus: true,
      officialUrl: true,
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

  const groups = new Map<string, typeof cards>();
  for (const card of cards) {
    const key = duplicateKey(card);
    const arr = groups.get(key) || [];
    arr.push(card);
    groups.set(key, arr);
  }

  const buckets: Record<Bucket, any[]> = {
    AUTO_RECOVER_MERCHANT: [],
    TITLE_ONLY_CLEANUP: [],
    GENERAL_URL_CANDIDATE: [],
    POSSIBLE_DUPLICATE_PROGRAM: [],
    THIRD_PARTY_CARD: [],
    GENERIC_OR_UNCLEAR: [],
    CLEAN: [],
  };

  for (const card of cards) {
    const merchant = card.merchant.name;
    const title = card.title;
    const dBrand =
      domainBrand(card.merchant.websiteUrl) ||
      domainBrand(card.officialUrl);

    const sameDomain = groups.get(duplicateKey(card)) || [];

    let bucket: Bucket = "CLEAN";
    let proposedMerchant: string | null = null;
    let proposedTitle: string | null = null;
    let proposedGeneralUrl: string | null = null;
    let reason = "No obvious issue.";

    if (looksThirdParty(title, merchant)) {
      bucket = "THIRD_PARTY_CARD";
      reason = "Card title looks like a third-party brand/product.";
    } else if (sameDomain.length > 1) {
      bucket = "POSSIBLE_DUPLICATE_PROGRAM";
      reason = `Same merchant/domain has ${sameDomain.length} gift-card rows.`;
    } else if (genericMerchant(merchant) || merchantPolluted(merchant)) {
      if (dBrand && !genericMerchant(dBrand)) {
        const generic = genericMerchant(merchant);
        if (generic || brandSupportedByTitle(title, dBrand)) {
          bucket = "AUTO_RECOVER_MERCHANT";
          proposedMerchant = dBrand;
          proposedTitle = `${dBrand} Gift Card`;
          reason = "Merchant name is generic/polluted and brand is recoverable from domain.";
        } else {
          bucket = "GENERIC_OR_UNCLEAR";
          reason = "Merchant name is polluted, but domain brand is not supported strongly enough.";
        }
      } else {
        bucket = "GENERIC_OR_UNCLEAR";
        reason = "Merchant name is generic/polluted and no reliable domain brand was found.";
      }
    } else if (titlePolluted(title)) {
      bucket = "TITLE_ONLY_CLEANUP";
      proposedMerchant = merchant;
      proposedTitle = `${merchant} Gift Card`;
      reason = "Merchant looks valid; title is amount/format polluted.";
    } else if (specificGiftUrl(card.officialUrl)) {
      const candidate = generalParentCandidate(card.officialUrl);
      if (candidate) {
        bucket = "GENERAL_URL_CANDIDATE";
        proposedGeneralUrl = candidate;
        reason = "Official URL appears denomination/product-specific and has a gift-card parent candidate.";
      } else {
        bucket = "GENERIC_OR_UNCLEAR";
        reason = "Official URL appears specific but no safe general gift-card parent was inferred.";
      }
    }

    buckets[bucket].push({
      bucket,
      reason,
      cardId: card.id,
      merchantId: card.merchant.id,
      merchantName: merchant,
      title,
      officialUrl: card.officialUrl,
      merchantWebsiteUrl: card.merchant.websiteUrl,
      status: card.status,
      verificationStatus: card.verificationStatus,
      proposedMerchant,
      proposedTitle,
      proposedGeneralUrl,
      sameDomainCount: sameDomain.length,
    });
  }

  console.log(`Gift cards classified: ${cards.length}`);
  console.log("");
  console.log("=== FULL CATALOG CLASSIFIER COUNTS ===");
  for (const [name, items] of Object.entries(buckets)) {
    console.log(`${name}: ${items.length}`);
  }

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "full-catalog-classifier-v10.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      total: cards.length,
      counts: Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, v.length])),
      buckets
    }, null, 2)
  );

  const csvPath = path.join(outDir, "full-catalog-classifier-v10.csv");
  const headers = [
    "bucket","merchantName","title","officialUrl","merchantWebsiteUrl",
    "proposedMerchant","proposedTitle","proposedGeneralUrl","reason","sameDomainCount"
  ];
  const esc = (x:any) => `"${String(x ?? "").replace(/"/g,'""')}"`;

  const rows = [headers.map(esc).join(",")];
  for (const [bucket, items] of Object.entries(buckets)) {
    for (const item of items) {
      rows.push(headers.map(h => esc(h === "bucket" ? bucket : item[h])).join(","));
    }
  }
  fs.writeFileSync(csvPath, rows.join("\n"));

  console.log("");
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
