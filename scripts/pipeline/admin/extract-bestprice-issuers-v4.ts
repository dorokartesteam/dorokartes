import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APPLY = process.argv.includes("--apply");
const IMPORT = process.argv.includes("--import");

const ROOT = process.cwd();
const INPUT = path.join(
  ROOT,
  "data",
  "discovery",
  "bestprice",
  "bestprice-prepaid-products.csv",
);
const OUT_DIR = path.join(ROOT, "data", "discovery", "bestprice");
const INVENTORY_OUT = path.join(OUT_DIR, "bestprice-inventory-v4.csv");
const ISSUERS_OUT = path.join(OUT_DIR, "bestprice-issuers-v4.csv");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => v.trim()));
}

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

function normalize(s: string) {
  return (s || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractValue(title: string) {
  const t = title.replace(/\./g, "").replace(/,/g, ".");
  const patterns = [
    /(?:€|EUR)\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|EUR|ευρ(?:ώ|ω)?)/i,
    /\b(\d{1,4})\s*(?:euro|euros)\b/i,
  ];

  for (const p of patterns) {
    const m = t.match(p);
    if (m) return m[1];
  }

  return "";
}

function inferCurrency(title: string) {
  return /€|EUR|ευρ|euro/i.test(title) ? "EUR" : "";
}

const THIRD_PARTY: Array<[RegExp, string]> = [
  [/\bsteam\b/i, "Steam"],
  [/\bplaystation\b|\bpsn\b/i, "PlayStation"],
  [/\bxbox\b/i, "Xbox"],
  [/\bnintendo\b/i, "Nintendo"],
  [/\bnetflix\b/i, "Netflix"],
  [/\bspotify\b/i, "Spotify"],
  [/\bapple\b|\bitunes\b/i, "Apple"],
  [/\bgoogle play\b/i, "Google Play"],
  [/\broblox\b/i, "Roblox"],
  [/\bfortnite\b|\bv-?bucks\b/i, "Fortnite"],
  [/\bamazon\b/i, "Amazon"],
  [/\bzalando\b/i, "Zalando"],
  [/\bshein\b/i, "SHEIN"],
];

function inferIssuer(title: string, merchantName: string) {
  for (const [re, issuer] of THIRD_PARTY) {
    if (re.test(title)) {
      return {
        issuer,
        issuerType: "THIRD_PARTY",
        confidence: 0.99,
        reason: "Known third-party issuer found in product title",
      };
    }
  }

  // For BestPrice gift-card listings, the merchant is the issuer by default
  // unless the title explicitly identifies another known third-party brand.
  return {
    issuer: merchantName,
    issuerType: "MERCHANT_OWN",
    confidence: 0.95,
    reason: "No third-party issuer found; merchant treated as issuer",
  };
}

function classifyCardType(title: string, issuerType: string) {
  if (issuerType === "THIRD_PARTY") return "THIRD_PARTY_PREPAID";
  if (/e-?gift|digital|code|κωδικ/i.test(title)) return "DIGITAL";
  return "MERCHANT_GIFT_CARD";
}

async function main() {
  console.log("Dorokartes BestPrice Inventory + Issuer Extractor v4");
  console.log("====================================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Import to DB: ${IMPORT ? "YES" : "NO"}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  if (!fs.existsSync(INPUT)) {
    throw new Error(`Missing input: ${INPUT}`);
  }

  const raw = fs.readFileSync(INPUT, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() ?? [];

  const rows = matrix.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = cells[i] ?? "";
    });
    return row;
  });

  const inventory = rows.map((row, index) => {
    const title = row.title?.trim() ?? "";
    const merchantName = row.merchantName?.trim() ?? "";
    const productUrl = row.productUrl?.trim() ?? "";
    const merchantProfileUrl = row.merchantProfileUrl?.trim() ?? "";
    const officialMerchantUrl = row.officialMerchantUrl?.trim() ?? "";
    const registeredDomain = row.registeredDomain?.trim() ?? "";

    const inferred = inferIssuer(title, merchantName);
    const value = extractValue(title);
    const currency = inferCurrency(title);

    return {
      row_no: index + 1,
      title,
      merchant_name: merchantName,
      bestprice_product_url: productUrl,
      bestprice_merchant_profile_url: merchantProfileUrl,
      official_merchant_url: officialMerchantUrl,
      registered_domain: registeredDomain,
      issuer: inferred.issuer,
      issuer_type: inferred.issuerType,
      issuer_confidence: inferred.confidence.toFixed(2),
      issuer_reason: inferred.reason,
      card_type: classifyCardType(title, inferred.issuerType),
      value,
      currency,
      fingerprint: crypto
        .createHash("sha256")
        .update(`${title}|${merchantName}|${productUrl}`)
        .digest("hex"),
    };
  });

  const issuerMap = new Map<string, {
    issuer: string;
    issuerType: string;
    listings: number;
    merchants: Set<string>;
    officialUrls: Set<string>;
    domains: Set<string>;
    values: Set<string>;
    cardTypes: Set<string>;
    sampleTitle: string;
    sampleUrl: string;
    confidence: number;
  }>();

  for (const row of inventory) {
    const key = normalize(row.issuer);
    if (!key) continue;

    let x = issuerMap.get(key);
    if (!x) {
      x = {
        issuer: row.issuer,
        issuerType: row.issuer_type,
        listings: 0,
        merchants: new Set(),
        officialUrls: new Set(),
        domains: new Set(),
        values: new Set(),
        cardTypes: new Set(),
        sampleTitle: row.title,
        sampleUrl: row.bestprice_product_url,
        confidence: Number(row.issuer_confidence),
      };
      issuerMap.set(key, x);
    }

    x.listings++;
    if (row.merchant_name) x.merchants.add(row.merchant_name);
    if (row.official_merchant_url) x.officialUrls.add(row.official_merchant_url);
    if (row.registered_domain) x.domains.add(row.registered_domain);
    if (row.value) x.values.add(row.value);
    if (row.card_type) x.cardTypes.add(row.card_type);
    x.confidence = Math.max(x.confidence, Number(row.issuer_confidence));
  }

  const issuers = [...issuerMap.values()]
    .sort((a, b) => b.listings - a.listings || a.issuer.localeCompare(b.issuer))
    .map((x) => ({
      issuer: x.issuer,
      issuer_type: x.issuerType,
      listings: x.listings,
      source_merchants: [...x.merchants].join(" | "),
      official_merchant_urls: [...x.officialUrls].join(" | "),
      registered_domains: [...x.domains].join(" | "),
      values: [...x.values].sort((a, b) => Number(a) - Number(b)).join(" | "),
      card_types: [...x.cardTypes].join(" | "),
      confidence: x.confidence.toFixed(2),
      sample_title: x.sampleTitle,
      sample_url: x.sampleUrl,
      review_required: x.confidence < 0.90 ? "YES" : "NO",
    }));

  console.log(`Source rows: ${rows.length}`);
  console.log(`Inventory rows: ${inventory.length}`);
  console.log(`Unique issuers: ${issuers.length}`);
  console.log(`Merchant-owned issuers: ${issuers.filter((x) => x.issuer_type === "MERCHANT_OWN").length}`);
  console.log(`Third-party issuers: ${issuers.filter((x) => x.issuer_type === "THIRD_PARTY").length}`);
  console.log(`Needs issuer review: ${issuers.filter((x) => x.review_required === "YES").length}`);

  console.log("");
  console.log("Top issuer sample:");
  for (const x of issuers.slice(0, 20)) {
    console.log(
      `- ${x.issuer} | ${x.issuer_type} | listings=${x.listings} | domain=${x.registered_domains || "-"}`
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No files written.");
    console.log("Run: npm run pipeline:extract-bestprice-issuers-v4 -- --apply");
    return;
  }

  writeCsv(INVENTORY_OUT, inventory, [
    "row_no",
    "title",
    "merchant_name",
    "bestprice_product_url",
    "bestprice_merchant_profile_url",
    "official_merchant_url",
    "registered_domain",
    "issuer",
    "issuer_type",
    "issuer_confidence",
    "issuer_reason",
    "card_type",
    "value",
    "currency",
    "fingerprint",
  ]);

  writeCsv(ISSUERS_OUT, issuers, [
    "issuer",
    "issuer_type",
    "listings",
    "source_merchants",
    "official_merchant_urls",
    "registered_domains",
    "values",
    "card_types",
    "confidence",
    "sample_title",
    "sample_url",
    "review_required",
  ]);

  let created = 0;
  let skipped = 0;

  if (IMPORT) {
    const { PrismaClient, SourceType, DiscoveryStatus } =
      await import("../../../src/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for --import");

    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });

    try {
      for (const issuer of issuers) {
        const fingerprint = crypto
          .createHash("sha256")
          .update(`BESTPRICE_ISSUER_V4|${normalize(issuer.issuer)}`)
          .digest("hex");

        const existing = await prisma.discoveryItem.findFirst({
          where: { fingerprint },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }

        const possibleOfficialUrl =
          issuer.issuer_type === "MERCHANT_OWN"
            ? issuer.official_merchant_urls.split(" | ")[0] || null
            : null;

        await prisma.discoveryItem.create({
          data: {
            sourceType: SourceType.AGGREGATOR,
            sourceName: "BestPrice Issuer Extraction v4",
            sourceUrl:
              issuer.sample_url ||
              "https://www.bestprice.gr/cat/3134/prepaid-cards.html",
            title: issuer.sample_title || `${issuer.issuer} Gift Card`,
            merchantName: issuer.issuer,
            status: DiscoveryStatus.DISCOVERED,
            possibleOfficialUrl,
            fingerprint,
            notes: [
              `Issuer type: ${issuer.issuer_type}`,
              `BestPrice listings: ${issuer.listings}`,
              `Source merchants: ${issuer.source_merchants}`,
              `Official merchant URLs: ${issuer.official_merchant_urls}`,
              `Registered domains: ${issuer.registered_domains}`,
              `Values: ${issuer.values}`,
              `Card types: ${issuer.card_types}`,
              `Confidence: ${issuer.confidence}`,
            ].join(" | "),
          },
        });

        created++;
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log("");
  console.log("====================================================");
  console.log(`Inventory written: ${INVENTORY_OUT}`);
  console.log(`Issuer list written: ${ISSUERS_OUT}`);
  console.log(`DiscoveryItems created: ${created}`);
  console.log(`DiscoveryItems skipped: ${skipped}`);
  console.log("OpenAI/API calls: 0");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
