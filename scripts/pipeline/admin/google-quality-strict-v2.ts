import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  PrismaClient,
  SourceType,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");
const IMPORT_SAFE = process.argv.includes("--import-safe");

const INPUT = path.join(
  ROOT,
  "data",
  "discovery",
  "google",
  "google-quality-pass-v1.csv",
);

const OUTPUT = path.join(
  ROOT,
  "data",
  "discovery",
  "google",
  "google-quality-strict-v2.csv",
);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

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
        } else quoted = false;
      } else field += ch;
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
    } else field += ch;
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

function normalizeName(input: string | null | undefined) {
  return (input || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGreekMerchantDomain(domain: string) {
  return /\.gr$|\.com\.gr$/i.test(domain);
}

function hasStrongGiftTitle(title: string) {
  return /\b(gift\s*-?\s*card|giftcard|e-?gift card|gift voucher|gift certificate)\b|δωροκάρ|δωροκαρ|δωροεπιταγ/i.test(title);
}

function hasGiftUrl(url: string) {
  return /\/(gift[-_]?cards?|giftcard|egift|e-gift|gift[-_]?voucher|gift[-_]?certificate|dorokart|dwrokart|doroepitag)/i.test(url || "");
}

function purchaseLike(title: string, url: string) {
  return /€|eur|\b\d{1,4}\s*(€|eur|euro)|buy|purchase|shop|αγορ|τιμή|price/i.test(
    `${title} ${url}`,
  );
}

const KNOWN_PLATFORM_DOMAINS = new Set([
  "shopflix.gr","uquid.com","giftpro.co.uk","travelstories.gr",
  "hoteltreats.com","hotelgift.com","hotelgiftcard.com","giftingowl.com",
  "gogift.com","cardtonic.com","baxity.com","sendvalu.com","giftcardmarket.com",
  "mallgiftcard.com.cy","coincards.com","giftly.com","giftya.com",
  "ubuy.com.gr","directmarket.gr","hellenicvoucher.gr","mytravelgiftcard.gr",
]);

const OBVIOUS_NON_MERCHANT = new Set([
  "jobfind.gr","diginet.gr","i-host.gr","marinet.gr","newsit.gr","in.gr","ot.gr",
  "bovary.gr","mononews.gr","kathimerini.gr","auth.gr","aade.gr","gov.gr",
  "webnode.gr","blogspot.gr","blogspot.com","freelancer.gr","kethea.gr","gtp.gr",
  "e-kyklades.gr","travel.gr","businesswire.com","ons.gov.uk","piraeusbank.gr",
  "visa.gr","mastercard.gr","revolut.com",
]);

function classifyStrict(row: Record<string, string>) {
  const domain = (row.domain || "").trim().toLowerCase();
  const title = row.sample_title || "";
  const url = row.sample_url || "";
  const sourceCount = Number(row.source_count || "0");
  const queryCount = Number(row.query_count || "0");

  const reasons: string[] = [];

  if (OBVIOUS_NON_MERCHANT.has(domain)) {
    return { bucket: "REJECT", score: 0, reasons: ["OBVIOUS_NON_MERCHANT"] };
  }

  if (KNOWN_PLATFORM_DOMAINS.has(domain)) {
    return { bucket: "REVIEW", score: 25, reasons: ["KNOWN_PLATFORM_OR_AGGREGATOR"] };
  }

  const titleGift = hasStrongGiftTitle(title);
  const urlGift = hasGiftUrl(url);
  const purchase = purchaseLike(title, url);
  const greekDomain = isGreekMerchantDomain(domain);

  let score = 0;

  if (titleGift) {
    score += 45;
    reasons.push("STRONG_GIFT_TITLE");
  }

  if (urlGift) {
    score += 35;
    reasons.push("GIFT_URL");
  }

  if (purchase) {
    score += 10;
    reasons.push("PURCHASE_SIGNAL");
  }

  if (greekDomain) {
    score += 5;
    reasons.push("GREEK_DOMAIN");
  }

  if (sourceCount >= 2) {
    score += 10;
    reasons.push("MULTI_SOURCE");
  }

  if (queryCount >= 3) {
    score += 10;
    reasons.push("MULTI_QUERY");
  }

  // Strict safety rule: a direct merchant candidate must have title or URL evidence.
  if (!titleGift && !urlGift) {
    return {
      bucket: "REVIEW",
      score: Math.min(score, 35),
      reasons: [...reasons, "NO_DIRECT_GIFT_EVIDENCE"],
    };
  }

  // Foreign/global domains are not auto-safe unless evidence is very strong.
  if (!greekDomain && !(titleGift && urlGift && purchase)) {
    return {
      bucket: "REVIEW",
      score: Math.min(score, 55),
      reasons: [...reasons, "NON_GR_DOMAIN_REVIEW"],
    };
  }

  if (score >= 70) {
    return { bucket: "HIGH_SAFE", score: Math.min(score, 100), reasons };
  }

  return { bucket: "REVIEW", score: Math.min(score, 69), reasons };
}

async function main() {
  console.log("Dorokartes Google Quality Strict v2");
  console.log("===================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Import HIGH_SAFE: ${IMPORT_SAFE ? "YES" : "NO"}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  if (!fs.existsSync(INPUT)) {
    throw new Error(`Missing ${INPUT}`);
  }

  const raw = fs.readFileSync(INPUT, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() ?? [];

  const rows = matrix.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h.trim()] = cells[i] ?? ""));
    return row;
  });

  const v1High = rows.filter((r) => r.quality === "HIGH");

  const out = v1High.map((r) => {
    const c = classifyStrict(r);
    return {
      ...r,
      strict_bucket: c.bucket,
      strict_score: c.score,
      strict_reasons: c.reasons.join(" | "),
    };
  });

  const safe = out.filter((r) => r.strict_bucket === "HIGH_SAFE");
  const review = out.filter((r) => r.strict_bucket === "REVIEW");
  const reject = out.filter((r) => r.strict_bucket === "REJECT");

  console.log(`v1 HIGH evaluated: ${out.length}`);
  console.log(`HIGH_SAFE: ${safe.length}`);
  console.log(`REVIEW: ${review.length}`);
  console.log(`REJECT: ${reject.length}`);

  console.log("");
  console.log("HIGH_SAFE sample:");
  for (const r of safe.slice(0, 40)) {
    console.log(
      `- ${r.domain} | score=${r.strict_score} | ${r.sample_title || ""}`,
    );
  }

  console.log("");
  console.log("REVIEW sample:");
  for (const r of review.slice(0, 25)) {
    console.log(
      `- ${r.domain} | score=${r.strict_score} | ${r.sample_title || ""}`,
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No CSV and no DB writes.");
    console.log("Run: npm run pipeline:quality-google-strict -- --apply");
    return;
  }

  writeCsv(OUTPUT, out, [
    ...headers,
    "strict_bucket",
    "strict_score",
    "strict_reasons",
  ]);

  let imported = 0;
  let skipped = 0;

  if (IMPORT_SAFE) {
    for (const r of safe) {
      const domain = String(r.domain);
      const guessedName = String(r.guessed_merchant_name || domain);
      const sampleUrl = String(r.sample_url || `https://${domain}`);
      const sampleTitle = String(
        r.sample_title || `${guessedName} gift card candidate`,
      );

      const fingerprint = crypto
        .createHash("sha256")
        .update(`GOOGLE_STRICT_V2|${domain}`)
        .digest("hex");

      const existing = await prisma.discoveryItem.findFirst({
        where: {
          OR: [
            { fingerprint },
            { possibleOfficialUrl: `https://${domain}` },
            { possibleOfficialUrl: `https://www.${domain}` },
            { merchantName: guessedName },
          ],
        },
        select: { id: true },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.discoveryItem.create({
        data: {
          sourceType: SourceType.SEARCH_ENGINE,
          sourceName: "Google Serper Strict v2",
          sourceUrl: sampleUrl,
          title: sampleTitle,
          merchantName: guessedName,
          status: DiscoveryStatus.DISCOVERED,
          possibleOfficialUrl: `https://${domain}`,
          fingerprint,
          notes: [
            `StrictBucket=HIGH_SAFE`,
            `StrictScore=${r.strict_score}`,
            `StrictReasons=${r.strict_reasons}`,
            `OriginalQualityScore=${r.quality_score || ""}`,
            `Queries=${r.queries || ""}`,
            "Auto-imported to DISCOVERED only; still requires normal verification before production.",
          ].join(" | "),
        },
      });

      imported++;
    }
  }

  console.log("");
  console.log(`Strict CSV: ${OUTPUT}`);
  console.log(`HIGH_SAFE imported: ${imported}`);
  console.log(`Import skipped: ${skipped}`);
  console.log("OpenAI/API calls: 0");

  if (!IMPORT_SAFE) {
    console.log("");
    console.log("After reviewing the HIGH_SAFE sample/CSV, import only HIGH_SAFE with:");
    console.log(
      "npm run pipeline:quality-google-strict -- --apply --import-safe",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
