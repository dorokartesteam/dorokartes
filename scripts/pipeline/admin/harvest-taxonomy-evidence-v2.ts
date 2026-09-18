import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { prisma } from "../../../lib/prisma";

const VERSION = "taxonomy-evidence-v2";
const REPORT_DIR = path.join(process.cwd(), "reports");
const REPORT_JSON = path.join(REPORT_DIR, "taxonomy-evidence-v2.json");
const REPORT_CSV = path.join(REPORT_DIR, "taxonomy-evidence-v2.csv");
const CONCURRENCY = 10;
const TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_000_000;

type FetchEvidence = {
  requestedUrl: string;
  finalUrl: string | null;
  status: number | null;
  ok: boolean;
  contentType: string | null;
  title: string | null;
  description: string | null;
  headings: string[];
  navigation: string[];
  excerpt: string | null;
  error: string | null;
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function unique(values: string[], limit: number) {
  return [...new Set(values.map(cleanText).filter(Boolean))].slice(0, limit);
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchEvidence(requestedUrl: string): Promise<FetchEvidence> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(requestedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "DorokartesCatalogAudit/2.0 (+https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "el,en;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type");
    if (!contentType?.toLowerCase().includes("text/html")) {
      return {
        requestedUrl,
        finalUrl: response.url || null,
        status: response.status,
        ok: false,
        contentType,
        title: null,
        description: null,
        headings: [],
        navigation: [],
        excerpt: null,
        error: "NON_HTML_RESPONSE",
      };
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_HTML_BYTES) {
      return {
        requestedUrl,
        finalUrl: response.url || null,
        status: response.status,
        ok: false,
        contentType,
        title: null,
        description: null,
        headings: [],
        navigation: [],
        excerpt: null,
        error: "HTML_TOO_LARGE",
      };
    }

    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const $ = cheerio.load(html);
    $("script,style,noscript,svg").remove();
    const title = cleanText($("title").first().text()) || null;
    const description = cleanText(
      $('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content"),
    ) || null;
    const headings = unique($("h1,h2,h3").map((_, node) => $(node).text()).get(), 24);
    const navigation = unique($("nav a,header a,[class*=menu] a,[class*=categor] a").map((_, node) => $(node).text()).get(), 80);
    const excerpt = cleanText($("body").text()).slice(0, 6_000) || null;

    return {
      requestedUrl,
      finalUrl: response.url || null,
      status: response.status,
      ok: response.ok,
      contentType,
      title,
      description,
      headings,
      navigation,
      excerpt,
      error: response.ok ? null : `HTTP_${response.status}`,
    };
  } catch (error) {
    return {
      requestedUrl,
      finalUrl: null,
      status: null,
      ok: false,
      contentType: null,
      title: null,
      description: null,
      headings: [],
      navigation: [],
      excerpt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: "ACTIVE", categories: { none: {} } },
    orderBy: [{ merchant: { name: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      officialUrl: true,
      shortDescription: true,
      merchant: {
        select: { id: true, name: true, websiteUrl: true },
      },
    },
  });

  const urls = [...new Set(cards.flatMap((card) => [card.officialUrl, card.merchant.websiteUrl]).filter(Boolean))] as string[];
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  const fetched = await Promise.all(
    urls.map((url) => limit(async () => {
      const result = await fetchEvidence(url);
      completed += 1;
      if (completed % 50 === 0 || completed === urls.length) console.log(`Fetched ${completed}/${urls.length}`);
      return result;
    })),
  );
  const byUrl = new Map(fetched.map((result) => [result.requestedUrl, result]));

  const rows = cards.map((card) => ({
    giftCardId: card.id,
    merchantId: card.merchant.id,
    merchantName: card.merchant.name,
    giftCardTitle: card.title,
    shortDescription: card.shortDescription,
    officialUrl: card.officialUrl,
    websiteUrl: card.merchant.websiteUrl,
    officialEvidence: card.officialUrl ? byUrl.get(card.officialUrl) || null : null,
    websiteEvidence: card.merchant.websiteUrl ? byUrl.get(card.merchant.websiteUrl) || null : null,
  }));
  const reportWithoutId = {
    version: VERSION,
    mode: "EVIDENCE_ONLY",
    generatedAt: new Date().toISOString(),
    cardCount: cards.length,
    fetchedUrlCount: fetched.length,
    successfulUrlCount: fetched.filter((result) => result.ok).length,
    failedUrlCount: fetched.filter((result) => !result.ok).length,
    rows,
  };
  const report = { ...reportWithoutId, reportId: stableHash(reportWithoutId) };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  const csvRows = [
    ["giftCardId", "merchantName", "giftCardTitle", "officialUrl", "websiteUrl", "officialStatus", "officialTitle", "officialDescription", "officialHeadings", "websiteStatus", "websiteTitle", "websiteDescription", "websiteHeadings", "errors"],
    ...rows.map((row) => [
      row.giftCardId,
      row.merchantName,
      row.giftCardTitle,
      row.officialUrl,
      row.websiteUrl,
      row.officialEvidence?.status,
      row.officialEvidence?.title,
      row.officialEvidence?.description,
      row.officialEvidence?.headings,
      row.websiteEvidence?.status,
      row.websiteEvidence?.title,
      row.websiteEvidence?.description,
      row.websiteEvidence?.headings,
      [row.officialEvidence?.error, row.websiteEvidence?.error].filter(Boolean),
    ]),
  ];
  fs.writeFileSync(REPORT_CSV, `${csvRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);

  const immutableBase = `${VERSION}-${report.reportId.slice(0, 16)}`;
  fs.copyFileSync(REPORT_JSON, path.join(REPORT_DIR, `${immutableBase}.json`));
  fs.copyFileSync(REPORT_CSV, path.join(REPORT_DIR, `${immutableBase}.csv`));

  console.log("Dorokartes Taxonomy Evidence v2");
  console.log(`Report ID: ${report.reportId}`);
  console.log(`Cards: ${report.cardCount}`);
  console.log(`URLs: ${report.fetchedUrlCount}`);
  console.log(`Successful: ${report.successfulUrlCount}`);
  console.log(`Failed: ${report.failedUrlCount}`);
  console.log("EVIDENCE ONLY — no database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
