import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDomain } from "tldts";

const APPLY = process.argv.includes("--apply");

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
  return (value || "").split("|").map((x) => x.trim()).find(Boolean) || "";
}

function appendNote(existing: string | null, addition: string) {
  const current = (existing || "").trim();
  if (current.includes("[BESTPRICE_V1]")) return current;
  return current ? `${current} | ${addition}` : addition;
}

async function main() {
  console.log("Dorokartes BestPrice Merge Evidence v1");
  console.log("======================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  if (!fs.existsSync(INPUT)) {
    throw new Error(
      `Missing ${INPUT}. Run bestprice issuer v4 with --apply first.`,
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

  const discoveryItems = await prisma.discoveryItem.findMany({
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      notes: true,
      sourceName: true,
    },
  });

  const byName = new Map<string, typeof discoveryItems[number]>();
  const byDomain = new Map<string, typeof discoveryItems[number]>();

  for (const item of discoveryItems) {
    const nk = normName(item.merchantName);
    if (nk && !byName.has(nk)) byName.set(nk, item);

    const d = normDomain(item.possibleOfficialUrl);
    if (d && !byDomain.has(d)) byDomain.set(d, item);
  }

  let matched = 0;
  let unmatched = 0;
  let wouldSetUrl = 0;
  let wouldAppendEvidence = 0;
  let updated = 0;

  const unmatchedNames: string[] = [];

  for (const row of issuerRows) {
    const issuer = (row.issuer || "").trim();
    const issuerName = normName(issuer);
    const issuerType = (row.issuer_type || "").trim();

    const candidateUrl =
      issuerType === "MERCHANT_OWN"
        ? firstPipe(row.official_merchant_urls) || null
        : null;

    const sourceDomain =
      normDomain(firstPipe(row.registered_domains)) ||
      normDomain(candidateUrl);

    const item =
      byName.get(issuerName) ||
      (sourceDomain ? byDomain.get(sourceDomain) : undefined);

    if (!item) {
      unmatched++;
      unmatchedNames.push(issuer);
      continue;
    }

    matched++;

    const setUrl = !item.possibleOfficialUrl && candidateUrl;
    if (setUrl) wouldSetUrl++;

    const evidence = [
      "[BESTPRICE_V1]",
      `issuer=${issuer}`,
      `issuerType=${issuerType}`,
      `listings=${row.listings || ""}`,
      `values=${row.values || ""}`,
      `cardTypes=${row.card_types || ""}`,
      `domain=${firstPipe(row.registered_domains) || ""}`,
      `sample=${row.sample_url || ""}`,
    ].join("; ");

    const nextNotes = appendNote(item.notes, evidence);
    const appendNeeded = nextNotes !== (item.notes || "").trim();
    if (appendNeeded) wouldAppendEvidence++;

    if (APPLY && (setUrl || appendNeeded)) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          possibleOfficialUrl: setUrl ? candidateUrl : undefined,
          notes: appendNeeded ? nextNotes : undefined,
        },
      });
      updated++;
    }
  }

  console.log(`BestPrice issuers: ${issuerRows.length}`);
  console.log(`Matched existing DiscoveryItems: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Would fill missing official URL: ${wouldSetUrl}`);
  console.log(`Would append BestPrice evidence: ${wouldAppendEvidence}`);
  console.log(`Updated rows: ${updated}`);

  if (unmatchedNames.length) {
    console.log("");
    console.log("Unmatched sample:");
    for (const name of unmatchedNames.slice(0, 20)) console.log(`- ${name}`);
  }

  console.log("");
  if (!APPLY) {
    console.log("PLAN ONLY. No DB writes.");
    console.log("Run: npm run pipeline:merge-bestprice-evidence -- --apply");
  } else {
    console.log("Merge complete.");
  }
  console.log("OpenAI/API calls: 0");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
