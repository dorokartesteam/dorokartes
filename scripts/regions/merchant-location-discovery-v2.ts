import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import * as cheerio from "cheerio";

loadEnvConfig(process.cwd());

const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.REGION_LOCATION_DISCOVERY_V2_CONCURRENCY || "4")),
);

const FETCH_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.REGION_LOCATION_DISCOVERY_V2_TIMEOUT_MS || "15000"),
);

const MAX_PAGES_PER_MERCHANT = Math.max(
  3,
  Math.min(20, Number(process.env.REGION_LOCATION_DISCOVERY_V2_MAX_PAGES || "10")),
);

const USER_AGENT =
  "Mozilla/5.0 (compatible; DorokartesLocationVerifier/2.0; +https://dorokartes.gr)";

type Decision =
  | "SAFE_CANDIDATE"
  | "NO_WEBSITE"
  | "FETCH_FAILED"
  | "NO_ADDRESS_EVIDENCE"
  | "OUTSIDE_GREECE"
  | "AMBIGUOUS";

type Candidate = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  sourceType: "JSON_LD" | "PAGE_TEXT" | "MAP_LINK" | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision: Decision;
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function norm(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function host(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function sameDomain(base: string, target: string) {
  const a = host(base);
  const b = host(target);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function absoluteUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function postalCode(text: string) {
  const m = text.match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

const CITY_DEFS = [
  ["Αθήνα", "Αττική", ["athens", "athina", "αθηνα", "αθήνα"]],
  ["Πειραιάς", "Αττική", ["piraeus", "pireas", "πειραιας", "πειραιάς"]],
  ["Θεσσαλονίκη", "Κεντρική Μακεδονία", ["thessaloniki", "salonica", "θεσσαλονικη", "θεσσαλονίκη"]],
  ["Πάτρα", "Δυτική Ελλάδα", ["patra", "patras", "πατρα", "πάτρα"]],
  ["Ηράκλειο", "Κρήτη", ["heraklion", "iraklio", "ηρακλειο", "ηράκλειο"]],
  ["Χανιά", "Κρήτη", ["chania", "hania", "χανια", "χανιά"]],
  ["Ρέθυμνο", "Κρήτη", ["rethymno", "rethimno", "ρεθυμνο", "ρέθυμνο"]],
  ["Λάρισα", "Θεσσαλία", ["larissa", "larisa", "λαρισα", "λάρισα"]],
  ["Βόλος", "Θεσσαλία", ["volos", "βολος", "βόλος"]],
  ["Ιωάννινα", "Ήπειρος", ["ioannina", "yiannina", "ιωαννινα", "ιωάννινα"]],
  ["Καλαμάτα", "Πελοπόννησος", ["kalamata", "καλαματα", "καλαμάτα"]],
  ["Κόρινθος", "Πελοπόννησος", ["corinth", "korinthos", "κορινθος", "κόρινθος"]],
  ["Χαλκίδα", "Στερεά Ελλάδα", ["chalkida", "halkida", "χαλκιδα", "χαλκίδα"]],
  ["Σέρρες", "Κεντρική Μακεδονία", ["serres", "serrai", "σερρες", "σέρρες"]],
  ["Καβάλα", "Ανατολική Μακεδονία και Θράκη", ["kavala", "καβαλα", "καβάλα"]],
  ["Αλεξανδρούπολη", "Ανατολική Μακεδονία και Θράκη", ["alexandroupoli", "alexandroupolis", "αλεξανδρουπολη", "αλεξανδρούπολη"]],
  ["Κέρκυρα", "Ιόνια Νησιά", ["corfu", "kerkyra", "κερκυρα", "κέρκυρα"]],
  ["Ρόδος", "Νότιο Αιγαίο", ["rhodes", "rodos", "ροδος", "ρόδος"]],
  ["Μύκονος", "Νότιο Αιγαίο", ["mykonos", "myconos", "μυκονος", "μύκονος"]],
  ["Σαντορίνη", "Νότιο Αιγαίο", ["santorini", "thira", "thera", "σαντορινη", "σαντορίνη", "θηρα", "θήρα"]],
] as const;

function detectCity(text: string) {
  const t = norm(text);
  for (const [city, administrativeArea, aliases] of CITY_DEFS) {
    if (aliases.some(a => t.includes(norm(a)))) {
      return { city, administrativeArea };
    }
  }
  return null;
}

function outsideGreece(text: string) {
  const t = norm(text);
  return [
    "united states", " usa", "athens georgia", "athens, georgia",
    "london uk", "united kingdom", "cyprus", "nicosia", "limassol",
  ].some(x => t.includes(x));
}

function looksLikeAddress(text: string) {
  const t = norm(text);
  const hasPostal = /\b\d{3}\s?\d{2}\b/.test(t);
  const hasNumber = /\b\d{1,4}(?:-\d{1,4})?\b/.test(t);
  const streetHints = [
    "street", "str", "avenue", "ave", "road", "rd", "square",
    "οδος", "λεωφ", "λεωφορος", "πλατ", "αγιας", "agias",
    "tsimiski", "ermou", "stadiou", "mitropoleos", "patreos",
    "karaiskou", "komninon", "kolokotroni", "syggrou", "vouliagmenis",
  ];
  const hasHint = streetHints.some(x => t.includes(x));
  return hasPostal || (hasNumber && hasHint);
}

function extractJsonLdAddresses($: cheerio.CheerioAPI, sourceUrl: string) {
  const out: Candidate[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw.trim()) return;

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const nodes: any[] = [];
    const pushNode = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(pushNode);
        return;
      }
      nodes.push(node);
      if (node["@graph"]) pushNode(node["@graph"]);
    };
    pushNode(parsed);

    for (const node of nodes) {
      const addr = node?.address;
      if (!addr) continue;

      const addresses = Array.isArray(addr) ? addr : [addr];

      for (const a of addresses) {
        if (typeof a === "string") {
          const city = detectCity(a);
          if (!city || outsideGreece(a) || !looksLikeAddress(a)) continue;

          out.push({
            merchantId: "",
            merchant: "",
            merchantSlug: "",
            websiteUrl: null,
            sourceUrl,
            sourceType: "JSON_LD",
            city: city.city,
            area: null,
            administrativeArea: city.administrativeArea,
            addressLine: compact(a),
            postalCode: postalCode(a),
            countryCode: "GR",
            latitude: null,
            longitude: null,
            sourceExcerpt: compact(a).slice(0, 500),
            decision: "SAFE_CANDIDATE",
          });
          continue;
        }

        const line = compact([
          a.streetAddress,
          a.addressLocality,
          a.addressRegion,
          a.postalCode,
          a.addressCountry,
        ].filter(Boolean).join(", "));

        if (!line) continue;
        if (outsideGreece(line)) continue;

        const detected = detectCity(line);
        if (!detected && !a.addressLocality) continue;

        const city = detected?.city || compact(String(a.addressLocality || ""));
        const administrativeArea =
          detected?.administrativeArea || (a.addressRegion ? compact(String(a.addressRegion)) : null);

        const country =
          typeof a.addressCountry === "string"
            ? a.addressCountry
            : a.addressCountry?.name || a.addressCountry?.["@id"] || null;

        if (country && !/gr|greece|ελλαδ/i.test(String(country))) continue;

        out.push({
          merchantId: "",
          merchant: "",
          merchantSlug: "",
          websiteUrl: null,
          sourceUrl,
          sourceType: "JSON_LD",
          city: city || null,
          area: null,
          administrativeArea,
          addressLine: line,
          postalCode: a.postalCode ? String(a.postalCode).replace(/\s+/g, "") : postalCode(line),
          countryCode: "GR",
          latitude: Number.isFinite(Number(node?.geo?.latitude)) ? Number(node.geo.latitude) : null,
          longitude: Number.isFinite(Number(node?.geo?.longitude)) ? Number(node.geo.longitude) : null,
          sourceExcerpt: line.slice(0, 500),
          decision: "SAFE_CANDIDATE",
        });
      }
    }
  });

  return out;
}

function extractTextCandidates(text: string, sourceUrl: string) {
  const chunks = text
    .split(/\n|\r|•|\||·|(?<=\.)\s+(?=[A-ZΑ-Ω])/)
    .map(compact)
    .filter(x => x.length >= 10 && x.length <= 260);

  const out: Candidate[] = [];

  for (const chunk of chunks) {
    if (outsideGreece(chunk)) continue;
    const city = detectCity(chunk);
    if (!city) continue;
    if (!looksLikeAddress(chunk)) continue;

    out.push({
      merchantId: "",
      merchant: "",
      merchantSlug: "",
      websiteUrl: null,
      sourceUrl,
      sourceType: "PAGE_TEXT",
      city: city.city,
      area: null,
      administrativeArea: city.administrativeArea,
      addressLine: chunk,
      postalCode: postalCode(chunk),
      countryCode: "GR",
      latitude: null,
      longitude: null,
      sourceExcerpt: chunk.slice(0, 500),
      decision: "SAFE_CANDIDATE",
    });
  }

  return out;
}

function extractMapLinks($: cheerio.CheerioAPI, sourceUrl: string) {
  const out: Candidate[] = [];

  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "");
    if (!/google\.(com|gr)\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(href)) return;

    const text = compact($(el).text());
    const title = compact(String($(el).attr("title") || ""));
    const aria = compact(String($(el).attr("aria-label") || ""));
    const evidence = compact(`${text} ${title} ${aria}`);

    if (!evidence) return;

    const city = detectCity(evidence);
    if (!city || !looksLikeAddress(evidence)) return;

    out.push({
      merchantId: "",
      merchant: "",
      merchantSlug: "",
      websiteUrl: null,
      sourceUrl,
      sourceType: "MAP_LINK",
      city: city.city,
      area: null,
      administrativeArea: city.administrativeArea,
      addressLine: evidence,
      postalCode: postalCode(evidence),
      countryCode: "GR",
      latitude: null,
      longitude: null,
      sourceExcerpt: evidence.slice(0, 500),
      decision: "SAFE_CANDIDATE",
    });
  });

  return out;
}

function rankLink(href: string, text: string) {
  const t = norm(`${href} ${text}`);

  const high = [
    "store-locator", "stores", "store", "katastimata", "katasthmata",
    "locations", "location", "contact", "epikoinonia", "find-us",
    "where-we-are", "showroom", "boutique",
  ];

  const medium = [
    "about", "company", "εταιρ", "who-we-are", "footer",
  ];

  let score = 0;
  for (const x of high) if (t.includes(norm(x))) score += 10;
  for (const x of medium) if (t.includes(norm(x))) score += 3;

  if (/privacy|terms|returns|shipping|blog|news|product|gift|cart|checkout/i.test(t)) {
    score -= 8;
  }

  return score;
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`Unsupported content-type: ${contentType || "unknown"}`);
    }

    return { html: await res.text(), finalUrl: res.url || url };
  } finally {
    clearTimeout(timeout);
  }
}

function candidateKey(row: Candidate) {
  return norm([
    row.city,
    row.postalCode,
    row.addressLine,
  ].filter(Boolean).join("|"));
}

function enrich(row: Candidate, merchant: any): Candidate {
  return {
    ...row,
    merchantId: merchant.id,
    merchant: merchant.name,
    merchantSlug: merchant.slug,
    websiteUrl: merchant.websiteUrl,
  };
}

async function inspectMerchant(merchant: any): Promise<Candidate[]> {
  if (!merchant.websiteUrl || !/^https?:\/\//i.test(merchant.websiteUrl)) {
    return [{
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl: null,
      sourceType: null,
      city: null,
      area: null,
      administrativeArea: null,
      addressLine: null,
      postalCode: null,
      countryCode: null,
      latitude: null,
      longitude: null,
      sourceExcerpt: null,
      decision: "NO_WEBSITE",
    }];
  }

  let home;
  try {
    home = await fetchPage(merchant.websiteUrl);
  } catch (error) {
    return [{
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl: merchant.websiteUrl,
      sourceType: null,
      city: null,
      area: null,
      administrativeArea: null,
      addressLine: null,
      postalCode: null,
      countryCode: null,
      latitude: null,
      longitude: null,
      sourceExcerpt: error instanceof Error ? error.message : String(error),
      decision: "FETCH_FAILED",
    }];
  }

  const queue = new Map<string, number>();
  queue.set(home.finalUrl, 100);

  const $home = cheerio.load(home.html);
  $home("a[href]").each((_, el) => {
    const href = String($home(el).attr("href") || "");
    const text = compact($home(el).text());
    const abs = absoluteUrl(home.finalUrl, href);
    if (!abs || !sameDomain(home.finalUrl, abs)) return;

    const score = rankLink(abs, text);
    if (score > 0) {
      queue.set(abs, Math.max(queue.get(abs) || 0, score));
    }
  });

  const urls = [...queue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PAGES_PER_MERCHANT)
    .map(([url]) => url);

  const candidates: Candidate[] = [];

  for (const url of urls) {
    let page = url === home.finalUrl ? home : null;

    if (!page) {
      try {
        page = await fetchPage(url);
      } catch {
        continue;
      }
    }

    const $ = cheerio.load(page.html);

    candidates.push(
      ...extractJsonLdAddresses($, page.finalUrl).map(r => enrich(r, merchant)),
    );

    candidates.push(
      ...extractMapLinks($, page.finalUrl).map(r => enrich(r, merchant)),
    );

    $("script,style,noscript,svg").remove();
    const body = $("body").text();

    candidates.push(
      ...extractTextCandidates(body, page.finalUrl).map(r => enrich(r, merchant)),
    );
  }

  const unique = new Map<string, Candidate>();

  for (const row of candidates) {
    const key = candidateKey(row);
    if (!key) continue;

    const current = unique.get(key);
    if (!current) {
      unique.set(key, row);
      continue;
    }

    const rank = (r: Candidate) =>
      (r.sourceType === "JSON_LD" ? 3 : r.sourceType === "MAP_LINK" ? 2 : 1) +
      (r.postalCode ? 1 : 0) +
      (r.latitude != null && r.longitude != null ? 1 : 0);

    if (rank(row) > rank(current)) unique.set(key, row);
  }

  const rows = [...unique.values()];

  if (!rows.length) {
    return [{
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl: home.finalUrl,
      sourceType: null,
      city: null,
      area: null,
      administrativeArea: null,
      addressLine: null,
      postalCode: null,
      countryCode: "GR",
      latitude: null,
      longitude: null,
      sourceExcerpt: null,
      decision: "NO_ADDRESS_EVIDENCE",
    }];
  }

  return rows;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const merchants = await prisma.merchant.findMany({
    where: {
      status: "ACTIVE",
      giftCards: {
        some: {
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
        },
      },
      locations: {
        none: {
          active: true,
          verificationStatus: "VERIFIED",
        },
      },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
    },
  });

  console.log("=== DOROKARTES MERCHANT LOCATION DISCOVERY v2 ===");
  console.log("MODE: DRY RUN");
  console.log(`Merchants without verified locations: ${merchants.length}`);
  console.log(`Concurrency: ${MAX_CONCURRENCY}`);
  console.log(`Max pages per merchant: ${MAX_PAGES_PER_MERCHANT}`);
  console.log("");

  const nested = await mapLimit(merchants, MAX_CONCURRENCY, async (merchant, index) => {
    const rows = await inspectMerchant(merchant);
    const safe = rows.filter(r => r.decision === "SAFE_CANDIDATE").length;

    console.log(
      `[${index + 1}/${merchants.length}] ${merchant.name}: ${
        safe ? `SAFE_CANDIDATE (${safe})` : rows[0]?.decision || "NO_ADDRESS_EVIDENCE"
      }`,
    );

    return rows;
  });

  const rows = nested.flat();

  const summary = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.decision] = (acc[row.decision] || 0) + 1;
    return acc;
  }, {});

  const safeRows = rows.filter(r => r.decision === "SAFE_CANDIDATE");

  const output = {
    generatedAt: new Date().toISOString(),
    version: "2",
    mode: "DRY_RUN",
    merchantCount: merchants.length,
    discoveredLocationRows: safeRows.length,
    summary,
    rows,
  };

  const dir = path.resolve(process.cwd(), "reports", "regions");
  await fs.mkdir(dir, { recursive: true });

  const reportPath = path.join(dir, "merchant-location-discovery-v2-dry-run.json");
  await fs.writeFile(reportPath, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log("=== SUMMARY ===");
  console.table(summary);
  console.log(`Discovered location rows: ${safeRows.length}`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  console.log("DRY RUN ONLY — database unchanged.");

  await prisma.$disconnect();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
