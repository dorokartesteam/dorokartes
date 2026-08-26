import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDomain } from "tldts";
import {
  PrismaClient,
  SourceType,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");
const IMPORT_NEW = process.argv.includes("--import-new");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const GOOGLE_DIR = path.join(ROOT, "data", "discovery", "google");

const SOURCES = [
  {
    name: "Google Serper v1",
    file: path.join(GOOGLE_DIR, "google-serper-domains-v1.csv"),
    domainCol: "domain",
    titleCol: "sample_title",
    urlCol: "sample_url",
    queryCol: "queries",
  },
  {
    name: "Google Query Lab v2",
    file: path.join(GOOGLE_DIR, "google-serper-query-lab-v2.csv"),
    domainCol: "new_domain_list",
    titleCol: "",
    urlCol: "",
    queryCol: "query",
    pipeList: true,
  },
  {
    name: "Google Focused v3",
    file: path.join(GOOGLE_DIR, "google-serper-focused-domains-v3.csv"),
    domainCol: "domain",
    titleCol: "sample_title",
    urlCol: "sample_url",
    queryCol: "queries",
  },
];

const OUT = path.join(
  GOOGLE_DIR,
  "google-clean-dedupe-v1.csv",
);

const BLOCKED_EXACT = new Set([
  "google.com","youtube.com","facebook.com","instagram.com","linkedin.com",
  "tiktok.com","pinterest.com","x.com","twitter.com","wikipedia.org",
  "bestprice.gr","skroutz.gr","kouponia365.gr","vrisko.gr","xo.gr",
  "reddit.com","tripadvisor.com","tripadvisor.com.gr","booking.com",
  "amazon.com","ebay.com","quora.com","yelp.com",
  "blogspot.com","blogspot.gr",
  "aade.gr","gov.gr","auth.gr","piraeusbank.gr","alpha.gr","eurobank.gr",
  "nbg.gr","visa.gr","mastercard.gr","businesswire.com","ons.gov.uk",
  "ot.gr","in.gr","mononews.gr","kathimerini.gr","newsit.gr","bovary.gr",
  "gtp.gr","jobfind.gr","freelancer.gr","kethea.gr","mindigital.gr",
  "ekkomed.gr","revolut.com","webnode.gr","scribd.com","hotels.com",
  "tripadvisor.co.uk","tripadvisor.com","giftly.com","giftya.com",
]);

const BLOCKED_PATTERNS = [
  /(^|\.)gov\./i,
  /(^|\.)edu\./i,
  /(^|\.)ac\./i,
  /(^|\.)wikipedia\./i,
  /(^|\.)facebook\./i,
  /(^|\.)instagram\./i,
  /(^|\.)youtube\./i,
  /(^|\.)linkedin\./i,
  /(^|\.)reddit\./i,
];

const NOISE_NAME_PATTERNS = [
  /\b(news|newspaper|magazine|blog|forum|directory|portal|search|wiki)\b/i,
  /\b(government|ministry|university|school|institute|municipality)\b/i,
  /\b(bank|visa|mastercard|insurance|telecom|agency directory)\b/i,
];

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

function normalizeDomain(raw: string) {
  let value = (raw || "").trim().toLowerCase();
  if (!value) return "";

  try {
    const withProto = value.includes("://") ? value : `https://${value}`;
    const host = new URL(withProto).hostname.replace(/^www\./, "");
    return getDomain(host, { allowPrivateDomains: true }) || host;
  } catch {
    return value.replace(/^www\./, "");
  }
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

function blocked(domain: string, title: string, queries: string) {
  if (!domain) return { yes: true, reason: "EMPTY_DOMAIN" };
  if (BLOCKED_EXACT.has(domain)) return { yes: true, reason: "BLOCKLIST" };
  if (BLOCKED_PATTERNS.some((re) => re.test(domain))) {
    return { yes: true, reason: "BLOCK_PATTERN" };
  }

  const context = `${title} ${queries}`;
  if (NOISE_NAME_PATTERNS.some((re) => re.test(context))) {
    return { yes: true, reason: "NOISE_CONTEXT" };
  }

  return { yes: false, reason: "" };
}

type Candidate = {
  domain: string;
  sampleTitle: string;
  sampleUrl: string;
  sources: Set<string>;
  queries: Set<string>;
  occurrences: number;
};

function loadCandidates() {
  const map = new Map<string, Candidate>();
  let rawRows = 0;

  for (const source of SOURCES) {
    if (!fs.existsSync(source.file)) {
      console.log(`Missing optional source: ${path.basename(source.file)}`);
      continue;
    }

    const raw = fs.readFileSync(source.file, "utf8").replace(/^\uFEFF/, "");
    const matrix = parseCsv(raw);
    const headers = matrix.shift() ?? [];
    const idx = (name: string) => (name ? headers.indexOf(name) : -1);

    const dIdx = idx(source.domainCol);
    const tIdx = idx(source.titleCol);
    const uIdx = idx(source.urlCol);
    const qIdx = idx(source.queryCol);

    for (const row of matrix) {
      rawRows++;

      const rawDomainField = dIdx >= 0 ? row[dIdx] || "" : "";
      const rawDomains = source.pipeList
        ? rawDomainField.split("|").map((x) => x.trim()).filter(Boolean)
        : [rawDomainField];

      for (const rawDomain of rawDomains) {
        const domain = normalizeDomain(rawDomain);
        if (!domain) continue;

        let c = map.get(domain);
        if (!c) {
          c = {
            domain,
            sampleTitle: "",
            sampleUrl: "",
            sources: new Set(),
            queries: new Set(),
            occurrences: 0,
          };
          map.set(domain, c);
        }

        const title = tIdx >= 0 ? (row[tIdx] || "").trim() : "";
        const url = uIdx >= 0 ? (row[uIdx] || "").trim() : "";
        const queries = qIdx >= 0 ? (row[qIdx] || "").trim() : "";

        if (!c.sampleTitle && title) c.sampleTitle = title;
        if (!c.sampleUrl && url) c.sampleUrl = url;
        c.sources.add(source.name);
        for (const q of queries.split("|").map((x) => x.trim()).filter(Boolean)) {
          c.queries.add(q);
        }
        c.occurrences++;
      }
    }
  }

  return { rawRows, candidates: [...map.values()] };
}

async function main() {
  console.log("Dorokartes Google Clean + Dedupe + Import v1");
  console.log("============================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Import NEW: ${IMPORT_NEW ? "YES" : "NO"}`);
  console.log("OpenAI/API calls: 0");
  console.log("");

  const { rawRows, candidates } = loadCandidates();

  const merchants = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      giftCards: {
        select: { officialUrl: true },
      },
    },
  });

  const discovery = await prisma.discoveryItem.findMany({
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      status: true,
    },
  });

  const prodByDomain = new Map<string, typeof merchants[number]>();
  const prodByName = new Map<string, typeof merchants[number]>();

  for (const m of merchants) {
    const nk = normalizeName(m.name);
    if (nk && !prodByName.has(nk)) prodByName.set(nk, m);

    const domains = [
      normalizeDomain(m.websiteUrl || ""),
      ...m.giftCards.map((g) => normalizeDomain(g.officialUrl || "")),
    ].filter(Boolean);

    for (const d of domains) {
      if (!prodByDomain.has(d)) prodByDomain.set(d, m);
    }
  }

  const discByDomain = new Map<string, typeof discovery[number]>();
  const discByName = new Map<string, typeof discovery[number]>();

  for (const d of discovery) {
    const nk = normalizeName(d.merchantName);
    if (nk && !discByName.has(nk)) discByName.set(nk, d);

    const domains = [
      normalizeDomain(d.possibleOfficialUrl || ""),
      normalizeDomain(d.sourceUrl || ""),
    ].filter(Boolean);

    for (const dom of domains) {
      if (!discByDomain.has(dom)) discByDomain.set(dom, d);
    }
  }

  const result: Record<string, unknown>[] = [];

  let blockedCount = 0;
  let prodCount = 0;
  let discCount = 0;
  let newCount = 0;
  let imported = 0;
  let importSkipped = 0;

  for (const c of candidates.sort((a, b) => b.occurrences - a.occurrences)) {
    const guessedName = merchantNameFromDomain(c.domain);
    const nameKey = normalizeName(guessedName);

    const block = blocked(
      c.domain,
      c.sampleTitle,
      [...c.queries].join(" | "),
    );

    let bucket = "NEW";
    let matchedName = "";
    let matchedId = "";
    let matchedBy = "";

    if (block.yes) {
      bucket = "BLOCKED_NOISE";
      blockedCount++;
      matchedBy = block.reason;
    } else {
      const prod =
        prodByDomain.get(c.domain) ||
        (nameKey ? prodByName.get(nameKey) : undefined);

      const disc =
        !prod &&
        (discByDomain.get(c.domain) ||
          (nameKey ? discByName.get(nameKey) : undefined));

      if (prod) {
        bucket = "ALREADY_PRODUCTION";
        prodCount++;
        matchedName = prod.name;
        matchedId = prod.id;
        matchedBy = prodByDomain.get(c.domain)?.id === prod.id ? "DOMAIN" : "NAME";
      } else if (disc) {
        bucket = "ALREADY_DISCOVERY";
        discCount++;
        matchedName = disc.merchantName || "";
        matchedId = disc.id;
        matchedBy =
          discByDomain.get(c.domain)?.id === disc.id ? "DOMAIN" : "NAME";
      } else {
        newCount++;
      }
    }

    result.push({
      domain: c.domain,
      guessed_merchant_name: guessedName,
      bucket,
      matched_by: matchedBy,
      matched_name: matchedName,
      matched_id: matchedId,
      occurrences: c.occurrences,
      source_count: c.sources.size,
      sources: [...c.sources].join(" | "),
      query_count: c.queries.size,
      sample_title: c.sampleTitle,
      sample_url: c.sampleUrl,
      queries: [...c.queries].join(" | "),
    });

    if (APPLY && IMPORT_NEW && bucket === "NEW") {
      const fingerprint = crypto
        .createHash("sha256")
        .update(`GOOGLE_DOMAIN_V1|${c.domain}`)
        .digest("hex");

      const already = await prisma.discoveryItem.findFirst({
        where: {
          OR: [
            { fingerprint },
            { possibleOfficialUrl: `https://${c.domain}` },
            { possibleOfficialUrl: `https://www.${c.domain}` },
          ],
        },
        select: { id: true },
      });

      if (already) {
        importSkipped++;
        continue;
      }

      await prisma.discoveryItem.create({
        data: {
          sourceType: SourceType.SEARCH_ENGINE,
          sourceName: "Google Serper Cleaned v1",
          sourceUrl: c.sampleUrl || `https://${c.domain}`,
          title: c.sampleTitle || `${guessedName} gift card candidate`,
          merchantName: guessedName,
          status: DiscoveryStatus.DISCOVERED,
          possibleOfficialUrl: `https://${c.domain}`,
          fingerprint,
          notes: [
            `Google candidate domain: ${c.domain}`,
            `Occurrences: ${c.occurrences}`,
            `Sources: ${[...c.sources].join(", ")}`,
            `Queries: ${[...c.queries].slice(0, 10).join(" || ")}`,
            "Imported as DISCOVERED candidate only; not verified.",
          ].join(" | "),
        },
      });

      imported++;
    }
  }

  console.log(`Raw source rows scanned: ${rawRows}`);
  console.log(`Unique domains after global dedupe: ${candidates.length}`);
  console.log(`Blocked / obvious noise: ${blockedCount}`);
  console.log(`Already production: ${prodCount}`);
  console.log(`Already discovery: ${discCount}`);
  console.log(`Genuinely NEW candidate domains: ${newCount}`);

  console.log("");
  console.log("Top NEW candidates:");
  for (const r of result.filter((x) => x.bucket === "NEW").slice(0, 40)) {
    console.log(
      `- ${r.domain} | hits=${r.occurrences} | sources=${r.source_count} | ${r.sample_title || ""}`,
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("PLAN ONLY. No CSV and no DB writes.");
    console.log("Run: npm run pipeline:clean-google-harvest -- --apply");
    return;
  }

  writeCsv(OUT, result, [
    "domain",
    "guessed_merchant_name",
    "bucket",
    "matched_by",
    "matched_name",
    "matched_id",
    "occurrences",
    "source_count",
    "sources",
    "query_count",
    "sample_title",
    "sample_url",
    "queries",
  ]);

  console.log("");
  console.log(`Clean dedupe CSV: ${OUT}`);
  console.log(`New DiscoveryItems imported: ${imported}`);
  console.log(`Import skips: ${importSkipped}`);
  console.log("OpenAI/API calls: 0");

  if (!IMPORT_NEW) {
    console.log("");
    console.log("After reviewing the PLAN/CSV, import ONLY NEW candidates with:");
    console.log(
      "npm run pipeline:clean-google-harvest -- --apply --import-new",
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
