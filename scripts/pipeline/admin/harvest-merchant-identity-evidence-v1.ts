import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import pLimit from "p-limit";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = "merchant-identity-evidence-v1" as const;
const REPORT_DIR = path.join(process.cwd(), "reports");
const REPORT_JSON = path.join(REPORT_DIR, `${VERSION}.json`);
const REPORT_CSV = path.join(REPORT_DIR, `${VERSION}.csv`);
const CONCURRENCY_ARG = process.argv.find((argument) => argument.startsWith("--concurrency="));
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.min(12, Math.max(1, Number(CONCURRENCY_ARG.split("=")[1])))
  : 8;

type EvidenceSource =
  | "HOME_JSONLD_ORGANIZATION"
  | "HOME_OG_SITE_NAME"
  | "HOME_LOGO_ALT"
  | "HOME_TITLE"
  | "GIFT_JSONLD_BRAND"
  | "GIFT_JSONLD_ORGANIZATION"
  | "GIFT_OG_SITE_NAME"
  | "GIFT_LOGO_ALT"
  | "GIFT_TITLE";

type RawCandidate = {
  value: string;
  source: EvidenceSource;
  sourceUrl: string;
  weight: number;
};

type Candidate = {
  value: string;
  normalizedValue: string;
  score: number;
  sources: EvidenceSource[];
  sourceUrls: string[];
};

type PageEvidence = {
  requestedUrl: string;
  finalUrl: string | null;
  status: number | null;
  title: string | null;
  ogSiteName: string | null;
  jsonLdOrganizations: string[];
  jsonLdBrands: string[];
  logoAlts: string[];
  error: string | null;
};

type Finding = {
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string | null;
  giftCardId: string;
  giftCardTitle: string;
  officialUrl: string | null;
  status: "CANDIDATE" | "REVIEW" | "ERROR";
  reasonCodes: string[];
  currentNameLooksPolluted: boolean;
  home: PageEvidence;
  giftCardPage: PageEvidence;
  candidates: Candidate[];
};

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function registeredDomain(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return getDomain(url.hostname) || url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function looksPolluted(value: string) {
  return /(?:gift\s*(?:card|cards|voucher|vouchers)|δωροκ[α-ωά-ώ]*|δωροεπιταγ[α-ωά-ώ]*|αγορασ(?:τε|ε)|στειλτε|προσφερετε|make\s+a\s+gift|\b(?:10|20|25|30|40|50|60|75|80|90|100|150|200|250|300|500)\s*(?:€|eur|euro)|[-–|:]\s*$)/iu.test(
    value,
  );
}

function usefulCandidate(value: string) {
  const clean = cleanText(value);
  const normalized = normalize(clean);
  if (!clean || normalized.length < 2 || normalized.length > 80) return false;
  if (/^(?:home|homepage|eshop|e shop|shop|store|welcome|image|logo|gift card|gift cards|voucher|δωροκαρτα|δωροεπιταγες)$/i.test(normalized)) {
    return false;
  }
  if (looksPolluted(clean)) return false;
  return true;
}

function titleSegments(title: string) {
  const parts = title
    .split(/\s+(?:\||–|—|::)\s+|\s+-\s+/)
    .map(cleanText)
    .filter(usefulCandidate);
  return [...new Set([cleanText(title), ...parts].filter(usefulCandidate))];
}

function flattenJsonLd(value: unknown, output: Array<Record<string, unknown>> = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  const object = value as Record<string, unknown>;
  output.push(object);
  for (const key of ["@graph", "publisher", "author", "brand", "manufacturer", "seller"] as const) {
    if (object[key]) flattenJsonLd(object[key], output);
  }
  return output;
}

function schemaTypes(value: unknown) {
  return (Array.isArray(value) ? value : [value]).map(String);
}

function parseJsonLd(raw: string) {
  const cleaned = raw.trim().replace(/^\s*<!--/, "").replace(/-->\s*$/, "");
  if (!cleaned) return [];
  try {
    return flattenJsonLd(JSON.parse(cleaned));
  } catch {
    return [];
  }
}

function emptyPage(requestedUrl: string): PageEvidence {
  return {
    requestedUrl,
    finalUrl: null,
    status: null,
    title: null,
    ogSiteName: null,
    jsonLdOrganizations: [],
    jsonLdBrands: [],
    logoAlts: [],
    error: null,
  };
}

async function fetchPage(requestedUrl: string, expectedDomain: string): Promise<PageEvidence> {
  const evidence = emptyPage(requestedUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(requestedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    evidence.status = response.status;
    evidence.finalUrl = response.url;
    if (!response.ok) {
      evidence.error = `HTTP_${response.status}`;
      return evidence;
    }
    if (registeredDomain(response.url) !== expectedDomain) {
      evidence.error = "CROSS_DOMAIN_REDIRECT";
      return evidence;
    }
    const html = await response.text();
    const $ = load(html);
    evidence.title = cleanText($("title").first().text()) || null;
    evidence.ogSiteName =
      cleanText($("meta[property='og:site_name']").first().attr("content")) || null;
    const organizations = new Set<string>();
    const brands = new Set<string>();
    $("script[type='application/ld+json']").each((_index, element) => {
      for (const object of parseJsonLd($(element).text())) {
        const types = schemaTypes(object["@type"]);
        const name = cleanText(typeof object.name === "string" ? object.name : null);
        if (!name) continue;
        if (types.some((type) => /(?:Organization|LocalBusiness|Store|Corporation|WebSite)/i.test(type))) {
          organizations.add(name);
        }
        if (types.some((type) => /^Brand$/i.test(type))) brands.add(name);
      }
    });
    evidence.jsonLdOrganizations = [...organizations];
    evidence.jsonLdBrands = [...brands];
    const logoAlts = new Set<string>();
    $("header img, nav img, #logo img, .logo img, [class*='logo'] img, img[class*='logo']")
      .slice(0, 20)
      .each((_index, element) => {
        const alt = cleanText($(element).attr("alt"));
        if (usefulCandidate(alt)) logoAlts.add(alt);
      });
    evidence.logoAlts = [...logoAlts];
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timeout);
  }
  return evidence;
}

function addCandidate(
  output: RawCandidate[],
  value: string | null | undefined,
  source: EvidenceSource,
  sourceUrl: string,
  weight: number,
) {
  if (!value) return;
  for (const candidate of source.endsWith("TITLE") ? titleSegments(value) : [cleanText(value)]) {
    if (!usefulCandidate(candidate)) continue;
    output.push({ value: candidate, source, sourceUrl, weight });
  }
}

function rankedCandidates(raw: RawCandidate[]) {
  const grouped = new Map<string, RawCandidate[]>();
  for (const candidate of raw) {
    const key = normalize(candidate.value);
    grouped.set(key, [...(grouped.get(key) || []), candidate]);
  }
  return [...grouped.entries()]
    .map(([normalizedValue, rows]): Candidate => {
      const uniqueSources = [...new Set(rows.map((row) => row.source))];
      const independentPageBonus =
        rows.some((row) => row.source.startsWith("HOME_")) &&
        rows.some((row) => row.source.startsWith("GIFT_"))
          ? 60
          : 0;
      const agreementBonus = Math.max(0, uniqueSources.length - 1) * 25;
      return {
        value: [...rows].sort((a, b) => b.weight - a.weight)[0].value,
        normalizedValue,
        score: Math.max(...rows.map((row) => row.weight)) + independentPageBonus + agreementBonus,
        sources: uniqueSources.sort(),
        sourceUrls: [...new Set(rows.map((row) => row.sourceUrl))].sort(),
      };
    })
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value, "el"));
}

async function loadTargets() {
  const merchants = await prisma.merchant.findMany({
    where: { status: "ACTIVE", giftCards: { some: { status: "ACTIVE" } } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      giftCards: {
        where: { status: "ACTIVE" },
        orderBy: { id: "asc" },
        take: 1,
        select: { id: true, title: true, officialUrl: true },
      },
    },
  });
  return merchants.filter((merchant) => {
    const card = merchant.giftCards[0];
    return Boolean(
      card &&
        (looksPolluted(merchant.name) || normalize(merchant.name) === normalize(card.title)),
    );
  });
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(findings: Finding[]) {
  const headers = [
    "status",
    "merchantId",
    "merchantName",
    "merchantSlug",
    "websiteUrl",
    "giftCardId",
    "giftCardTitle",
    "officialUrl",
    "reasonCodes",
    "candidateName",
    "candidateScore",
    "candidateSources",
    "homeStatus",
    "giftPageStatus",
  ];
  const rows = findings.map((finding) => ({
    ...finding,
    candidateName: finding.candidates[0]?.value || "",
    candidateScore: finding.candidates[0]?.score || "",
    candidateSources: finding.candidates[0]?.sources || [],
    homeStatus: finding.home.status || finding.home.error,
    giftPageStatus: finding.giftCardPage.status || finding.giftCardPage.error,
  }));
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape((row as unknown as Record<string, unknown>)[header])).join(","),
    ),
  ];
  fs.writeFileSync(REPORT_CSV, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

async function inspectTarget(target: Awaited<ReturnType<typeof loadTargets>>[number]): Promise<Finding> {
  const card = target.giftCards[0];
  const expectedDomain = registeredDomain(target.websiteUrl || card.officialUrl);
  if (!card || !expectedDomain) {
    const empty = emptyPage(target.websiteUrl || "");
    return {
      merchantId: target.id,
      merchantName: target.name,
      merchantSlug: target.slug,
      websiteUrl: target.websiteUrl,
      giftCardId: card?.id || "",
      giftCardTitle: card?.title || "",
      officialUrl: card?.officialUrl || null,
      status: "ERROR",
      reasonCodes: ["OFFICIAL_DOMAIN_MISSING"],
      currentNameLooksPolluted: looksPolluted(target.name),
      home: empty,
      giftCardPage: emptyPage(card?.officialUrl || ""),
      candidates: [],
    };
  }
  const homeUrl = target.websiteUrl || `https://${expectedDomain}`;
  const giftUrl = card.officialUrl || homeUrl;
  const [home, giftCardPage] = await Promise.all([
    fetchPage(homeUrl, expectedDomain),
    giftUrl === homeUrl ? Promise.resolve(null) : fetchPage(giftUrl, expectedDomain),
  ]);
  const gift = giftCardPage || home;
  const raw: RawCandidate[] = [];
  for (const value of home.jsonLdOrganizations) addCandidate(raw, value, "HOME_JSONLD_ORGANIZATION", home.finalUrl || homeUrl, 120);
  addCandidate(raw, home.ogSiteName, "HOME_OG_SITE_NAME", home.finalUrl || homeUrl, 110);
  for (const value of home.logoAlts) addCandidate(raw, value, "HOME_LOGO_ALT", home.finalUrl || homeUrl, 90);
  addCandidate(raw, home.title, "HOME_TITLE", home.finalUrl || homeUrl, 70);
  for (const value of gift.jsonLdBrands) addCandidate(raw, value, "GIFT_JSONLD_BRAND", gift.finalUrl || giftUrl, 110);
  for (const value of gift.jsonLdOrganizations) addCandidate(raw, value, "GIFT_JSONLD_ORGANIZATION", gift.finalUrl || giftUrl, 100);
  addCandidate(raw, gift.ogSiteName, "GIFT_OG_SITE_NAME", gift.finalUrl || giftUrl, 90);
  for (const value of gift.logoAlts) addCandidate(raw, value, "GIFT_LOGO_ALT", gift.finalUrl || giftUrl, 80);
  addCandidate(raw, gift.title, "GIFT_TITLE", gift.finalUrl || giftUrl, 50);
  const candidates = rankedCandidates(raw).filter(
    (candidate) => candidate.normalizedValue !== normalize(target.name),
  );
  const top = candidates[0];
  const runnerUp = candidates[1];
  const reasonCodes: string[] = [];
  if (home.error) reasonCodes.push(`HOME_${home.error}`);
  if (gift.error) reasonCodes.push(`GIFT_${gift.error}`);
  if (!top) reasonCodes.push("NO_CLEAN_IDENTITY_CANDIDATE");
  else if (top.score < 135) reasonCodes.push("CANDIDATE_SUPPORT_TOO_WEAK");
  else if (runnerUp && top.score - runnerUp.score < 20) reasonCodes.push("IDENTITY_CANDIDATES_CONFLICT");
  else reasonCodes.push("STRONG_OFFICIAL_IDENTITY_CANDIDATE");
  const status: Finding["status"] = reasonCodes.includes("STRONG_OFFICIAL_IDENTITY_CANDIDATE")
    ? "CANDIDATE"
    : home.error && gift.error
      ? "ERROR"
      : "REVIEW";
  return {
    merchantId: target.id,
    merchantName: target.name,
    merchantSlug: target.slug,
    websiteUrl: target.websiteUrl,
    giftCardId: card.id,
    giftCardTitle: card.title,
    officialUrl: card.officialUrl,
    status,
    reasonCodes,
    currentNameLooksPolluted: looksPolluted(target.name),
    home,
    giftCardPage: gift,
    candidates,
  };
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const targets = await loadTargets();
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  const findings = await Promise.all(
    targets.map((target) =>
      limit(async () => {
        const finding = await inspectTarget(target);
        completed += 1;
        if (completed % 5 === 0 || completed === targets.length) {
          console.log(`Progress: ${completed}/${targets.length}`);
        }
        return finding;
      }),
    ),
  );
  findings.sort((a, b) => a.merchantName.localeCompare(b.merchantName, "el"));
  const material = {
    version: VERSION,
    mode: "READ_ONLY_EVIDENCE" as const,
    generatedAt: new Date().toISOString(),
    targetFingerprint: stableHash(targets),
    targetCount: targets.length,
    summary: {
      candidates: findings.filter((finding) => finding.status === "CANDIDATE").length,
      review: findings.filter((finding) => finding.status === "REVIEW").length,
      error: findings.filter((finding) => finding.status === "ERROR").length,
      databaseWrites: 0,
    },
    findings,
  };
  const report = { ...material, reportId: stableHash(material) };
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `${VERSION}-${report.reportId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeCsv(findings);
  console.log("Dorokartes Merchant Identity Evidence v1 — READ-ONLY");
  console.log(`Report ID: ${report.reportId}`);
  console.log(`Targets: ${report.targetCount}`);
  console.log(`Candidates: ${report.summary.candidates}`);
  console.log(`Review: ${report.summary.review}`);
  console.log(`Error: ${report.summary.error}`);
  console.log("READ ONLY — no database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
