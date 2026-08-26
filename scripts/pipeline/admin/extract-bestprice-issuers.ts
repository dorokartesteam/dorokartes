import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APPLY = process.argv.includes("--apply");
const IMPORT = process.argv.includes("--import");

const ROOT = process.cwd();

const CANDIDATE_INPUTS = [
  path.join(ROOT, "data", "discovery", "bestprice", "bestprice-giftcards.csv"),
  path.join(ROOT, "data", "discovery", "bestprice", "bestprice-products.csv"),
  path.join(ROOT, "data", "discovery", "bestprice", "bestprice-prepaid-cards.csv"),
  path.join(ROOT, "data", "discovery", "bestprice", "bestprice-items.csv"),
];

const OUT_DIR = path.join(ROOT, "data", "discovery", "bestprice");
const INVENTORY_OUT = path.join(OUT_DIR, "bestprice-inventory-v3.csv");
const ISSUERS_OUT = path.join(OUT_DIR, "bestprice-issuers-v3.csv");

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


function inspectCsvCandidate(file: string) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\\uFEFF/, "");
    const matrix = parseCsv(raw);
    const headers = (matrix[0] ?? []).map((x) => x.trim().toLowerCase());
    const rows = Math.max(0, matrix.length - 1);
    const name = path.basename(file).toLowerCase();

    const hasProductishHeader = headers.some((h) =>
      [
        "title", "product_title", "product", "name", "listing_title",
        "card_title", "product_url", "bestprice_url", "listing_url",
        "source_url", "url"
      ].includes(h)
    );

    const hasSellerHeader = headers.some((h) =>
      ["seller", "seller_name", "merchant", "merchant_name", "shop", "shop_name"].includes(h)
    );

    let score = rows;

    if (hasProductishHeader) score += 500;
    if (hasSellerHeader) score += 100;

    if (/product|listing|giftcard|prepaid-card|item/i.test(name)) score += 300;
    if (/merchant|seller/i.test(name)) score -= 1000;

    return { file, rows, headers, score };
  } catch {
    return null;
  }
}

function firstExistingInput() {
  const dir = path.join(ROOT, "data", "discovery", "bestprice");
  if (!fs.existsSync(dir)) return null;

  const csvs = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(dir, f))
    .filter((p) => !p.endsWith("bestprice-inventory-v3.csv"))
    .filter((p) => !p.endsWith("bestprice-issuers-v3.csv"));

  const inspected = csvs
    .map(inspectCsvCandidate)
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.score - a.score || b.rows - a.rows);

  console.log("BestPrice CSV candidates:");
  for (const x of inspected) {
    console.log(
      "  rows=" +
        x.rows.toString().padStart(4) +
        " score=" +
        x.score.toString().padStart(5) +
        "  " +
        path.basename(x.file)
    );
  }
  console.log("");

  return inspected.find((x) => x.rows >= 100)?.file ?? inspected[0]?.file ?? null;
}

function pick(row: Record<string, string>, names: string[]) {
  for (const n of names) {
    const exact = Object.keys(row).find((k) => k.toLowerCase() === n.toLowerCase());
    if (exact && row[exact]?.trim()) return row[exact].trim();
  }
  return "";
}

function normalizeText(s: string) {
  return s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
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

const GENERIC_WORDS = new Set([
  "gift", "card", "giftcard", "voucher", "prepaid", "code", "digital", "online",
  "κάρτα", "καρτα", "δώρου", "δωρου", "δωροκάρτα", "δωροκαρτα", "δωροεπιταγή",
  "δωροεπιταγη", "ευρώ", "ευρω", "eur", "euro", "euros", "value", "worth",
  "των", "αξίας", "αξιας", "για", "the", "and"
]);

const ISSUER_ALIASES: Array<[RegExp, string]> = [
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
  [/\bikea\b/i, "IKEA"],
  [/\badidas\b/i, "adidas"],
  [/\bnike\b/i, "Nike"],
];

function inferIssuer(title: string, seller: string) {
  const t = normalizeText(title);

  for (const [re, issuer] of ISSUER_ALIASES) {
    if (re.test(t)) return { issuer, method: "KNOWN_ALIAS", confidence: 0.99 };
  }

  // Strip common gift-card/value language and numbers.
  const tokens = t
    .replace(/[€$£]/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\b/g, " ")
    .split(/[\s\-–—_:|/()[\]{}]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !GENERIC_WORDS.has(x.toLowerCase()));

  // If title contains seller name, seller is likely the issuer.
  const sellerNorm = normalizeText(seller).toLowerCase();
  const titleNorm = t.toLowerCase();
  if (sellerNorm && sellerNorm.length >= 3 && titleNorm.includes(sellerNorm)) {
    return { issuer: seller, method: "SELLER_IN_TITLE", confidence: 0.92 };
  }

  // First 1–3 meaningful tokens are usually the brand in BestPrice titles.
  if (tokens.length) {
    const issuer = tokens.slice(0, Math.min(3, tokens.length)).join(" ");
    return { issuer, method: "TITLE_PREFIX", confidence: 0.70 };
  }

  return { issuer: seller || "UNKNOWN", method: "SELLER_FALLBACK", confidence: 0.40 };
}

function classifyType(title: string, issuer: string) {
  const t = `${title} ${issuer}`.toLowerCase();

  if (/steam|playstation|psn|xbox|nintendo|roblox|fortnite|v-?bucks|league of legends|valorant/.test(t)) {
    return "THIRD_PARTY_PREPAID";
  }

  if (/netflix|spotify|apple|itunes|google play|amazon/.test(t)) {
    return "THIRD_PARTY_PREPAID";
  }

  if (/e-?gift|digital|code|κωδικ/.test(t)) {
    return "DIGITAL";
  }

  return "MERCHANT_GIFT_CARD";
}

async function main() {
  console.log("Dorokartes BestPrice Inventory + Issuer Extractor v3.1.1");
  console.log("=====================================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Import to DB: ${IMPORT ? "YES" : "NO"}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  const input = firstExistingInput();

  if (!input) {
    console.error("No BestPrice CSV found under data/discovery/bestprice/");
    console.error("Expected one of:");
    for (const p of CANDIDATE_INPUTS) console.error(`- ${p}`);
    process.exitCode = 2;
    return;
  }

  console.log(`Input: ${input}`);

  const raw = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() ?? [];

  const sourceRows = matrix.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = cells[i] ?? "";
    });
    return row;
  });

  const inventory = sourceRows.map((row, index) => {
    const title = pick(row, [
      "title", "product_title", "product", "name", "listing_title", "card_title"
    ]);
    const bestPriceUrl = pick(row, [
      "url", "product_url", "bestprice_url", "source_url", "listing_url"
    ]);
    const seller = pick(row, [
      "seller", "seller_name", "merchant", "merchant_name", "shop", "shop_name"
    ]);
    const sellerOfficialUrl = pick(row, [
      "seller_official_url", "official_url", "website_url", "seller_url"
    ]);

    const inferred = inferIssuer(title, seller);
    const value = extractValue(title);
    const currency = inferCurrency(title);
    const cardType = classifyType(title, inferred.issuer);

    return {
      row_no: index + 1,
      title,
      bestprice_url: bestPriceUrl,
      seller,
      seller_official_url: sellerOfficialUrl,
      issuer_candidate: inferred.issuer,
      issuer_method: inferred.method,
      issuer_confidence: inferred.confidence.toFixed(2),
      card_type: cardType,
      value,
      currency,
      fingerprint: crypto
        .createHash("sha256")
        .update(`${title}|${bestPriceUrl}|${seller}`)
        .digest("hex"),
    };
  });

  const issuerMap = new Map<string, {
    issuer: string;
    listings: number;
    sellers: Set<string>;
    values: Set<string>;
    cardTypes: Set<string>;
    sampleTitle: string;
    sampleUrl: string;
    maxConfidence: number;
  }>();

  for (const row of inventory) {
    const key = normalizeText(row.issuer_candidate).toLowerCase();
    if (!key || key === "unknown") continue;

    let entry = issuerMap.get(key);
    if (!entry) {
      entry = {
        issuer: row.issuer_candidate,
        listings: 0,
        sellers: new Set(),
        values: new Set(),
        cardTypes: new Set(),
        sampleTitle: row.title,
        sampleUrl: row.bestprice_url,
        maxConfidence: Number(row.issuer_confidence),
      };
      issuerMap.set(key, entry);
    }

    entry.listings++;
    if (row.seller) entry.sellers.add(row.seller);
    if (row.value) entry.values.add(row.value);
    entry.cardTypes.add(row.card_type);
    entry.maxConfidence = Math.max(entry.maxConfidence, Number(row.issuer_confidence));
  }

  const issuers = [...issuerMap.values()]
    .sort((a, b) => b.listings - a.listings || a.issuer.localeCompare(b.issuer))
    .map((x) => ({
      issuer: x.issuer,
      listings: x.listings,
      sellers: [...x.sellers].join(" | "),
      values: [...x.values].sort((a, b) => Number(a) - Number(b)).join(" | "),
      card_types: [...x.cardTypes].join(" | "),
      confidence: x.maxConfidence.toFixed(2),
      sample_title: x.sampleTitle,
      sample_url: x.sampleUrl,
      review_required: x.maxConfidence < 0.90 ? "YES" : "NO",
    }));

  console.log(`Source rows: ${sourceRows.length}`);
  console.log(`Inventory rows: ${inventory.length}`);
  console.log(`Unique issuer candidates: ${issuers.length}`);
  console.log(`High-confidence issuers: ${issuers.filter((x) => Number(x.confidence) >= 0.90).length}`);
  console.log(`Needs issuer review: ${issuers.filter((x) => x.review_required === "YES").length}`);

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No files written.");
    console.log("Run: npm run pipeline:extract-bestprice-issuers -- --apply");
    return;
  }

  writeCsv(INVENTORY_OUT, inventory, [
    "row_no", "title", "bestprice_url", "seller", "seller_official_url",
    "issuer_candidate", "issuer_method", "issuer_confidence", "card_type",
    "value", "currency", "fingerprint"
  ]);

  writeCsv(ISSUERS_OUT, issuers, [
    "issuer", "listings", "sellers", "values", "card_types", "confidence",
    "sample_title", "sample_url", "review_required"
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
          .update(`BESTPRICE_ISSUER|${normalizeText(issuer.issuer).toLowerCase()}`)
          .digest("hex");

        const existing = await prisma.discoveryItem.findFirst({
          where: { fingerprint },
          select: { id: true },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.discoveryItem.create({
          data: {
            sourceType: SourceType.AGGREGATOR,
            sourceName: "BestPrice Issuer Extraction v3",
            sourceUrl: issuer.sample_url || "https://www.bestprice.gr/cat/3134/prepaid-cards.html",
            title: issuer.sample_title || `${issuer.issuer} Gift Card`,
            merchantName: issuer.issuer,
            status: DiscoveryStatus.DISCOVERED,
            possibleOfficialUrl: null,
            fingerprint,
            notes: [
              `BestPrice listings: ${issuer.listings}`,
              `Sellers: ${issuer.sellers}`,
              `Values: ${issuer.values}`,
              `Card types: ${issuer.card_types}`,
              `Issuer confidence: ${issuer.confidence}`,
              `Review required: ${issuer.review_required}`,
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
  console.log("=====================================================");
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
