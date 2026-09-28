import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import * as cheerio from "cheerio";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");
const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(10, Number(process.env.REGION_LOCATION_DISCOVERY_CONCURRENCY || "5")),
);
const FETCH_TIMEOUT_MS = Math.max(
  4000,
  Number(process.env.REGION_LOCATION_DISCOVERY_TIMEOUT_MS || "15000"),
);
const USER_AGENT =
  "Mozilla/5.0 (compatible; DorokartesLocationVerifier/1.0; +https://dorokartes.gr)";

type Candidate = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision:
    | "SAFE_TO_APPLY"
    | "NO_WEBSITE"
    | "FETCH_FAILED"
    | "NO_ADDRESS_EVIDENCE"
    | "AMBIGUOUS_ADDRESS";
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedKey(city: string, address: string) {
  return `${city}|${address}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ|]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function absoluteUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const CONTACT_HINTS = [
  "contact",
  "contacts",
  "store",
  "stores",
  "shop",
  "shops",
  "location",
  "locations",
  "find-us",
  "where-we-are",
  "epikoinonia",
  "katastimata",
  "katasthmata",
  "καταστήματα",
  "επικοινωνία",
];

function likelyLocationLink(href: string, text: string) {
  const haystack = `${href} ${text}`.toLowerCase();
  return CONTACT_HINTS.some((hint) => haystack.includes(hint));
}

function greekPostalCode(text: string) {
  const match = text.match(/\b\d{3}\s?\d{2}\b/);
  return match?.[0]?.replace(/\s+/g, " ") || null;
}

const CITY_PATTERNS: Array<[RegExp, string, string]> = [
  [/\bΑθήνα\b|\bAthens\b/i, "Αθήνα", "Αττική"],
  [/\bΘεσσαλονίκη\b|\bThessaloniki\b/i, "Θεσσαλονίκη", "Κεντρική Μακεδονία"],
  [/\bΠειραι(?:άς|α)\b|\bPiraeus\b/i, "Πειραιάς", "Αττική"],
  [/\bΠάτρα\b|\bPatras?\b/i, "Πάτρα", "Δυτική Ελλάδα"],
  [/\bΗράκλειο\b|\bHeraklion\b/i, "Ηράκλειο", "Κρήτη"],
  [/\bΧανιά\b|\bChania\b/i, "Χανιά", "Κρήτη"],
  [/\bΡέθυμνο\b|\bRethymno\b/i, "Ρέθυμνο", "Κρήτη"],
  [/\bΛάρισα\b|\bLarissa\b/i, "Λάρισα", "Θεσσαλία"],
  [/\bΒόλος\b|\bVolos\b/i, "Βόλος", "Θεσσαλία"],
  [/\bΙωάννινα\b|\bIoannina\b/i, "Ιωάννινα", "Ήπειρος"],
  [/\bΚαλαμάτα\b|\bKalamata\b/i, "Καλαμάτα", "Πελοπόννησος"],
  [/\bΚόρινθος\b|\bCorinth\b/i, "Κόρινθος", "Πελοπόννησος"],
  [/\bΧαλκίδα\b|\bChalkida\b/i, "Χαλκίδα", "Στερεά Ελλάδα"],
  [/\bΣέρρες\b|\bSerres\b/i, "Σέρρες", "Κεντρική Μακεδονία"],
  [/\bΚαβάλα\b|\bKavala\b/i, "Καβάλα", "Ανατολική Μακεδονία και Θράκη"],
  [/\bΑλεξανδρούπολη\b|\bAlexandroupoli\b/i, "Αλεξανδρούπολη", "Ανατολική Μακεδονία και Θράκη"],
  [/\bΚέρκυρα\b|\bCorfu\b/i, "Κέρκυρα", "Ιόνια Νησιά"],
  [/\bΡόδος\b|\bRhodes\b/i, "Ρόδος", "Νότιο Αιγαίο"],
  [/\bΜύκονος\b|\bMykonos\b/i, "Μύκονος", "Νότιο Αιγαίο"],
  [/\bΣαντορίνη\b|\bSantorini\b|\bΘήρα\b/i, "Σαντορίνη", "Νότιο Αιγαίο"],
];

function detectCity(text: string) {
  for (const [pattern, city, administrativeArea] of CITY_PATTERNS) {
    if (pattern.test(text)) return { city, administrativeArea };
  }
  return null;
}

function extractAddressCandidates(text: string) {
  const lines = text
    .split(/\n|\r|•|\||·/)
    .map(compact)
    .filter((line) => line.length >= 8 && line.length <= 220);

  const results: Array<{
    city: string;
    administrativeArea: string;
    addressLine: string;
    postalCode: string | null;
    excerpt: string;
  }> = [];

  for (const line of lines) {
    const city = detectCity(line);
    const postalCode = greekPostalCode(line);

    if (!city) continue;

    const hasAddressShape =
      /\d{1,4}/.test(line) &&
      /(?:οδός|οδος|street|str\.|avenue|ave\.|λεωφ\.|λεωφόρος|πλατεία|road|rd\.)/i.test(line);

    if (!hasAddressShape && !postalCode) continue;

    results.push({
      city: city.city,
      administrativeArea: city.administrativeArea,
      addressLine: line.slice(0, 220),
      postalCode,
      excerpt: line.slice(0, 500),
    });
  }

  const seen = new Set<string>();
  return results.filter((row) => {
    const key = normalizedKey(row.city, row.addressLine);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`Unsupported content-type: ${contentType || "unknown"}`);
    }

    return { html: await response.text(), finalUrl: response.url || url };
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectMerchant(merchant: {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
}): Promise<Candidate[]> {
  if (!merchant.websiteUrl || !/^https?:\/\//i.test(merchant.websiteUrl)) {
    return [{
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl: null,
      city: null,
      area: null,
      administrativeArea: null,
      addressLine: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      sourceExcerpt: null,
      decision: "NO_WEBSITE",
    }];
  }

  let home;
  try {
    home = await fetchHtml(merchant.websiteUrl);
  } catch (error) {
    return [{
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl: merchant.websiteUrl,
      city: null,
      area: null,
      administrativeArea: null,
      addressLine: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      sourceExcerpt: error instanceof Error ? error.message : String(error),
      decision: "FETCH_FAILED",
    }];
  }

  const $ = cheerio.load(home.html);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = String($(el).attr("href") || "");
    const text = compact($(el).text());
    if (!likelyLocationLink(href, text)) return;
    const absolute = absoluteUrl(home.finalUrl, href);
    if (!absolute) return;

    try {
      const baseHost = new URL(home.finalUrl).hostname.replace(/^www\./, "");
      const linkHost = new URL(absolute).hostname.replace(/^www\./, "");
      if (baseHost === linkHost) links.add(absolute);
    } catch {}
  });

  const urls = [home.finalUrl, ...Array.from(links).slice(0, 5)];
  const candidates: Candidate[] = [];

  for (const url of urls) {
    let page = url === home.finalUrl ? home : null;
    if (!page) {
      try {
        page = await fetchHtml(url);
      } catch {
        continue;
      }
    }

    const page$ = cheerio.load(page.html);
    page$("script,style,noscript,svg").remove();

    const bodyText = page$("body").text();
    const rows = extractAddressCandidates(bodyText);

    for (const row of rows) {
      candidates.push({
        merchantId: merchant.id,
        merchant: merchant.name,
        merchantSlug: merchant.slug,
        websiteUrl: merchant.websiteUrl,
        sourceUrl: page.finalUrl,
        city: row.city,
        area: null,
        administrativeArea: row.administrativeArea,
        addressLine: row.addressLine,
        postalCode: row.postalCode,
        latitude: null,
        longitude: null,
        sourceExcerpt: row.excerpt,
        decision: "SAFE_TO_APPLY",
      });
    }
  }

  const deduped = new Map<string, Candidate>();

  for (const row of candidates) {
    const key = normalizedKey(row.city!, row.addressLine!);
    if (!deduped.has(key)) deduped.set(key, row);
  }

  const unique = [...deduped.values()];

  if (!unique.length) {
    return [{
      merchantId: merchant.id,
      merchant: merchant.name,
      merchantSlug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      sourceUrl: home.finalUrl,
      city: null,
      area: null,
      administrativeArea: null,
      addressLine: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      sourceExcerpt: null,
      decision: "NO_ADDRESS_EVIDENCE",
    }];
  }

  return unique;
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

  console.log("=== DOROKARTES MERCHANT LOCATION DISCOVERY v1 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Merchants without verified locations: ${merchants.length}`);
  console.log(`Concurrency: ${MAX_CONCURRENCY}`);
  console.log("");

  const nested = await mapLimit(merchants, MAX_CONCURRENCY, async (merchant, index) => {
    const rows = await inspectMerchant(merchant);
    const safe = rows.filter((x) => x.decision === "SAFE_TO_APPLY").length;
    console.log(
      `[${index + 1}/${merchants.length}] ${merchant.name}: ${
        safe ? `SAFE_TO_APPLY (${safe})` : rows[0]?.decision || "NO_ADDRESS_EVIDENCE"
      }`,
    );
    return rows;
  });

  const rows = nested.flat();

  if (APPLY) {
    const safeRows = rows.filter(
      (row) =>
        row.decision === "SAFE_TO_APPLY" &&
        row.city &&
        row.addressLine &&
        row.sourceUrl,
    );

    for (const row of safeRows) {
      const key = normalizedKey(row.city!, row.addressLine!);

      await prisma.merchantLocation.upsert({
        where: {
          merchantId_normalizedKey: {
            merchantId: row.merchantId,
            normalizedKey: key,
          },
        },
        create: {
          merchantId: row.merchantId,
          label: null,
          countryCode: "GR",
          administrativeArea: row.administrativeArea,
          city: row.city!,
          area: row.area,
          addressLine: row.addressLine!,
          postalCode: row.postalCode,
          latitude: row.latitude,
          longitude: row.longitude,
          normalizedKey: key,
          sourceUrl: row.sourceUrl!,
          sourceExcerpt: row.sourceExcerpt,
          active: true,
          verificationStatus: "VERIFIED",
          lastVerifiedAt: new Date(),
        },
        update: {
          administrativeArea: row.administrativeArea,
          city: row.city!,
          area: row.area,
          addressLine: row.addressLine!,
          postalCode: row.postalCode,
          sourceUrl: row.sourceUrl!,
          sourceExcerpt: row.sourceExcerpt,
          active: true,
          verificationStatus: "VERIFIED",
          lastVerifiedAt: new Date(),
        },
      });
    }
  }

  const summary = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.decision] = (acc[row.decision] || 0) + 1;
    return acc;
  }, {});

  const safeRows = rows.filter((row) => row.decision === "SAFE_TO_APPLY");

  const output = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "APPLY" : "DRY_RUN",
    merchantCount: merchants.length,
    discoveredLocationRows: safeRows.length,
    summary,
    rows,
  };

  const dir = path.resolve(process.cwd(), "reports", "regions");
  await fs.mkdir(dir, { recursive: true });

  const reportPath = path.join(
    dir,
    `merchant-location-discovery-v1-${APPLY ? "apply" : "dry-run"}.json`,
  );

  await fs.writeFile(reportPath, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log("=== SUMMARY ===");
  console.table(summary);
  console.log(`Discovered location rows: ${safeRows.length}`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);

  if (!APPLY) {
    console.log("DRY RUN ONLY — database unchanged.");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
