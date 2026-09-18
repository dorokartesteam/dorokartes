import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

type Classification = "SAFE" | "REVIEW" | "REPLACE" | "REMOVE";

type AuditRow = {
  merchantId: string;
  merchantName: string;
  websiteUrl: string | null;
  currentLogoUrl: string;
  logoSourceUrl: string | null;
  storage: "LOCAL" | "REMOTE" | "OTHER";
  localFileExists: boolean | null;
  websiteHost: string | null;
  logoHost: string | null;
  sourceHost: string | null;
  domainMatch: "YES" | "NO" | "UNKNOWN" | "LOCAL";
  suspiciousReasons: string[];
  classification: Classification;
};

const REPORT_DIR = path.resolve(process.cwd(), "reports");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const SUSPICIOUS_TOKENS = [
  "placeholder",
  "generated",
  "mock",
  "dummy",
  "default-logo",
  "default_logo",
  "sample",
  "temp-logo",
  "temp_logo",
  "fallback",
  "artificial",
  "ai-generated",
  "ai_generated",
];

const ICON_TOKENS = [
  "favicon",
  "apple-touch-icon",
  "apple_touch_icon",
  "mstile",
  "browserconfig",
  "site-icon",
  "site_icon",
  "icon-16",
  "icon-32",
  "icon-48",
  "icon-64",
  "icon-96",
  "icon-128",
  "icon-192",
  "icon-512",
];

function normalizeHost(value?: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(candidate: string | null, official: string | null): boolean {
  if (!candidate || !official) return false;
  if (candidate === official) return true;
  if (candidate.endsWith(`.${official}`)) return true;
  if (official.endsWith(`.${candidate}`)) return true;
  return false;
}

function isLocalLogo(logoUrl: string) {
  return logoUrl.startsWith("/") && !logoUrl.startsWith("//");
}

function isRemoteLogo(logoUrl: string) {
  return /^https?:\/\//i.test(logoUrl);
}

function localAssetExists(logoUrl: string): boolean | null {
  if (!isLocalLogo(logoUrl)) return null;

  const relative = logoUrl.replace(/^\/+/, "");
  const absolute = path.resolve(PUBLIC_DIR, relative);

  if (!absolute.startsWith(PUBLIC_DIR)) return false;
  return fs.existsSync(absolute);
}

function lowerEvidence(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function classifyRow(input: {
  logoUrl: string;
  logoSourceUrl: string | null;
  websiteUrl: string | null;
}) {
  const { logoUrl, logoSourceUrl, websiteUrl } = input;
  const reasons: string[] = [];

  const websiteHost = normalizeHost(websiteUrl);
  const logoHost = isRemoteLogo(logoUrl) ? normalizeHost(logoUrl) : null;
  const sourceHost = normalizeHost(logoSourceUrl);
  const evidence = lowerEvidence(logoUrl, logoSourceUrl);

  const suspiciousToken = SUSPICIOUS_TOKENS.find((token) => evidence.includes(token));
  if (suspiciousToken) reasons.push(`SUSPICIOUS_TOKEN:${suspiciousToken}`);

  const iconToken = ICON_TOKENS.find((token) => evidence.includes(token));
  if (iconToken) reasons.push(`ICON_OR_FAVICON:${iconToken}`);

  if (/gravatar|ui-avatars|avatar\.vercel|dicebear|placehold\.co|placeholder\.com|via\.placeholder/i.test(evidence)) {
    reasons.push("KNOWN_PLACEHOLDER_OR_AVATAR_PROVIDER");
  }

  const storage: AuditRow["storage"] =
    isLocalLogo(logoUrl) ? "LOCAL" :
    isRemoteLogo(logoUrl) ? "REMOTE" :
    "OTHER";

  const exists = localAssetExists(logoUrl);

  let domainMatch: AuditRow["domainMatch"] = "UNKNOWN";
  if (storage === "LOCAL") {
    domainMatch = "LOCAL";
  } else if (storage === "REMOTE" && websiteHost && logoHost) {
    domainMatch = hostMatches(logoHost, websiteHost) ? "YES" : "NO";
  }

  if (storage === "OTHER") reasons.push("UNSUPPORTED_LOGO_URL_FORMAT");

  if (storage === "LOCAL") {
    if (exists === false) reasons.push("LOCAL_FILE_MISSING");

    if (!logoSourceUrl) {
      reasons.push("LOCAL_LOGO_WITHOUT_SOURCE_EVIDENCE");
    } else if (!websiteHost || !sourceHost) {
      reasons.push("SOURCE_DOMAIN_UNVERIFIABLE");
    } else if (!hostMatches(sourceHost, websiteHost)) {
      reasons.push("LOCAL_LOGO_SOURCE_NOT_OFFICIAL_DOMAIN");
    }
  }

  if (storage === "REMOTE") {
    if (!websiteHost) {
      reasons.push("MERCHANT_WEBSITE_MISSING_OR_INVALID");
    } else if (!logoHost) {
      reasons.push("LOGO_DOMAIN_UNVERIFIABLE");
    } else if (!hostMatches(logoHost, websiteHost)) {
      reasons.push("REMOTE_LOGO_NOT_ON_OFFICIAL_DOMAIN");
    }

    if (logoSourceUrl && sourceHost && websiteHost && !hostMatches(sourceHost, websiteHost)) {
      reasons.push("LOGO_SOURCE_NOT_OFFICIAL_DOMAIN");
    }
  }

  let classification: Classification = "REVIEW";

  const obviousBad =
    reasons.some((reason) =>
      reason.startsWith("SUSPICIOUS_TOKEN:") ||
      reason === "KNOWN_PLACEHOLDER_OR_AVATAR_PROVIDER" ||
      reason === "LOCAL_FILE_MISSING" ||
      reason === "UNSUPPORTED_LOGO_URL_FORMAT",
    );

  const shouldReplace =
    obviousBad ||
    reasons.includes("REMOTE_LOGO_NOT_ON_OFFICIAL_DOMAIN");

  const officialLocal =
    storage === "LOCAL" &&
    exists === true &&
    !!logoSourceUrl &&
    !!websiteHost &&
    !!sourceHost &&
    hostMatches(sourceHost, websiteHost) &&
    !iconToken &&
    !suspiciousToken;

  const officialRemote =
    storage === "REMOTE" &&
    !!websiteHost &&
    !!logoHost &&
    hostMatches(logoHost, websiteHost) &&
    !iconToken &&
    !suspiciousToken;

  if (shouldReplace) {
    classification = "REPLACE";
  } else if (officialLocal || officialRemote) {
    classification = "SAFE";
  } else {
    classification = "REVIEW";
  }

  // REMOVE is reserved for a future explicit/manual decision. Audit must not
  // independently conclude that a merchant should have no logo.
  return {
    storage,
    localFileExists: exists,
    websiteHost,
    logoHost,
    sourceHost,
    domainMatch,
    suspiciousReasons: reasons,
    classification,
  };
}

function csvEscape(value: unknown) {
  const raw = value == null ? "" : Array.isArray(value) ? value.join(" | ") : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const merchants = await prisma.merchant.findMany({
    where: {
      logoUrl: { not: null },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      logoUrl: true,
      logoSourceUrl: true,
    },
  });

  const rows: AuditRow[] = merchants.flatMap((merchant) => {
    if (!merchant.logoUrl) return [];

    const audit = classifyRow({
      logoUrl: merchant.logoUrl,
      logoSourceUrl: merchant.logoSourceUrl,
      websiteUrl: merchant.websiteUrl,
    });

    return [{
      merchantId: merchant.id,
      merchantName: merchant.name,
      websiteUrl: merchant.websiteUrl,
      currentLogoUrl: merchant.logoUrl,
      logoSourceUrl: merchant.logoSourceUrl,
      ...audit,
    }];
  });

  const counts = rows.reduce<Record<Classification, number>>(
    (acc, row) => {
      acc[row.classification] += 1;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REPLACE: 0, REMOVE: 0 },
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORT_DIR, `merchant-logo-audit-v1-${timestamp}.json`);
  const csvPath = path.join(REPORT_DIR, `merchant-logo-audit-v1-${timestamp}.csv`);

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        merchantsWithLogo: rows.length,
        counts,
        rows,
      },
      null,
      2,
    ),
    "utf8",
  );

  const columns: Array<keyof AuditRow> = [
    "merchantId",
    "merchantName",
    "websiteUrl",
    "currentLogoUrl",
    "logoSourceUrl",
    "storage",
    "localFileExists",
    "websiteHost",
    "logoHost",
    "sourceHost",
    "domainMatch",
    "suspiciousReasons",
    "classification",
  ];

  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");

  fs.writeFileSync(csvPath, csv, "utf8");

  console.log("=== MERCHANT LOGO AUDIT V1 ===");
  console.log(`Merchants with logo: ${rows.length}`);
  console.log(`SAFE:    ${counts.SAFE}`);
  console.log(`REVIEW:  ${counts.REVIEW}`);
  console.log(`REPLACE: ${counts.REPLACE}`);
  console.log(`REMOVE:  ${counts.REMOVE}`);
  console.log("");
  console.log(`JSON: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`CSV:  ${path.relative(process.cwd(), csvPath)}`);

  const risky = rows
    .filter((row) => row.classification === "REPLACE" || row.classification === "REVIEW")
    .slice(0, 30);

  if (risky.length) {
    console.log("\nFirst review candidates:");
    for (const row of risky) {
      console.log(
        `- [${row.classification}] ${row.merchantName} | ${row.currentLogoUrl} | ${row.suspiciousReasons.join(", ") || "manual evidence review"}`,
      );
    }
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
