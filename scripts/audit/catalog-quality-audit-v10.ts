import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());


type Severity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";
type EntityType = "MERCHANT" | "GIFT_CARD";

type Issue = {
  severity: Severity;
  entityType: EntityType;
  entityId: string;
  merchantId: string;
  merchantName: string;
  giftCardId?: string;
  giftCardTitle?: string;
  code: string;
  detail: string;
  value?: string | null;
};

const REPORT_DIR = path.resolve(process.cwd(), "reports", "catalog-audit");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const STALE_DAYS = Number(process.env.CATALOG_AUDIT_STALE_DAYS || 180);

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function host(value?: string | null) {
  if (!value) return null;
  try {
    const raw = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function relatedHost(a?: string | null, b?: string | null) {
  const left = host(a);
  const right = host(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function canonicalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const u = new URL(value);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_.+|gclid|fbclid|msclkid|srsltid|ref|referrer|source|campaign)$/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.pathname = u.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return u.toString();
  } catch {
    return null;
  }
}

function hasTrackingParams(value?: string | null) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return [...u.searchParams.keys()].some((key) =>
      /^(utm_.+|gclid|fbclid|msclkid|srsltid|ref|referrer|source|campaign)$/i.test(key),
    );
  } catch {
    return false;
  }
}

function isVerySpecificPurchaseUrl(value?: string | null) {
  if (!value) return false;
  try {
    const u = new URL(value);
    const p = decodeURIComponent(u.pathname).toLowerCase();
    const q = decodeURIComponent(u.search).toLowerCase();
    return (
      /(?:gift|voucher|δωρο|doro)[-_\/ ]*(?:card|voucher|καρτ|επιταγ)?[-_\/ ]*(?:€|eur)?\s*\d{1,4}/i.test(p) ||
      /(?:^|[-_/])(?:10|15|20|25|30|40|50|60|75|100|150|200|250|300|500)(?:[-_/]|$)/.test(p) ||
      /(?:amount|value|denomination|price)=\d+/i.test(q)
    );
  } catch {
    return false;
  }
}

function merchantNameLooksBad(name: string) {
  const n = normalize(name);
  if (!n || n.length < 2) return true;
  if (/^\d+$/.test(n)) return true;
  if (/\b(?:gift ?card|gift ?voucher|voucher|δωροκαρτ|δωροεπιταγ)\b/i.test(name)) return true;
  if (/https?:\/\/|www\.|\.gr\b|\.com\b/i.test(name)) return true;
  if (/[|]{1,}|::/.test(name)) return true;
  return false;
}

function merchantNameLooksGeneric(name: string) {
  const n = normalize(name);
  return new Set([
    "gift", "gift card", "gift cards", "gift voucher", "voucher", "vouchers",
    "δωροκαρτα", "δωροκαρτες", "δωροεπιταγη", "δωροεπιταγες",
    "shop", "store", "eshop", "e shop", "online shop",
  ]).has(n);
}

function cardTitleLooksBad(title: string) {
  if (!normalize(title)) return true;
  if (/https?:\/\/|www\./i.test(title)) return true;
  if (/\|\s*(?:home|official|eshop|e-shop|online)/i.test(title)) return true;
  if (/\b(?:gift ?card|δωροκαρτ)[-_ ]?\d{4,}\b/i.test(title)) return true;
  if (/::|\s{3,}/.test(title)) return true;
  return false;
}

function logoProblem(value?: string | null) {
  if (!value) return "MISSING";
  const s = value.toLowerCase();
  if (/favicon|apple-touch-icon|mstile|browserconfig|site-icon/.test(s)) return "FAVICON_OR_SITE_ICON";
  if (/placeholder|dummy|default[-_ ]?logo|sample[-_ ]?logo|generated|mock[-_ ]?logo/.test(s)) return "PLACEHOLDER_OR_GENERATED";
  return null;
}

function localLogoState(value?: string | null) {
  if (!value || !value.startsWith("/")) return null;
  const relative = value.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, relative);
  const insidePublic = file === PUBLIC_DIR || file.startsWith(`${PUBLIC_DIR}${path.sep}`);
  return insidePublic && fs.existsSync(file);
}

function daysSince(value?: Date | null) {
  if (!value) return null;
  return Math.floor((Date.now() - value.getTime()) / 86_400_000);
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const [merchants, cards] = await Promise.all([
    prisma.merchant.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        websiteUrl: true,
        logoUrl: true,
        logoSourceUrl: true,
        status: true,
        featured: true,
        seoTitle: true,
        metaDescription: true,
        sources: {
          where: { active: true },
          select: { sourceType: true, sourceUrl: true, sourceName: true, lastSeenAt: true },
        },
        mediaAssets: {
          select: { url: true, sourceUrl: true, usageStatus: true, isPrimary: true },
        },
        _count: { select: { giftCards: true } },
      },
    }),
    prisma.giftCard.findMany({
      orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }, { id: "asc" }],
      select: {
        id: true,
        merchantId: true,
        title: true,
        slug: true,
        status: true,
        verificationStatus: true,
        officialUrl: true,
        termsUrl: true,
        featured: true,
        lastVerifiedAt: true,
        nextReviewAt: true,
        seoTitle: true,
        metaDescription: true,
        merchant: {
          select: {
            id: true,
            name: true,
            websiteUrl: true,
            status: true,
            logoUrl: true,
          },
        },
        variants: {
          select: { id: true, active: true, purchaseUrl: true, type: true },
        },
        categories: { select: { categoryId: true, primary: true } },
        occasions: { select: { occasionId: true, relevance: true } },
        sources: {
          where: { active: true },
          select: { sourceType: true, sourceUrl: true, sourceName: true, lastSeenAt: true },
        },
        reviewFlags: {
          where: { status: "OPEN" },
          select: { type: true, reason: true, createdAt: true },
        },
        productionVerificationSnapshots: {
          orderBy: { observedAt: "desc" },
          take: 1,
          select: { officialUrl: true, httpStatus: true, pageRole: true, preflightKind: true, observedAt: true },
        },
      },
    }),
  ]);

  const issues: Issue[] = [];
  const add = (issue: Issue) => issues.push(issue);

  const merchantByNormalizedName = new Map<string, typeof merchants>();
  const merchantByHost = new Map<string, typeof merchants>();

  for (const merchant of merchants) {
    const normalized = normalize(merchant.name);
    if (normalized) {
      const group = merchantByNormalizedName.get(normalized) || [];
      group.push(merchant);
      merchantByNormalizedName.set(normalized, group);
    }
    const websiteHost = host(merchant.websiteUrl);
    if (websiteHost) {
      const group = merchantByHost.get(websiteHost) || [];
      group.push(merchant);
      merchantByHost.set(websiteHost, group);
    }
  }

  for (const merchant of merchants) {
    const base = {
      entityType: "MERCHANT" as const,
      entityId: merchant.id,
      merchantId: merchant.id,
      merchantName: merchant.name,
    };

    if (merchant.status === "ACTIVE" && merchant._count.giftCards === 0) {
      add({ severity: "MEDIUM", ...base, code: "ACTIVE_MERCHANT_WITHOUT_CARDS", detail: "Active merchant has no gift cards." });
    }
    if (merchantNameLooksGeneric(merchant.name)) {
      add({ severity: "HIGH", ...base, code: "GENERIC_MERCHANT_NAME", detail: "Merchant name is generic and does not identify a brand.", value: merchant.name });
    } else if (merchantNameLooksBad(merchant.name)) {
      add({ severity: "HIGH", ...base, code: "SUSPICIOUS_MERCHANT_NAME", detail: "Merchant name appears polluted by URL, gift-card wording or scraped metadata.", value: merchant.name });
    }

    const sameName = merchantByNormalizedName.get(normalize(merchant.name)) || [];
    if (sameName.length > 1) {
      add({ severity: "HIGH", ...base, code: "DUPLICATE_MERCHANT_NAME", detail: `Normalized merchant name appears ${sameName.length} times.`, value: sameName.map((m) => m.id).join("|") });
    }

    const websiteHost = host(merchant.websiteUrl);
    if (websiteHost) {
      const sameHost = merchantByHost.get(websiteHost) || [];
      if (sameHost.length > 1) {
        add({ severity: "HIGH", ...base, code: "DUPLICATE_MERCHANT_DOMAIN", detail: `Merchant domain is shared by ${sameHost.length} merchant records.`, value: websiteHost });
      }
    } else if (merchant.status === "ACTIVE") {
      add({ severity: "MEDIUM", ...base, code: merchant.websiteUrl ? "INVALID_MERCHANT_WEBSITE" : "MISSING_MERCHANT_WEBSITE", detail: merchant.websiteUrl ? "Merchant website URL is invalid." : "Active merchant has no website URL.", value: merchant.websiteUrl });
    }

    const logoIssue = logoProblem(merchant.logoUrl);
    if (logoIssue) {
      add({ severity: logoIssue === "MISSING" ? "HIGH" : "BLOCKER", ...base, code: `LOGO_${logoIssue}`, detail: logoIssue === "MISSING" ? "Merchant has no logo." : "Merchant logo points to a favicon/site icon or placeholder asset.", value: merchant.logoUrl });
    } else if (merchant.logoUrl) {
      if (!merchant.logoUrl.startsWith("/merchant-logos/")) {
        add({ severity: "MEDIUM", ...base, code: "LOGO_NOT_LOCAL_CANONICAL", detail: "Logo is not stored under /public/merchant-logos/.", value: merchant.logoUrl });
      } else if (localLogoState(merchant.logoUrl) === false) {
        add({ severity: "BLOCKER", ...base, code: "LOCAL_LOGO_FILE_MISSING", detail: "Database points to a local merchant logo that does not exist in public/.", value: merchant.logoUrl });
      }
    }

    if (merchant.logoSourceUrl && merchant.websiteUrl && !relatedHost(merchant.logoSourceUrl, merchant.websiteUrl)) {
      add({ severity: "MEDIUM", ...base, code: "LOGO_SOURCE_DOMAIN_MISMATCH", detail: "Logo source host does not match the merchant website host.", value: merchant.logoSourceUrl });
    }

    if (merchant.status === "ACTIVE" && !merchant.sources.some((s) => s.sourceType === "OFFICIAL")) {
      add({ severity: "MEDIUM", ...base, code: "NO_OFFICIAL_MERCHANT_SOURCE", detail: "Active merchant has no active OFFICIAL SourceRecord." });
    }
  }

  const byMerchantAndTitle = new Map<string, typeof cards>();
  const byCanonicalOfficialUrl = new Map<string, typeof cards>();

  for (const card of cards) {
    const titleKey = `${card.merchantId}::${normalize(card.title)}`;
    const titleGroup = byMerchantAndTitle.get(titleKey) || [];
    titleGroup.push(card);
    byMerchantAndTitle.set(titleKey, titleGroup);

    const urlKey = canonicalUrl(card.officialUrl);
    if (urlKey) {
      const urlGroup = byCanonicalOfficialUrl.get(urlKey) || [];
      urlGroup.push(card);
      byCanonicalOfficialUrl.set(urlKey, urlGroup);
    }
  }

  for (const card of cards) {
    const base = {
      entityType: "GIFT_CARD" as const,
      entityId: card.id,
      merchantId: card.merchantId,
      merchantName: card.merchant.name,
      giftCardId: card.id,
      giftCardTitle: card.title,
    };

    if (card.status === "ACTIVE" && card.merchant.status !== "ACTIVE") {
      add({ severity: "BLOCKER", ...base, code: "ACTIVE_CARD_IN_INACTIVE_MERCHANT", detail: "Publicly active card belongs to a non-active merchant." });
    }
    if (cardTitleLooksBad(card.title)) {
      add({ severity: "HIGH", ...base, code: "SUSPICIOUS_CARD_TITLE", detail: "Gift-card title appears polluted by scraped metadata, URL or malformed text.", value: card.title });
    }

    const sameTitle = byMerchantAndTitle.get(`${card.merchantId}::${normalize(card.title)}`) || [];
    if (sameTitle.length > 1) {
      add({ severity: "HIGH", ...base, code: "DUPLICATE_CARD_TITLE_SAME_MERCHANT", detail: `Same normalized title appears ${sameTitle.length} times for this merchant.`, value: sameTitle.map((c) => c.id).join("|") });
    }

    const canonical = canonicalUrl(card.officialUrl);
    if (canonical) {
      const sameUrl = byCanonicalOfficialUrl.get(canonical) || [];
      if (sameUrl.length > 1) {
        add({ severity: "HIGH", ...base, code: "DUPLICATE_OFFICIAL_URL", detail: `Canonical official URL is shared by ${sameUrl.length} gift-card records.`, value: canonical });
      }
    }

    if (!card.officialUrl) {
      add({ severity: card.status === "ACTIVE" ? "BLOCKER" : "MEDIUM", ...base, code: "MISSING_OFFICIAL_URL", detail: "Gift card has no official URL." });
    } else if (!canonical) {
      add({ severity: "BLOCKER", ...base, code: "INVALID_OFFICIAL_URL", detail: "Gift-card official URL is invalid.", value: card.officialUrl });
    } else {
      if (hasTrackingParams(card.officialUrl)) {
        add({ severity: "LOW", ...base, code: "OFFICIAL_URL_TRACKING_PARAMS", detail: "Official URL contains removable tracking parameters.", value: card.officialUrl });
      }
      if (isVerySpecificPurchaseUrl(card.officialUrl)) {
        add({ severity: "MEDIUM", ...base, code: "VERY_SPECIFIC_OFFICIAL_URL", detail: "Official URL appears tied to a denomination or very specific product path; review canonical program URL.", value: card.officialUrl });
      }
      if (card.merchant.websiteUrl && !relatedHost(card.officialUrl, card.merchant.websiteUrl)) {
        add({ severity: "HIGH", ...base, code: "OFFICIAL_URL_DOMAIN_MISMATCH", detail: "Gift-card official URL host differs from merchant website host; could be a reseller or wrong merchant relation.", value: `${card.merchant.websiteUrl} -> ${card.officialUrl}` });
      }
    }

    if (card.status === "ACTIVE" && card.verificationStatus !== "VERIFIED") {
      add({ severity: "HIGH", ...base, code: "ACTIVE_CARD_NOT_VERIFIED", detail: `Active card verification status is ${card.verificationStatus}.`, value: card.verificationStatus });
    }

    const age = daysSince(card.lastVerifiedAt);
    if (card.status === "ACTIVE" && age === null) {
      add({ severity: "HIGH", ...base, code: "ACTIVE_CARD_NEVER_VERIFIED", detail: "Active card has no lastVerifiedAt timestamp." });
    } else if (card.status === "ACTIVE" && age !== null && age > STALE_DAYS) {
      add({ severity: "MEDIUM", ...base, code: "STALE_VERIFICATION", detail: `Card was last verified ${age} days ago (threshold ${STALE_DAYS}).`, value: card.lastVerifiedAt?.toISOString() });
    }

    if (card.status === "ACTIVE" && !card.sources.some((s) => s.sourceType === "OFFICIAL")) {
      add({ severity: "HIGH", ...base, code: "NO_OFFICIAL_CARD_SOURCE", detail: "Active card has no active OFFICIAL SourceRecord." });
    }

    if (card.status === "ACTIVE" && card.categories.length === 0) {
      add({ severity: "MEDIUM", ...base, code: "NO_CATEGORY", detail: "Active card has no category relation." });
    }
    if (card.status === "ACTIVE" && card.occasions.length === 0) {
      add({ severity: "LOW", ...base, code: "NO_OCCASION", detail: "Active card has no occasion relation." });
    }
    if (card.status === "ACTIVE" && !card.variants.some((v) => v.active)) {
      add({ severity: "MEDIUM", ...base, code: "NO_ACTIVE_VARIANT", detail: "Active card has no active variant." });
    }

    const variantHosts = card.variants
      .filter((v) => v.active && v.purchaseUrl)
      .map((v) => ({ id: v.id, url: v.purchaseUrl!, host: host(v.purchaseUrl) }));
    for (const variant of variantHosts) {
      if (!variant.host) {
        add({ severity: "HIGH", ...base, code: "INVALID_VARIANT_PURCHASE_URL", detail: `Variant ${variant.id} has invalid purchaseUrl.`, value: variant.url });
      } else if (card.merchant.websiteUrl && !relatedHost(variant.url, card.merchant.websiteUrl)) {
        add({ severity: "MEDIUM", ...base, code: "VARIANT_PURCHASE_DOMAIN_MISMATCH", detail: `Variant ${variant.id} purchase URL host differs from merchant website host.`, value: variant.url });
      }
    }

    if (card.status === "ACTIVE" && !card.seoTitle) {
      add({ severity: "LOW", ...base, code: "MISSING_SEO_TITLE", detail: "Active card has no explicit seoTitle." });
    }
    if (card.status === "ACTIVE" && !card.metaDescription) {
      add({ severity: "LOW", ...base, code: "MISSING_META_DESCRIPTION", detail: "Active card has no explicit metaDescription." });
    }

    if (card.reviewFlags.length) {
      add({ severity: "HIGH", ...base, code: "OPEN_PRODUCTION_REVIEW_FLAG", detail: `${card.reviewFlags.length} open production review flag(s).`, value: card.reviewFlags.map((f) => `${f.type}:${f.reason}`).join(" | ") });
    }

    const snapshot = card.productionVerificationSnapshots[0];
    if (card.status === "ACTIVE" && snapshot && snapshot.httpStatus && (snapshot.httpStatus < 200 || snapshot.httpStatus >= 400)) {
      add({ severity: "HIGH", ...base, code: "LATEST_SNAPSHOT_BAD_HTTP", detail: `Latest production verification snapshot returned HTTP ${snapshot.httpStatus}.`, value: snapshot.officialUrl });
    }
  }

  const severityOrder: Record<Severity, number> = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  issues.sort((a, b) =>
    severityOrder[a.severity] - severityOrder[b.severity] ||
    a.merchantName.localeCompare(b.merchantName, "el") ||
    (a.giftCardTitle || "").localeCompare(b.giftCardTitle || "", "el") ||
    a.code.localeCompare(b.code),
  );

  const bySeverity = { BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<Severity, number>;
  const byCode: Record<string, number> = {};
  for (const issue of issues) {
    bySeverity[issue.severity]++;
    byCode[issue.code] = (byCode[issue.code] || 0) + 1;
  }

  const affectedMerchants = new Set(issues.map((i) => i.merchantId));
  const affectedCards = new Set(issues.flatMap((i) => i.giftCardId ? [i.giftCardId] : []));
  const activeCards = cards.filter((c) => c.status === "ACTIVE");
  const verifiedActiveCards = activeCards.filter((c) => c.verificationStatus === "VERIFIED");
  const localLogoMerchants = merchants.filter((m) => m.logoUrl?.startsWith("/merchant-logos/") && localLogoState(m.logoUrl) === true);

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY",
    staleVerificationThresholdDays: STALE_DAYS,
    totals: {
      merchants: merchants.length,
      activeMerchants: merchants.filter((m) => m.status === "ACTIVE").length,
      giftCards: cards.length,
      activeGiftCards: activeCards.length,
      verifiedActiveGiftCards: verifiedActiveCards.length,
      localCanonicalMerchantLogos: localLogoMerchants.length,
      affectedMerchants: affectedMerchants.size,
      affectedGiftCards: affectedCards.size,
      issues: issues.length,
    },
    issueCountsBySeverity: bySeverity,
    issueCountsByCode: Object.fromEntries(Object.entries(byCode).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(REPORT_DIR, `catalog-quality-audit-v10-${stamp}.json`);
  const csvPath = path.join(REPORT_DIR, `catalog-quality-audit-v10-${stamp}.csv`);
  const mdPath = path.join(REPORT_DIR, `catalog-quality-audit-v10-${stamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify({ summary, issues }, null, 2), "utf8");

  const headers = ["severity", "entityType", "entityId", "merchantId", "merchantName", "giftCardId", "giftCardTitle", "code", "detail", "value"] as const;
  const csv = [
    headers.map(csvEscape).join(","),
    ...issues.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ].join("\n");
  fs.writeFileSync(csvPath, csv, "utf8");

  const topCodes = Object.entries(summary.issueCountsByCode).slice(0, 30);
  const md = [
    "# Dorokartes Catalog Quality Audit v10",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "> READ ONLY: this audit performs no database writes and no network requests.",
    "",
    "## Summary",
    "",
    `- Merchants: ${summary.totals.merchants} (${summary.totals.activeMerchants} active)`,
    `- Gift cards: ${summary.totals.giftCards} (${summary.totals.activeGiftCards} active)`,
    `- Verified active gift cards: ${summary.totals.verifiedActiveGiftCards}`,
    `- Local canonical merchant logos: ${summary.totals.localCanonicalMerchantLogos}`,
    `- Affected merchants: ${summary.totals.affectedMerchants}`,
    `- Affected gift cards: ${summary.totals.affectedGiftCards}`,
    `- Total issues: ${summary.totals.issues}`,
    `- BLOCKER: ${bySeverity.BLOCKER}`,
    `- HIGH: ${bySeverity.HIGH}`,
    `- MEDIUM: ${bySeverity.MEDIUM}`,
    `- LOW: ${bySeverity.LOW}`,
    "",
    "## Top issue codes",
    "",
    "| Code | Count |",
    "|---|---:|",
    ...topCodes.map(([code, count]) => `| ${code} | ${count} |`),
    "",
    "## First 100 BLOCKER/HIGH issues",
    "",
    "| Severity | Merchant | Card | Code | Detail |",
    "|---|---|---|---|---|",
    ...issues.filter((i) => i.severity === "BLOCKER" || i.severity === "HIGH").slice(0, 100).map((i) =>
      `| ${i.severity} | ${i.merchantName.replace(/\|/g, "\\|")} | ${(i.giftCardTitle || "-").replace(/\|/g, "\\|")} | ${i.code} | ${i.detail.replace(/\|/g, "\\|")} |`,
    ),
    "",
  ].join("\n");
  fs.writeFileSync(mdPath, md, "utf8");

  console.log("=== DOROKARTES CATALOG QUALITY AUDIT v10 ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("");
  console.log(`Markdown: ${mdPath}`);
  console.log(`CSV:      ${csvPath}`);
  console.log(`JSON:     ${jsonPath}`);
  console.log("");
  console.log("AUDIT ONLY — database unchanged; no network requests were made.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
