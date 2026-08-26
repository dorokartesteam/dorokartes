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
const IMPORT_HIGH = process.argv.includes("--import-high");

const INPUT = path.join(
  ROOT,
  "data",
  "discovery",
  "google",
  "google-clean-dedupe-v1.csv",
);
const OUTPUT = path.join(
  ROOT,
  "data",
  "discovery",
  "google",
  "google-quality-pass-v1.csv",
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

function giftSignal(text: string) {
  return /gift\s*-?\s*card|giftcard|e-?gift|δωροκάρ|δωροκαρ|δωροεπιταγ|gift voucher|gift certificate|voucher δώρου/i.test(text);
}

function strongPurchaseSignal(text: string) {
  return /buy|purchase|shop|add to cart|αγορ|τιμή|price|€|eur|gift card \d+|δωροκάρτα \d+/i.test(text);
}

function giftPath(url: string) {
  return /\/(gift[-_]?cards?|giftcard|egift|e-gift|dorokart|dwrokart|doroepitag|gift[-_]?voucher)/i.test(url || "");
}

function termsOrFaqPath(url: string) {
  return /\/(faq|terms|oroi|conditions|help|support)(\/|$|\?)/i.test(url || "");
}

const HARD_NOISE_DOMAINS = new Set([
  "taxheaven.gr","jobfind.gr","diginet.gr","i-host.gr","marinet.gr",
  "newsit.gr","in.gr","ot.gr","bovary.gr","mononews.gr","kathimerini.gr",
  "auth.gr","aade.gr","gov.gr","webnode.gr","blogspot.gr","blogspot.com",
  "freelancer.gr","kethea.gr","gtp.gr","e-kyklades.gr","travel.gr",
]);

const NOISE_CONTEXT = [
  /\b(pdf|manual|barcode|press release|article|news|blog|forum|directory)\b/i,
  /\b(φορολογ|λογαριασμ|νομοθεσ|υπουργ|πανεπιστ|government|ministry)\b/i,
  /\bhow to\b|\bwhat is\b|\bτι είναι\b/i,
];

function classify(row: Record<string, string>) {
  const domain = (row.domain || "").toLowerCase().trim();
  const title = row.sample_title || "";
  const url = row.sample_url || "";
  const queries = row.queries || "";
  const queryCount = Number(row.query_count || "0");
  const context = `${title} ${url} ${queries}`;

  const reasons: string[] = [];
  let score = 0;

  if (HARD_NOISE_DOMAINS.has(domain)) {
    return { quality: "REJECT", score: 0, reasons: ["HARD_NOISE_DOMAIN"] };
  }

  if (NOISE_CONTEXT.some((re) => re.test(`${title} ${url}`))) {
    return { quality: "REJECT", score: 5, reasons: ["NOISE_CONTEXT"] };
  }

  if (giftSignal(title)) {
    score += 45;
    reasons.push("GIFT_SIGNAL_TITLE");
  }

  if (giftPath(url)) {
    score += 35;
    reasons.push("GIFT_PATH");
  }

  if (strongPurchaseSignal(title)) {
    score += 10;
    reasons.push("PURCHASE_SIGNAL");
  }

  if (queryCount >= 2) {
    score += 10;
    reasons.push(`MULTI_QUERY_${queryCount}`);
  }

  if (queryCount >= 4) {
    score += 5;
    reasons.push("HIGH_QUERY_REPEAT");
  }

  if (termsOrFaqPath(url) && giftSignal(title + " " + url)) {
    score += 5;
    reasons.push("TERMS_OR_FAQ_GIFT_EVIDENCE");
  }

  // A result with no title/url evidence but only a matching search query remains review-only.
  if (!giftSignal(title) && !giftPath(url)) {
    score -= 20;
    reasons.push("QUERY_ONLY_EVIDENCE");
  }

  if (/\.gr$|\.com\.gr$/i.test(domain)) {
    score += 5;
    reasons.push("GREEK_DOMAIN");
  }

  score = Math.max(0, Math.min(100, score));

  let quality: "HIGH" | "MEDIUM" | "REJECT";
  if (score >= 55) quality = "HIGH";
  else if (score >= 20) quality = "MEDIUM";
  else quality = "REJECT";

  return { quality, score, reasons };
}

async function main() {
  console.log("Dorokartes Google Quality Pass v1");
  console.log("=================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Import HIGH: ${IMPORT_HIGH ? "YES" : "NO"}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  if (!fs.existsSync(INPUT)) {
    throw new Error(`Missing ${INPUT}`);
  }

  const raw = fs.readFileSync(INPUT, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() ?? [];

  const sourceRows = matrix.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h.trim()] = cells[i] ?? ""));
    return row;
  });

  const newRows = sourceRows.filter((r) => r.bucket === "NEW");

  const out = newRows.map((r) => {
    const c = classify(r);
    return {
      ...r,
      quality: c.quality,
      quality_score: c.score,
      quality_reasons: c.reasons.join(" | "),
    };
  });

  const high = out.filter((r) => r.quality === "HIGH");
  const medium = out.filter((r) => r.quality === "MEDIUM");
  const reject = out.filter((r) => r.quality === "REJECT");

  console.log(`NEW candidates evaluated: ${out.length}`);
  console.log(`HIGH confidence: ${high.length}`);
  console.log(`MEDIUM / manual review: ${medium.length}`);
  console.log(`REJECT / obvious noise: ${reject.length}`);

  console.log("");
  console.log("HIGH sample:");
  for (const r of high.slice(0, 30)) {
    console.log(
      `- ${r.domain} | score=${r.quality_score} | ${r.sample_title || ""}`,
    );
  }

  console.log("");
  console.log("MEDIUM sample:");
  for (const r of medium.slice(0, 20)) {
    console.log(
      `- ${r.domain} | score=${r.quality_score} | ${r.sample_title || ""}`,
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No CSV and no DB writes.");
    console.log("Run: npm run pipeline:quality-google-harvest -- --apply");
    return;
  }

  const outHeaders = [
    ...headers,
    "quality",
    "quality_score",
    "quality_reasons",
  ];
  writeCsv(OUTPUT, out, outHeaders);

  let imported = 0;
  let skipped = 0;

  if (IMPORT_HIGH) {
    for (const r of high) {
      const domain = String(r.domain);
      const guessedName = String(r.guessed_merchant_name || domain);
      const sampleUrl = String(r.sample_url || `https://${domain}`);
      const sampleTitle = String(
        r.sample_title || `${guessedName} gift card candidate`,
      );

      const fingerprint = crypto
        .createHash("sha256")
        .update(`GOOGLE_QUALITY_V1|${domain}`)
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
          sourceName: "Google Serper Quality Pass v1",
          sourceUrl: sampleUrl,
          title: sampleTitle,
          merchantName: guessedName,
          status: DiscoveryStatus.DISCOVERED,
          possibleOfficialUrl: `https://${domain}`,
          fingerprint,
          notes: [
            `Quality=HIGH`,
            `Score=${r.quality_score}`,
            `Reasons=${r.quality_reasons}`,
            `Google queries=${r.queries || ""}`,
            "Candidate only; requires normal verification before production.",
          ].join(" | "),
        },
      });

      imported++;
    }
  }

  console.log("");
  console.log(`Quality CSV: ${OUTPUT}`);
  console.log(`HIGH imported: ${imported}`);
  console.log(`Import skipped: ${skipped}`);
  console.log("OpenAI/API calls: 0");

  if (!IMPORT_HIGH) {
    console.log("");
    console.log("After reviewing HIGH sample/CSV, import only HIGH with:");
    console.log(
      "npm run pipeline:quality-google-harvest -- --apply --import-high",
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
