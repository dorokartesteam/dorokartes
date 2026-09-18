import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import pLimit from "p-limit";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = 1 as const;
const REPORT_DIR = path.join(process.cwd(), "reports");
const OUTPUT_JSON = path.join(REPORT_DIR, "denomination-evidence-v1-preview.json");
const OUTPUT_CSV = path.join(REPORT_DIR, "denomination-evidence-v1-preview.csv");
const CONCURRENCY_ARG = process.argv.find((argument) => argument.startsWith("--concurrency="));
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.min(16, Math.max(1, Number(CONCURRENCY_ARG.split("=")[1])))
  : 10;
const LIMIT_ARG = process.argv.find((argument) => argument.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : undefined;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const OPERATOR_EXCLUSIONS = new Map<string, string>([
  [
    "cmta1m7h100s4q8iy0yg57q08",
    "Rendered E-Socks collection does not establish electronic delivery; the eGift token is hidden or unrelated page content.",
  ],
  [
    "cmta1nyzl00yyq8iy0qetgjxm",
    "Rendered Vinyl product page does not establish electronic delivery; hidden electronic-card text is insufficient.",
  ],
]);

type Currency = "EUR" | "GBP" | "CHF" | "USD";
type PriceEvidence = {
  value: number;
  currency: Currency | null;
  source: string;
};
type FindingStatus = "SAFE_VALUE_EVIDENCE" | "SUPPORTED_AS_IS" | "REVIEW" | "ERROR";
type Finding = {
  cardId: string;
  merchantId: string;
  merchantName: string;
  title: string;
  officialUrl: string;
  finalUrl: string | null;
  status: FindingStatus;
  reasons: string[];
  titleAmounts: number[];
  urlAmounts: number[];
  pageIdentity: string[];
  priceEvidence: PriceEvidence[];
  proposedCurrency: Currency | null;
  proposedValues: number[];
  explicitDigitalEvidence: string | null;
  existingVariantCount: number;
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(raw: string) {
  const compact = raw.replace(/\s+/g, "");
  const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(compact)
    ? compact.replace(/[.,]/g, "")
    : compact.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 5 && value <= 10_000 ? value : null;
}

function explicitAmounts(value: string) {
  const out = new Set<number>();
  const patterns = [
    /(?:€|eur(?:o)?s?|euro|ευρώ|ευρω|chf|gbp|usd|£|\$)\s*(\d+(?:[.,]\d{1,3})?)/giu,
    /(\d+(?:[.,]\d{1,3})?)\s*(?:€|eur(?:o)?s?|euro|ευρώ|ευρω|chf|gbp|usd|£|\$|e\b|ε\b)/giu,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const parsed = parseNumber(match[1]);
      if (parsed !== null) out.add(parsed);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function titleAmounts(value: string) {
  const out = new Set(explicitAmounts(value));
  const bare =
    /(?:gift\s*(?:card|voucher)|giftcard|δωροκάρτα|δωροκαρτα|δωροεπιταγή|δωροεπιταγη)[^0-9]{0,16}(?<![\p{L}\p{N}])(\d+(?:[.,]\d{1,3})?)(?![\p{L}\p{N}])/giu;
  for (const match of value.matchAll(bare)) {
    const parsed = parseNumber(match[1]);
    if (parsed !== null) out.add(parsed);
  }
  return [...out].sort((a, b) => a - b);
}

function urlAmounts(raw: string | null) {
  if (!raw) return [];
  try {
    const pathname = decodeURIComponent(new URL(raw).pathname);
    if (!/(?:gift|voucher|δωρο|dorokart|dwrokart|doroepitag|gifcard)/iu.test(pathname)) return [];
    const out = new Set<number>();
    for (const match of pathname.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:eur|euro|gbp|chf|usd|e)?(?:[-_/]|$)/giu)) {
      const parsed = parseNumber(match[1]);
      if (parsed !== null) out.add(parsed);
    }
    return [...out].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function currencyFromText(value: string): Currency | null {
  if (/£|\bgbp\b/iu.test(value)) return "GBP";
  if (/\bchf\b/iu.test(value)) return "CHF";
  if (/\busd\b|\$/iu.test(value)) return "USD";
  if (/€|\beur(?:o)?s?\b|ευρώ|ευρω|\d\s*[eε]\b/iu.test(value)) return "EUR";
  return null;
}

function registrableDomain(raw: string) {
  try {
    const url = new URL(raw);
    return getDomain(url.hostname) || url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.replace(/\s+/g, " ").trim()).filter(Boolean) as string[])];
}

function numericValue(value: unknown) {
  if (typeof value === "number") return parseNumber(String(value));
  if (typeof value !== "string") return null;
  return parseNumber(value.replace(/[^\d.,]/g, ""));
}

function jsonLdEvidence(html: string) {
  const $ = load(html);
  const names: string[] = [];
  const prices: PriceEvidence[] = [];
  const walk = (node: unknown, inheritedCurrency: Currency | null = null) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, inheritedCurrency);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const currency =
      (typeof record.priceCurrency === "string" ? currencyFromText(record.priceCurrency) : null) ||
      inheritedCurrency;
    for (const key of ["name", "headline"]) {
      if (typeof record[key] === "string") names.push(record[key] as string);
    }
    for (const key of ["price", "lowPrice", "highPrice", "minPrice", "maxPrice"]) {
      const parsed = numericValue(record[key]);
      if (parsed !== null) prices.push({ value: parsed, currency, source: `JSONLD_${key.toUpperCase()}` });
    }
    for (const value of Object.values(record)) walk(value, currency);
  };
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      walk(JSON.parse(raw));
    } catch {
      // Invalid third-party JSON-LD is ignored; other evidence remains available.
    }
  });
  return { names: uniqueStrings(names), prices };
}

function pageEvidence(html: string) {
  const $ = load(html);
  const title = $("title").first().text();
  const h1 = $("h1").first().text();
  const ogTitle = $("meta[property='og:title']").attr("content") || "";
  const productPrice =
    $("meta[property='product:price:amount']").attr("content") ||
    $("meta[itemprop='price']").attr("content") ||
    "";
  const productCurrency =
    $("meta[property='product:price:currency']").attr("content") ||
    $("meta[itemprop='priceCurrency']").attr("content") ||
    "";
  const jsonLd = jsonLdEvidence(html);
  const prices = [...jsonLd.prices];
  const parsedMetaPrice = numericValue(productPrice);
  if (parsedMetaPrice !== null) {
    prices.push({ value: parsedMetaPrice, currency: currencyFromText(productCurrency), source: "META_PRODUCT_PRICE" });
  }
  $("select").each((_, element) => {
    const marker = [$(element).attr("name"), $(element).attr("id"), $(element).attr("class")]
      .filter(Boolean)
      .join(" ");
    if (!/(?:gift|card|voucher|amount|denomination|δωρο|ποσ)/iu.test(marker)) return;
    $(element)
      .find("option")
      .each((__, option) => {
        const optionText = `${$(option).attr("value") || ""} ${$(option).text()}`;
        for (const value of explicitAmounts(optionText)) {
          prices.push({ value, currency: currencyFromText(optionText), source: "DOM_GIFT_OPTION" });
        }
      });
  });
  $("script, style, noscript, template").remove();
  const bodyText = normalizeText($("body").text()).slice(0, 250_000);
  const digitalMatch = bodyText.match(
    /(?:e-?gift\s*card|digital\s+gift\s*card|ηλεκτρονικ\p{L}*\s+δωροκαρτ\p{L}*|δωροκαρτ\p{L}*[^.]{0,120}(?:στελνεται|αποστελλεται|αποστολη)[^.]{0,60}(?:e-?mail|email)|(?:e-?mail|email)\s+παραληπτ\p{L}*)/iu,
  );
  return {
    identity: uniqueStrings([title, h1, ogTitle, ...jsonLd.names]).slice(0, 20),
    prices,
    digitalEvidence: digitalMatch?.[0]?.slice(0, 180) || null,
  };
}

function dedupePrices(values: PriceEvidence[]) {
  const byKey = new Map<string, PriceEvidence>();
  for (const item of values) {
    byKey.set(`${item.value}:${item.currency || "UNKNOWN"}:${item.source}`, item);
  }
  return [...byKey.values()].sort((a, b) => a.value - b.value || a.source.localeCompare(b.source));
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "el-GR,el;q=0.9,en;q=0.7",
      },
    });
    if (!response.ok) throw new Error(`PAGE_HTTP_${response.status}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`PAGE_NOT_HTML:${contentType || "unknown"}`);
    }
    return { html: await response.text(), finalUrl: response.url };
  } finally {
    clearTimeout(timer);
  }
}

function valuesRepresented(
  variants: Array<{ minValue: unknown; maxValue: unknown; customValueAllowed: boolean; values: Array<{ value: unknown }> }>,
  amounts: number[],
) {
  return amounts.every((amount) =>
    variants.some((variant) => {
      const values = variant.values.map((item) => Number(String(item.value)));
      const min = variant.minValue === null ? null : Number(String(variant.minValue));
      const max = variant.maxValue === null ? null : Number(String(variant.maxValue));
      return (
        values.includes(amount) ||
        min === amount ||
        max === amount ||
        (variant.customValueAllowed && min !== null && max !== null && amount >= min && amount <= max)
      );
    }),
  );
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(findings: Finding[]) {
  const headers: Array<keyof Finding> = [
    "status",
    "cardId",
    "merchantId",
    "merchantName",
    "title",
    "officialUrl",
    "finalUrl",
    "reasons",
    "titleAmounts",
    "urlAmounts",
    "pageIdentity",
    "priceEvidence",
    "proposedCurrency",
    "proposedValues",
    "explicitDigitalEvidence",
    "existingVariantCount",
  ];
  const lines = [
    headers.join(","),
    ...findings.map((finding) => headers.map((header) => csvEscape(finding[header])).join(",")),
  ];
  fs.writeFileSync(OUTPUT_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: "ACTIVE", officialUrl: { not: null } },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      merchantId: true,
      title: true,
      officialUrl: true,
      merchant: { select: { name: true } },
      variants: {
        select: {
          minValue: true,
          maxValue: true,
          customValueAllowed: true,
          values: { select: { value: true } },
        },
      },
    },
  });
  const targets = cards
    .filter((card) => {
      const amounts = titleAmounts(card.title);
      return (amounts.length > 0 && !valuesRepresented(card.variants, amounts)) || urlAmounts(card.officialUrl).length > 0;
    })
    .slice(0, LIMIT);
  const targetFingerprint = stableHash(
    targets.map((card) => ({
      id: card.id,
      merchantId: card.merchantId,
      title: card.title,
      officialUrl: card.officialUrl,
      variants: card.variants.map((variant) => ({
        minValue: String(variant.minValue ?? ""),
        maxValue: String(variant.maxValue ?? ""),
        customValueAllowed: variant.customValueAllowed,
        values: variant.values.map((item) => String(item.value)).sort(),
      })),
    })),
  );
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  const findings = await Promise.all(
    targets.map((card) =>
      limit(async (): Promise<Finding> => {
        const officialUrl = card.officialUrl!;
        const amounts = titleAmounts(card.title);
        const pathAmounts = urlAmounts(officialUrl);
        const base: Omit<Finding, "status" | "reasons" | "finalUrl" | "pageIdentity" | "priceEvidence" | "proposedCurrency" | "proposedValues" | "explicitDigitalEvidence"> = {
          cardId: card.id,
          merchantId: card.merchantId,
          merchantName: card.merchant.name,
          title: card.title,
          officialUrl,
          titleAmounts: amounts,
          urlAmounts: pathAmounts,
          existingVariantCount: card.variants.length,
        };
        try {
          const fetched = await fetchHtml(officialUrl);
          const evidence = pageEvidence(fetched.html);
          const prices = dedupePrices(evidence.prices);
          const identityText = evidence.identity.join(" | ");
          const pageHasGiftContext = /gift\s*(?:card|voucher)|giftcard|δωροκάρτ|δωροεπιταγ/iu.test(
            `${identityText} ${decodeURIComponent(new URL(fetched.finalUrl).pathname)}`,
          );
          const sameDomain = registrableDomain(officialUrl) === registrableDomain(fetched.finalUrl);
          const titleCurrency = currencyFromText(card.title);
          const matchingPrices = prices.filter(
            (price) => amounts.includes(price.value) && (!titleCurrency || !price.currency || price.currency === titleCurrency),
          );
          const priceValues = new Set(matchingPrices.map((price) => price.value));
          const allTitleAmountsPriced = amounts.length > 0 && amounts.every((amount) => priceValues.has(amount));
          const pageIdentityAmounts = explicitAmounts(identityText);
          const allTitleAmountsInIdentity =
            amounts.length > 0 && amounts.every((amount) => pageIdentityAmounts.includes(amount));
          const urlConflict =
            amounts.length > 0 && pathAmounts.length > 0 && !pathAmounts.some((amount) => amounts.includes(amount));
          const proposedCurrency =
            titleCurrency ||
            matchingPrices.map((price) => price.currency).find((currency): currency is Currency => Boolean(currency)) ||
            null;
          const reasons: string[] = [];
          if (!sameDomain) reasons.push("CROSS_DOMAIN_REDIRECT");
          if (!pageHasGiftContext) reasons.push("PAGE_IDENTITY_NOT_GIFT_CARD");
          if (!amounts.length) reasons.push("URL_DENOMINATION_ONLY");
          if (urlConflict) reasons.push("TITLE_URL_AMOUNT_CONFLICT");
          if (!allTitleAmountsPriced && !allTitleAmountsInIdentity) reasons.push("TITLE_AMOUNT_NOT_CONFIRMED_ON_PAGE");
          if (!proposedCurrency) reasons.push("CURRENCY_UNRESOLVED");
          if (!evidence.digitalEvidence) reasons.push("DELIVERY_TYPE_UNRESOLVED");
          const safe =
            sameDomain &&
            pageHasGiftContext &&
            amounts.length === 1 &&
            !urlConflict &&
            allTitleAmountsPriced &&
            Boolean(proposedCurrency) &&
            Boolean(evidence.digitalEvidence) &&
            card.variants.length === 0;
          const supportedAsIs =
            !safe &&
            sameDomain &&
            pageHasGiftContext &&
            amounts.length > 0 &&
            !urlConflict &&
            (allTitleAmountsPriced || allTitleAmountsInIdentity);
          const operatorExclusion = OPERATOR_EXCLUSIONS.get(card.id);
          return {
            ...base,
            finalUrl: fetched.finalUrl,
            status:
              safe && !operatorExclusion
                ? "SAFE_VALUE_EVIDENCE"
                : supportedAsIs
                  ? "SUPPORTED_AS_IS"
                  : "REVIEW",
            reasons:
              operatorExclusion
                ? ["OPERATOR_EXCLUDED_AFTER_RENDERED_PAGE_REVIEW", operatorExclusion]
                : safe
                  ? ["LIVE_OFFICIAL_PAGE", "STRUCTURED_PRICE_MATCH", "EXPLICIT_DIGITAL_DELIVERY"]
                  : reasons,
            pageIdentity: evidence.identity,
            priceEvidence: prices,
            proposedCurrency,
            proposedValues: safe ? amounts : [],
            explicitDigitalEvidence: evidence.digitalEvidence,
          };
        } catch (error) {
          return {
            ...base,
            finalUrl: null,
            status: "ERROR",
            reasons: [
              error instanceof Error && error.name === "AbortError"
                ? "PAGE_TIMEOUT"
                : error instanceof Error
                  ? error.message
                  : "PAGE_FETCH_FAILED",
            ],
            pageIdentity: [],
            priceEvidence: [],
            proposedCurrency: currencyFromText(card.title),
            proposedValues: [],
            explicitDigitalEvidence: null,
          };
        } finally {
          completed += 1;
          if (completed % 25 === 0 || completed === targets.length) {
            console.log(`Progress: ${completed}/${targets.length}`);
          }
        }
      }),
    ),
  );
  findings.sort((a, b) => a.merchantName.localeCompare(b.merchantName) || a.cardId.localeCompare(b.cardId));
  const summary = {
    safeValueEvidence: findings.filter((finding) => finding.status === "SAFE_VALUE_EVIDENCE").length,
    supportedAsIs: findings.filter((finding) => finding.status === "SUPPORTED_AS_IS").length,
    review: findings.filter((finding) => finding.status === "REVIEW").length,
    error: findings.filter((finding) => finding.status === "ERROR").length,
  };
  const material = { version: VERSION, mode: "PREVIEW" as const, targetFingerprint, targetCount: targets.length, summary, findings };
  const report = {
    ...material,
    generatedAt: new Date().toISOString(),
    reportId: stableHash(material),
    databaseWrites: 0,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(findings);
  fs.writeFileSync(
    path.join(REPORT_DIR, `denomination-evidence-v1-preview-${report.reportId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Denomination Evidence v1 — PREVIEW");
  console.log(`Report ID: ${report.reportId}`);
  console.log(`Targets: ${targets.length}`);
  console.log(`Safe value evidence: ${summary.safeValueEvidence}`);
  console.log(`Supported as-is: ${summary.supportedAsIs}`);
  console.log(`Review: ${summary.review}`);
  console.log(`Error: ${summary.error}`);
  console.log(`JSON: ${OUTPUT_JSON}`);
  console.log(`CSV: ${OUTPUT_CSV}`);
  console.log("PREVIEW ONLY — database unchanged.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
