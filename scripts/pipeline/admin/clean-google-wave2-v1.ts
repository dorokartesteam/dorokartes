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
  "google-serper-wave2-domains-v4.csv",
);

const OUTPUT = path.join(
  ROOT,
  "data",
  "discovery",
  "google",
  "google-wave2-clean-v1.csv",
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
    .replace(/\b(greece|hellas|gr|official|store|shop|online)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function merchantNameFromDomain(domain: string) {
  const first = domain.split(".")[0] || domain;
  return first
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function hasGiftSignal(text: string) {
  return /gift\s*-?\s*card|giftcard|e-?gift|δωροκάρ|δωροκαρ|δωροεπιταγ|gift voucher|gift certificate|voucher δώρου/i.test(text);
}

function hasGiftUrl(url: string) {
  return /\/(gift[-_]?cards?|giftcard|egift|e-gift|gift[-_]?voucher|gift[-_]?certificate|dorokart|dwrokart|doroepitag)/i.test(url || "");
}

function purchaseSignal(text: string) {
  return /€|eur|\b\d{1,4}\s*(€|eur|euro)|buy|purchase|shop|αγορ|τιμή|price/i.test(text);
}

const HARD_BLOCK = new Set([
  "google.gr","google.com","youtube.com","facebook.com","instagram.com","linkedin.com",
  "tiktok.com","pinterest.com","x.com","twitter.com","wikipedia.org",
  "reddit.com","tripadvisor.com","tripadvisor.com.gr","booking.com",
  "amazon.com","ebay.com","quora.com","yelp.com",
  "blogspot.com","blogspot.gr","gov.gr","aade.gr","auth.gr",
  "bankingnews.gr","zougla.gr","thetoc.gr","tanea.gr","skai.gr","popaganda.gr",
  "digitallife.gr","infokids.gr","marketingweek.gr","promocodes.gr",
  "fruugo.gr","workwide.gr","bab.la","wordreference.com","etsy.com",
  "shutterstock.com","zazzle.com","play.google","eneba.com","g2a.com",
  "buysellvouchers.com","blackhawknetwork.com","vouchercodes.co.uk",
  "defencediscountservice.co.uk","roomcard.com","giftcards.ie","giftcard.ie",
  "tillo.com","thankbox.com","more.com","feverup.com",
]);

const PLATFORM_REVIEW = new Set([
  "cosmote.gr","vodafone.gr","ryanair.com","iberia.com","grecotel.com",
  "korres.com","hm.com","guess.eu","lapinkids.com","ethnasia.com",
  "kourbela.com","accessfashion.com","imperialfashion.com","matis-fashion.com",
  "matfashion.com","lucafaloni.com","nh-hotels.com","mallofcyprus.com",
]);

const NOISE_CONTEXT = [
  /\b(news|article|blog|forum|directory|portal|press release|review)\b/i,
  /\b(job|career|employment|university|school|ministry|government)\b/i,
  /\b(pdf|manual|how to|what is|τι είναι)\b/i,
];

function classify(row: Record<string, string>) {
  const domain = (row.domain || "").trim().toLowerCase();
  const title = row.sample_title || "";
  const url = row.sample_url || "";
  const queries = row.queries || "";
  const hits = Number(row.hits || "0");
  const queryCount = Number(row.query_count || "0");

  const reasons: string[] = [];

  if (HARD_BLOCK.has(domain)) {
    return { bucket: "REJECT", score: 0, reasons: ["HARD_BLOCK"] };
  }

  if (PLATFORM_REVIEW.has(domain)) {
    return { bucket: "REVIEW", score: 35, reasons: ["PLATFORM_REVIEW"] };
  }

  if (NOISE_CONTEXT.some((re) => re.test(`${title} ${url}`))) {
    return { bucket: "REJECT", score: 5, reasons: ["NOISE_CONTEXT"] };
  }

  const titleGift = hasGiftSignal(title);
  const urlGift = hasGiftUrl(url);
  const buy = purchaseSignal(`${title} ${url}`);
  const greekDomain = /\.gr$|\.com\.gr$/i.test(domain);

  let score = 0;

  if (titleGift) {
    score += 45;
    reasons.push("GIFT_TITLE");
  }

  if (urlGift) {
    score += 35;
    reasons.push("GIFT_URL");
  }

  if (buy) {
    score += 10;
    reasons.push("PURCHASE_SIGNAL");
  }

  if (greekDomain) {
    score += 10;
    reasons.push("GREEK_DOMAIN");
  }

  if (queryCount >= 2) {
    score += 10;
    reasons.push("MULTI_QUERY");
  }

  if (hits >= 2) {
    score += 5;
    reasons.push("MULTI_HIT");
  }

  if (!titleGift && !urlGift) {
    return {
      bucket: "REVIEW",
      score: Math.min(score, 40),
      reasons: [...reasons, "NO_DIRECT_GIFT_EVIDENCE"],
    };
  }

  if (!greekDomain && !(titleGift && urlGift && buy)) {
    return {
      bucket: "REVIEW",
      score: Math.min(score, 55),
      reasons: [...reasons, "NON_GR_DOMAIN"],
    };
  }

  if (score >= 70) {
    return {
      bucket: "HIGH_SAFE",
      score: Math.min(score, 100),
      reasons,
    };
  }

  return {
    bucket: "REVIEW",
    score: Math.min(score, 69),
    reasons,
  };
}

async function main() {
  console.log("Dorokartes Google Wave2 Clean + Import v1");
  console.log("=========================================");
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

  const existingDiscovery = await prisma.discoveryItem.findMany({
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
    },
  });

  const production = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      giftCards: {
        select: { officialUrl: true },
      },
    },
  });

  const prodDomains = new Set<string>();
  const prodNames = new Set<string>();

  for (const m of production) {
    prodNames.add(normalizeName(m.name));
    if (m.websiteUrl) {
      try {
        prodDomains.add(new URL(m.websiteUrl).hostname.replace(/^www\./, "").toLowerCase());
      } catch {}
    }
    for (const g of m.giftCards) {
      if (!g.officialUrl) continue;
      try {
        prodDomains.add(new URL(g.officialUrl).hostname.replace(/^www\./, "").toLowerCase());
      } catch {}
    }
  }

  const discDomains = new Set<string>();
  const discNames = new Set<string>();

  for (const d of existingDiscovery) {
    discNames.add(normalizeName(d.merchantName));
    for (const rawUrl of [d.possibleOfficialUrl, d.sourceUrl]) {
      if (!rawUrl) continue;
      try {
        discDomains.add(new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase());
      } catch {}
    }
  }

  let alreadyProduction = 0;
  let alreadyDiscovery = 0;

  const out = rows.map((r) => {
    const domain = (r.domain || "").trim().toLowerCase();
    const guessed = merchantNameFromDomain(domain);
    const guessedNorm = normalizeName(guessed);

    if (prodDomains.has(domain) || prodNames.has(guessedNorm)) {
      alreadyProduction++;
      return {
        ...r,
        guessed_merchant_name: guessed,
        wave2_bucket: "ALREADY_PRODUCTION",
        wave2_score: 100,
        wave2_reasons: "DB_MATCH",
      };
    }

    if (discDomains.has(domain) || discNames.has(guessedNorm)) {
      alreadyDiscovery++;
      return {
        ...r,
        guessed_merchant_name: guessed,
        wave2_bucket: "ALREADY_DISCOVERY",
        wave2_score: 100,
        wave2_reasons: "DB_MATCH",
      };
    }

    const c = classify(r);
    return {
      ...r,
      guessed_merchant_name: guessed,
      wave2_bucket: c.bucket,
      wave2_score: c.score,
      wave2_reasons: c.reasons.join(" | "),
    };
  });

  const high = out.filter((r) => r.wave2_bucket === "HIGH_SAFE");
  const review = out.filter((r) => r.wave2_bucket === "REVIEW");
  const reject = out.filter((r) => r.wave2_bucket === "REJECT");

  console.log(`Wave2 domains evaluated: ${rows.length}`);
  console.log(`Already production: ${alreadyProduction}`);
  console.log(`Already discovery: ${alreadyDiscovery}`);
  console.log(`HIGH_SAFE: ${high.length}`);
  console.log(`REVIEW: ${review.length}`);
  console.log(`REJECT: ${reject.length}`);

  console.log("");
  console.log("HIGH_SAFE sample:");
  for (const r of high.slice(0, 40)) {
    console.log(
      `- ${r.domain} | score=${r.wave2_score} | ${r.sample_title || ""}`,
    );
  }

  console.log("");
  console.log("REVIEW sample:");
  for (const r of review.slice(0, 25)) {
    console.log(
      `- ${r.domain} | score=${r.wave2_score} | ${r.sample_title || ""}`,
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No CSV and no DB writes.");
    console.log("Run: npm run pipeline:clean-google-wave2 -- --apply");
    return;
  }

  writeCsv(OUTPUT, out, [
    ...headers,
    "guessed_merchant_name",
    "wave2_bucket",
    "wave2_score",
    "wave2_reasons",
  ]);

  let imported = 0;
  let skipped = 0;

  if (IMPORT_SAFE) {
    for (const r of high) {
      const domain = String(r.domain);
      const guessedName = String(r.guessed_merchant_name || domain);
      const sampleUrl = String(r.sample_url || `https://${domain}`);
      const sampleTitle = String(
        r.sample_title || `${guessedName} gift card candidate`,
      );

      const fingerprint = crypto
        .createHash("sha256")
        .update(`GOOGLE_WAVE2_V1|${domain}`)
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
          sourceName: "Google Serper Wave2 Clean v1",
          sourceUrl: sampleUrl,
          title: sampleTitle,
          merchantName: guessedName,
          status: DiscoveryStatus.DISCOVERED,
          possibleOfficialUrl: `https://${domain}`,
          fingerprint,
          notes: [
            `Wave2Bucket=HIGH_SAFE`,
            `Wave2Score=${r.wave2_score}`,
            `Wave2Reasons=${r.wave2_reasons}`,
            `Queries=${r.queries || ""}`,
            "Imported to DISCOVERED only; requires verification before production.",
          ].join(" | "),
        },
      });

      imported++;
    }
  }

  console.log("");
  console.log(`Wave2 clean CSV: ${OUTPUT}`);
  console.log(`HIGH_SAFE imported: ${imported}`);
  console.log(`Import skipped: ${skipped}`);
  console.log("OpenAI/API calls: 0");

  if (!IMPORT_SAFE) {
    console.log("");
    console.log("After reviewing the PLAN/CSV, import only HIGH_SAFE with:");
    console.log(
      "npm run pipeline:clean-google-wave2 -- --apply --import-safe",
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
