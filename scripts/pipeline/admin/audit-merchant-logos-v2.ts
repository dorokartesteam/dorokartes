import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

type Classification = "SAFE" | "REVIEW" | "REPLACE";
type Priority = "HIGH" | "MEDIUM" | "LOW";

type AuditRow = {
  merchantId: string;
  merchantName: string;
  websiteUrl: string | null;
  currentLogoUrl: string;
  logoSourceUrl: string | null;
  localFileExists: boolean | null;
  websiteHost: string | null;
  sourceHost: string | null;
  sourceOfficialDomain: "YES" | "NO" | "UNKNOWN";
  classification: Classification;
  priority: Priority;
  reasons: string[];
};

const REPORT_DIR = path.resolve(process.cwd(), "reports");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const HIGH_PRIORITY_BRANDS = [
  "adidas", "sephora", "amazon", "airbnb", "ikea", "public",
  "kotsovolos", "nike", "h&m", "hm", "zara", "aegean",
  "skroutz", "attica", "notos", "intersport", "cosmote",
  "vodafone", "germanos", "plaisio", "marks & spencer",
  "marks and spencer", "mango", "bershka", "pull&bear",
  "pull and bear", "stradivarius", "oysho", "zalando",
];

const HARD_BAD = [
  "favicon.ico",
  "/favicon.",
  "/favicon/",
  "apple-touch-icon",
  "apple_touch_icon",
  "mstile",
  "browserconfig",
];

const SOFT_ICON = [
  "favicon",
  "fav_",
  "fav-",
  "/fav.",
  "cropped-",
  "site-icon",
  "site_icon",
  "icon-192",
  "icon-180",
  "icon-152",
  "icon-144",
  "icon-128",
  "icon-120",
  "icon-96",
];

const SUSPICIOUS_ASSET = [
  "placeholder",
  "generated",
  "dummy",
  "default-logo",
  "default_logo",
  "sample-logo",
  "mock-logo",
  "ai-generated",
  "ai_generated",
  "gift-card",
  "gift_card",
  "giftcard",
  "christmas",
  "valentine",
  "archives",
];

const POSITIVE_LOGO = [
  "logo",
  "wordmark",
  "brandmark",
  "brand-logo",
  "header_logo",
  "header-logo",
  "logo_black",
  "logo-black",
  "logo_white",
  "logo-white",
];

function cleanHost(value?: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.startsWith("http") ? value : `https://${value}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function relatedHost(a: string | null, b: string | null) {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function isLocal(url: string) {
  return url.startsWith("/") && !url.startsWith("//");
}

function localExists(url: string): boolean | null {
  if (!isLocal(url)) return null;
  const target = path.resolve(PUBLIC_DIR, url.replace(/^\/+/, ""));
  if (!target.startsWith(PUBLIC_DIR)) return false;
  return fs.existsSync(target);
}

function extractDims(value: string) {
  const matches = [...value.matchAll(/(?:^|[^0-9])(\d{2,4})x(\d{2,4})(?:[^0-9]|$)/gi)];
  return matches.map((m) => ({ w: Number(m[1]), h: Number(m[2]) }));
}

function looksMajor(name: string) {
  const n = name.toLowerCase().trim();
  return HIGH_PRIORITY_BRANDS.some((brand) =>
    n === brand || n.includes(brand) || brand.includes(n)
  );
}

function csvEscape(value: unknown) {
  const v = Array.isArray(value) ? value.join(" | ") : value == null ? "" : String(value);
  return `"${v.replaceAll('"', '""')}"`;
}

function classify(input: {
  merchantName: string;
  websiteUrl: string | null;
  logoUrl: string;
  logoSourceUrl: string | null;
}) {
  const { merchantName, websiteUrl, logoUrl, logoSourceUrl } = input;
  const reasons: string[] = [];

  const evidence = `${logoUrl} ${logoSourceUrl ?? ""}`.toLowerCase();
  const source = (logoSourceUrl ?? "").toLowerCase();
  const current = logoUrl.toLowerCase();

  const websiteHost = cleanHost(websiteUrl);
  const sourceHost = cleanHost(logoSourceUrl);
  const official = websiteHost && sourceHost
    ? (relatedHost(websiteHost, sourceHost) ? "YES" : "NO")
    : "UNKNOWN";

  const exists = localExists(logoUrl);

  if (exists === false) reasons.push("LOCAL_FILE_MISSING");

  if (current.endsWith(".ico") || source.endsWith(".ico")) {
    reasons.push("ICO_NOT_PROPER_LOGO");
  }

  for (const token of HARD_BAD) {
    if (evidence.includes(token)) reasons.push(`HARD_ICON:${token}`);
  }

  for (const token of SOFT_ICON) {
    if (evidence.includes(token)) reasons.push(`ICON_LIKE:${token}`);
  }

  for (const token of SUSPICIOUS_ASSET) {
    if (current.includes(token)) reasons.push(`SUSPICIOUS_LOCAL_FILENAME:${token}`);
  }

  const dims = extractDims(source);
  for (const d of dims) {
    if (d.w <= 96 && d.h <= 96) {
      reasons.push(`VERY_SMALL_SOURCE:${d.w}x${d.h}`);
      break;
    }
    if (d.w <= 192 && d.h <= 192) {
      reasons.push(`SMALL_SOURCE:${d.w}x${d.h}`);
      break;
    }
  }

  if (!logoSourceUrl) reasons.push("NO_SOURCE_EVIDENCE");

  if (official === "NO") reasons.push("SOURCE_NOT_MERCHANT_DOMAIN");
  if (!websiteHost) reasons.push("MERCHANT_WEBSITE_MISSING_OR_INVALID");
  if (logoSourceUrl && !sourceHost) reasons.push("SOURCE_URL_INVALID");

  const positiveLogo = POSITIVE_LOGO.some((token) => source.includes(token));
  if (positiveLogo) reasons.push("POSITIVE_LOGO_FILENAME");

  let classification: Classification = "REVIEW";

  const hardReplace =
    reasons.includes("LOCAL_FILE_MISSING") ||
    reasons.includes("ICO_NOT_PROPER_LOGO") ||
    reasons.some((r) => r.startsWith("HARD_ICON:")) ||
    reasons.some((r) => r.startsWith("VERY_SMALL_SOURCE:"));

  if (hardReplace) {
    classification = "REPLACE";
  } else {
    const hasIconConcern = reasons.some((r) => r.startsWith("ICON_LIKE:"));
    const hasSuspiciousName = reasons.some((r) => r.startsWith("SUSPICIOUS_LOCAL_FILENAME:"));
    const small = reasons.some((r) => r.startsWith("SMALL_SOURCE:"));
    const noSource = reasons.includes("NO_SOURCE_EVIDENCE");
    const thirdParty = reasons.includes("SOURCE_NOT_MERCHANT_DOMAIN");

    if (
      official === "YES" &&
      positiveLogo &&
      !hasIconConcern &&
      !hasSuspiciousName &&
      !small
    ) {
      classification = "SAFE";
    } else if (
      official === "YES" &&
      !hasIconConcern &&
      !hasSuspiciousName &&
      !small &&
      !noSource
    ) {
      classification = "SAFE";
    } else {
      classification = "REVIEW";
    }

    // Third-party CDN is review, not automatic replacement.
    if (thirdParty) classification = "REVIEW";
  }

  const priority: Priority =
    looksMajor(merchantName) ? "HIGH" :
    classification === "REPLACE" ? "HIGH" :
    classification === "REVIEW" ? "MEDIUM" :
    "LOW";

  return {
    localFileExists: exists,
    websiteHost,
    sourceHost,
    sourceOfficialDomain: official as "YES" | "NO" | "UNKNOWN",
    classification,
    priority,
    reasons,
  };
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const merchants = await prisma.merchant.findMany({
    where: { logoUrl: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      logoUrl: true,
      logoSourceUrl: true,
    },
  });

  const rows: AuditRow[] = merchants.flatMap((m) => {
    if (!m.logoUrl) return [];
    return [{
      merchantId: m.id,
      merchantName: m.name,
      websiteUrl: m.websiteUrl,
      currentLogoUrl: m.logoUrl,
      logoSourceUrl: m.logoSourceUrl,
      ...classify({
        merchantName: m.name,
        websiteUrl: m.websiteUrl,
        logoUrl: m.logoUrl,
        logoSourceUrl: m.logoSourceUrl,
      }),
    }];
  });

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.classification] += 1;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REPLACE: 0 }
  );

  const highPriority = rows
    .filter((r) => r.priority === "HIGH" && r.classification !== "SAFE")
    .sort((a, b) =>
      a.classification === b.classification
        ? a.merchantName.localeCompare(b.merchantName, "el")
        : a.classification === "REPLACE" ? -1 : 1
    );

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORT_DIR, `merchant-logo-audit-v2-${timestamp}.json`);
  const csvPath = path.join(REPORT_DIR, `merchant-logo-audit-v2-${timestamp}.csv`);

  fs.writeFileSync(
    jsonPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      merchantsWithLogo: rows.length,
      counts,
      highPriority,
      rows,
    }, null, 2),
    "utf8"
  );

  const cols: Array<keyof AuditRow> = [
    "merchantId",
    "merchantName",
    "websiteUrl",
    "currentLogoUrl",
    "logoSourceUrl",
    "localFileExists",
    "websiteHost",
    "sourceHost",
    "sourceOfficialDomain",
    "classification",
    "priority",
    "reasons",
  ];

  fs.writeFileSync(
    csvPath,
    [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")),
    ].join("\n"),
    "utf8"
  );

  console.log("=== MERCHANT LOGO AUDIT V2 ===");
  console.log(`Merchants with logo: ${rows.length}`);
  console.log(`SAFE:    ${counts.SAFE}`);
  console.log(`REVIEW:  ${counts.REVIEW}`);
  console.log(`REPLACE: ${counts.REPLACE}`);
  console.log("");
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`CSV:  ${path.relative(process.cwd(), csvPath)}`);

  console.log("\n=== HIGH PRIORITY REVIEW/REPLACE ===");
  if (!highPriority.length) {
    console.log("None");
  } else {
    for (const r of highPriority) {
      console.log(
        `- [${r.classification}] ${r.merchantName} | ${r.currentLogoUrl} | ${r.logoSourceUrl ?? "NO SOURCE"} | ${r.reasons.join(", ")}`
      );
    }
  }

  console.log("\n=== FIRST 50 REPLACE ===");
  for (const r of rows.filter((x) => x.classification === "REPLACE").slice(0, 50)) {
    console.log(
      `- ${r.merchantName} | ${r.currentLogoUrl} | ${r.logoSourceUrl ?? "NO SOURCE"} | ${r.reasons.join(", ")}`
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
