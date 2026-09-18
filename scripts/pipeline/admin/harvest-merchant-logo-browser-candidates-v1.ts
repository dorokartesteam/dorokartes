import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { chromium } from "playwright";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = 1 as const;
const CONCURRENCY_ARG = process.argv.find((argument) => argument.startsWith("--concurrency="));
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.min(8, Math.max(1, Number(CONCURRENCY_ARG.split("=")[1])))
  : 5;
const REPORT_DIR = path.join(process.cwd(), "reports");
const OUTPUT_JSON = path.join(REPORT_DIR, "merchant-logo-browser-candidates-v1.json");
const OUTPUT_CSV = path.join(REPORT_DIR, "merchant-logo-browser-candidates-v1.csv");

type Candidate = {
  url: string;
  score: number;
  sameOfficialDomain: boolean;
  alt: string;
  marker: string;
  width: number;
  height: number;
  reasons: string[];
};

type Finding = {
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string | null;
  inspectedUrl: string | null;
  finalUrl: string | null;
  status: "CANDIDATE" | "REVIEW" | "NONE" | "ERROR";
  reasons: string[];
  candidates: Candidate[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function domain(raw: string) {
  try {
    const url = new URL(raw);
    return getDomain(url.hostname) || url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/g, " ")
    .trim();
}

function merchantTokens(name: string) {
  return normalize(name)
    .split(" ")
    .filter((token) => token.length >= 4 && !["gift", "card", "voucher", "δωροκαρτα"].includes(token));
}

function scoreCandidate(
  raw: Omit<Candidate, "score" | "sameOfficialDomain" | "reasons">,
  merchantName: string,
  pageUrl: string,
) {
  const reasons: string[] = [];
  const normalizedUrl = normalize(raw.url);
  const normalizedMarker = normalize(raw.marker);
  const normalizedAlt = normalize(raw.alt);
  const tokens = merchantTokens(merchantName);
  let score = 0;
  if (/\b(header|nav|navbar|site header)\b/.test(normalizedMarker)) {
    score += 90;
    reasons.push("HEADER_OR_NAV");
  }
  if (/\b(site logo|custom logo|main logo|header logo|navbar brand|logo)\b/.test(normalizedMarker)) {
    score += 85;
    reasons.push("EXPLICIT_LOGO_COMPONENT");
  }
  if (/logo/.test(normalizedUrl)) {
    score += 45;
    reasons.push("LOGO_FILENAME");
  }
  if (tokens.some((token) => normalizedAlt.includes(token) || normalizedUrl.includes(token))) {
    score += 45;
    reasons.push("MERCHANT_TOKEN_MATCH");
  }
  if (raw.width >= 80 && raw.height >= 24) {
    score += 15;
    reasons.push("USABLE_DIMENSIONS");
  }
  if (raw.width > 0 && raw.height > 0) {
    const ratio = raw.width / raw.height;
    if (ratio >= 1.5 && ratio <= 8) {
      score += 15;
      reasons.push("LOGO_LIKE_RATIO");
    }
  }
  if (/(favicon|wp-includes\/images\/w-logo|icon-|placeholder|avatar|product|banner|hero|payment|flag)/.test(normalizedUrl)) {
    score -= 140;
    reasons.push("NEGATIVE_ASSET_MARKER");
  }
  if (/(footer)/.test(normalizedMarker) && !/(header|nav)/.test(normalizedMarker)) {
    score -= 20;
    reasons.push("FOOTER_ONLY");
  }
  const sameOfficialDomain = domain(raw.url) === domain(pageUrl);
  if (sameOfficialDomain) {
    score += 25;
    reasons.push("SAME_OFFICIAL_DOMAIN");
  } else {
    reasons.push("PAGE_REFERENCED_EXTERNAL_ASSET");
  }
  return { ...raw, score, sameOfficialDomain, reasons };
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
  const headers = ["status", "merchantId", "merchantName", "merchantSlug", "websiteUrl", "finalUrl", "reasons", "candidateUrl", "score", "sameOfficialDomain", "alt", "marker", "width", "height", "candidateReasons"];
  const rows = findings.map((finding) => {
    const candidate = finding.candidates[0];
    return {
      status: finding.status,
      merchantId: finding.merchantId,
      merchantName: finding.merchantName,
      merchantSlug: finding.merchantSlug,
      websiteUrl: finding.websiteUrl,
      finalUrl: finding.finalUrl,
      reasons: finding.reasons,
      candidateUrl: candidate?.url,
      score: candidate?.score,
      sameOfficialDomain: candidate?.sameOfficialDomain,
      alt: candidate?.alt,
      marker: candidate?.marker,
      width: candidate?.width,
      height: candidate?.height,
      candidateReasons: candidate?.reasons,
    };
  });
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(","))];
  fs.writeFileSync(OUTPUT_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const merchants = await prisma.merchant.findMany({
    where: {
      status: "ACTIVE",
      giftCards: { some: { status: "ACTIVE" } },
      OR: [{ logoUrl: null }, { logoUrl: "" }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      logoUrl: true,
      logoSourceUrl: true,
      updatedAt: true,
      giftCards: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { officialUrl: true },
      },
    },
  });
  const targetFingerprint = stableHash(
    merchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      websiteUrl: merchant.websiteUrl,
      officialUrl: merchant.giftCards[0]?.officialUrl || null,
      logoUrl: merchant.logoUrl,
      logoSourceUrl: merchant.logoSourceUrl,
      updatedAt: merchant.updatedAt.toISOString(),
    })),
  );
  const browser = await chromium.launch({ headless: true });
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  const findings = await Promise.all(
    merchants.map((merchant) =>
      limit(async (): Promise<Finding> => {
        const inspectedUrl = merchant.websiteUrl || merchant.giftCards[0]?.officialUrl || null;
        const base = {
          merchantId: merchant.id,
          merchantName: merchant.name,
          merchantSlug: merchant.slug,
          websiteUrl: merchant.websiteUrl,
          inspectedUrl,
        };
        if (!inspectedUrl) {
          return { ...base, finalUrl: null, status: "ERROR", reasons: ["NO_OFFICIAL_PAGE"], candidates: [] };
        }
        const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
        try {
          const response = await page.goto(inspectedUrl, { waitUntil: "domcontentloaded", timeout: 35_000 });
          await page.waitForTimeout(1_200);
          const finalUrl = page.url();
          if (!response?.ok()) {
            return { ...base, finalUrl, status: "ERROR", reasons: [`PAGE_HTTP_${response?.status() ?? "UNKNOWN"}`], candidates: [] };
          }
          const extracted = await page.locator("img").evaluateAll((images) =>
            images.map((image) => {
              const element = image as HTMLImageElement;
              const ancestors: string[] = [];
              let current: Element | null = element;
              for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
                ancestors.push(`${current.tagName}#${current.id}.${current.className || ""}`);
              }
              return {
                url: element.currentSrc || element.src,
                alt: element.alt || "",
                marker: ancestors.join(" "),
                width: element.naturalWidth || Number(element.getAttribute("width")) || 0,
                height: element.naturalHeight || Number(element.getAttribute("height")) || 0,
              };
            }),
          );
          const unique = new Map<string, Omit<Candidate, "score" | "sameOfficialDomain" | "reasons">>();
          for (const item of extracted) {
            if (!item.url || !/^https?:/i.test(item.url)) continue;
            const marker = normalize(`${item.marker} ${item.alt} ${item.url}`);
            if (!/(logo|brand|site header|navbar|navigation|header)/.test(marker)) continue;
            const existing = unique.get(item.url);
            if (!existing || item.marker.length > existing.marker.length) unique.set(item.url, item);
          }
          const candidates = [...unique.values()]
            .map((candidate) => scoreCandidate(candidate, merchant.name, finalUrl))
            .sort((a, b) => b.score - a.score || b.width * b.height - a.width * a.height)
            .slice(0, 8);
          const best = candidates[0];
          const candidateStatus = Boolean(best && best.score >= 180 && best.sameOfficialDomain);
          return {
            ...base,
            finalUrl,
            status: candidateStatus ? "CANDIDATE" : candidates.length ? "REVIEW" : "NONE",
            reasons: candidateStatus
              ? ["RENDERED_OFFICIAL_PAGE", "STRONG_HEADER_LOGO_CANDIDATE", "VISUAL_REVIEW_REQUIRED"]
              : candidates.length
                ? ["NO_AUTO_SAFE_BROWSER_CANDIDATE"]
                : ["NO_RENDERED_LOGO_CANDIDATE"],
            candidates,
          };
        } catch (error) {
          return {
            ...base,
            finalUrl: null,
            status: "ERROR",
            reasons: [
              error instanceof Error && error.name === "TimeoutError"
                ? "PAGE_TIMEOUT"
                : error instanceof Error
                  ? error.message
                  : "PAGE_FAILED",
            ],
            candidates: [],
          };
        } finally {
          completed += 1;
          if (completed % 5 === 0 || completed === merchants.length) console.log(`Progress: ${completed}/${merchants.length}`);
          await page.close();
        }
      }),
    ),
  );
  await browser.close();
  findings.sort((a, b) => a.merchantName.localeCompare(b.merchantName) || a.merchantId.localeCompare(b.merchantId));
  const summary = {
    candidates: findings.filter((finding) => finding.status === "CANDIDATE").length,
    review: findings.filter((finding) => finding.status === "REVIEW").length,
    none: findings.filter((finding) => finding.status === "NONE").length,
    error: findings.filter((finding) => finding.status === "ERROR").length,
  };
  const material = { version: VERSION, mode: "READ_ONLY_BROWSER_PREVIEW" as const, targetFingerprint, targetCount: merchants.length, summary, findings };
  const report = { ...material, generatedAt: new Date().toISOString(), reportId: stableHash(material), databaseWrites: 0 };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(findings);
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-logo-browser-candidates-v1-${report.reportId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log("Dorokartes Merchant Logo Browser Candidates v1 — READ ONLY");
  console.log(`Report ID: ${report.reportId}`);
  console.log(`Targets: ${report.targetCount}`);
  console.log(`Candidates: ${summary.candidates}`);
  console.log(`Review: ${summary.review}`);
  console.log(`None: ${summary.none}`);
  console.log(`Error: ${summary.error}`);
  console.log("Database writes: 0");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
