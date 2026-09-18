import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDomain } from "tldts";

const APPLY = process.argv.includes("--apply");
const IMPORT_NEW = process.argv.includes("--import-new");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const ROOT = process.cwd();
const INPUT = path.join(
  ROOT,
  "data",
  "discovery",
  "bestprice",
  "bestprice-issuers-v4.csv",
);
const OUT = path.join(
  ROOT,
  "data",
  "discovery",
  "bestprice",
  "bestprice-dedupe-v1.csv",
);

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

function normName(input: string | null | undefined) {
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

function normDomain(input: string | null | undefined) {
  if (!input) return null;
  try {
    const raw = input.includes("://") ? input : `https://${input}`;
    const host = new URL(raw).hostname.toLowerCase();
    return getDomain(host, { allowPrivateDomains: true }) ?? host.replace(/^www\./, "");
  } catch {
    return input.toLowerCase().replace(/^www\./, "").trim() || null;
  }
}

function firstPipe(value: string | null | undefined) {
  return (value || "")
    .split("|")
    .map((x) => x.trim())
    .find(Boolean) || "";
}

async function main() {
  console.log("Dorokartes BestPrice Issuer Dedupe v1");
  console.log("=====================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Import new issuers: ${IMPORT_NEW ? "YES" : "NO"}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  if (!fs.existsSync(INPUT)) {
    throw new Error(
      `Missing ${INPUT}. First run: npm run pipeline:extract-bestprice-issuers-v4 -- --apply`,
    );
  }

  const raw = fs.readFileSync(INPUT, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() ?? [];

  const issuerRows = matrix.map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h.trim()] = cells[i] ?? ""));
    return row;
  });

  const productionMerchants = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      giftCards: {
        select: {
          officialUrl: true,
        },
      },
    },
  });

  const discoveryItems = await prisma.discoveryItem.findMany({
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      sourceName: true,
      status: true,
    },
  });

  const prodByName = new Map<string, typeof productionMerchants[number]>();
  const prodByDomain = new Map<string, typeof productionMerchants[number]>();

  for (const m of productionMerchants) {
    const nk = normName(m.name);
    if (nk && !prodByName.has(nk)) prodByName.set(nk, m);

    const domains = [
      normDomain(m.websiteUrl),
      ...m.giftCards.map((g) => normDomain(g.officialUrl)),
    ].filter((x): x is string => Boolean(x));

    for (const d of domains) {
      if (!prodByDomain.has(d)) prodByDomain.set(d, m);
    }
  }

  const discByName = new Map<string, typeof discoveryItems[number]>();
  const discByDomain = new Map<string, typeof discoveryItems[number]>();

  for (const d of discoveryItems) {
    const nk = normName(d.merchantName);
    if (nk && !discByName.has(nk)) discByName.set(nk, d);

    const domain = normDomain(d.possibleOfficialUrl);
    if (domain && !discByDomain.has(domain)) discByDomain.set(domain, d);
  }

  const results: Record<string, unknown>[] = [];

  let alreadyProduction = 0;
  let alreadyDiscovery = 0;
  let newIssuers = 0;
  let imported = 0;
  let skippedImport = 0;

  for (const row of issuerRows) {
    const issuer = (row.issuer || "").trim();
    const issuerType = (row.issuer_type || "").trim();
    const issuerName = normName(issuer);

    const sourceDomain =
      normDomain(firstPipe(row.registered_domains)) ||
      normDomain(firstPipe(row.official_merchant_urls));

    const prod =
      prodByName.get(issuerName) ||
      (sourceDomain ? prodByDomain.get(sourceDomain) : undefined);

    const disc =
      !prod &&
      (discByName.get(issuerName) ||
        (sourceDomain ? discByDomain.get(sourceDomain) : undefined));

    let bucket = "NEW";
    let matchedName = "";
    let matchedId = "";
    let matchedBy = "";

    if (prod) {
      bucket = "ALREADY_PRODUCTION";
      alreadyProduction++;
      matchedName = prod.name;
      matchedId = prod.id;
      matchedBy = prodByName.get(issuerName)?.id === prod.id ? "NAME" : "DOMAIN";
    } else if (disc) {
      bucket = "ALREADY_DISCOVERY";
      alreadyDiscovery++;
      matchedName = disc.merchantName || "";
      matchedId = disc.id;
      matchedBy = discByName.get(issuerName)?.id === disc.id ? "NAME" : "DOMAIN";
    } else {
      newIssuers++;
    }

    results.push({
      issuer,
      issuer_type: issuerType,
      bucket,
      matched_by: matchedBy,
      matched_name: matchedName,
      matched_id: matchedId,
      listings: row.listings || "",
      official_merchant_urls: row.official_merchant_urls || "",
      registered_domains: row.registered_domains || "",
      values: row.values || "",
      card_types: row.card_types || "",
      confidence: row.confidence || "",
      sample_title: row.sample_title || "",
      sample_url: row.sample_url || "",
    });

    if (APPLY && IMPORT_NEW && bucket === "NEW") {
      const fingerprint = crypto
        .createHash("sha256")
        .update(`BESTPRICE_DEDUPE_V1|${issuerName}`)
        .digest("hex");

      const existing = await prisma.discoveryItem.findFirst({
        where: {
          OR: [
            { fingerprint },
            { merchantName: issuer },
          ],
        },
        select: { id: true },
      });

      if (existing) {
        skippedImport++;
        continue;
      }

      const officialUrl =
        issuerType === "MERCHANT_OWN"
          ? firstPipe(row.official_merchant_urls) || null
          : null;

      await prisma.discoveryItem.create({
        data: {
          sourceType: SourceType.AGGREGATOR,
          sourceName: "BestPrice Issuer Dedupe v1",
          sourceUrl:
            row.sample_url ||
            "https://www.bestprice.gr/cat/3134/prepaid-cards.html",
          title: row.sample_title || `${issuer} Gift Card`,
          merchantName: issuer,
          status: DiscoveryStatus.DISCOVERED,
          possibleOfficialUrl: officialUrl,
          fingerprint,
          notes: [
            `Issuer type: ${issuerType}`,
            `BestPrice listings: ${row.listings || ""}`,
            `Official merchant URLs: ${row.official_merchant_urls || ""}`,
            `Registered domains: ${row.registered_domains || ""}`,
            `Values: ${row.values || ""}`,
            `Card types: ${row.card_types || ""}`,
            `Confidence: ${row.confidence || ""}`,
            "Imported only after production/discovery dedupe.",
          ].join(" | "),
        },
      });

      imported++;
    }
  }

  console.log(`BestPrice issuers: ${issuerRows.length}`);
  console.log(`Already production: ${alreadyProduction}`);
  console.log(`Already discovery: ${alreadyDiscovery}`);
  console.log(`NEW issuers: ${newIssuers}`);

  console.log("");
  console.log("NEW issuer sample:");
  for (const r of results.filter((x) => x.bucket === "NEW").slice(0, 25)) {
    console.log(
      `- ${r.issuer} | ${r.issuer_type} | domain=${r.registered_domains || "-"}`,
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No DB writes and no CSV written.");
    console.log(
      "Run: npm run pipeline:dedupe-bestprice-issuers -- --apply",
    );
    return;
  }

  writeCsv(OUT, results, [
    "issuer",
    "issuer_type",
    "bucket",
    "matched_by",
    "matched_name",
    "matched_id",
    "listings",
    "official_merchant_urls",
    "registered_domains",
    "values",
    "card_types",
    "confidence",
    "sample_title",
    "sample_url",
  ]);

  console.log("");
  console.log(`Dedupe CSV: ${OUT}`);
  console.log(`New DiscoveryItems imported: ${imported}`);
  console.log(`Import skips: ${skippedImport}`);
  console.log("OpenAI/API calls: 0");

  if (!IMPORT_NEW) {
    console.log("");
    console.log(
      'To import ONLY the NEW issuers after reviewing this result:',
    );
    console.log(
      "npm run pipeline:dedupe-bestprice-issuers -- --apply --import-new",
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
