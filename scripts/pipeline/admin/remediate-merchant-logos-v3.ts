import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import pLimit from "p-limit";
import sharp from "sharp";
import { getDomain } from "tldts";
import { prisma } from "../../../lib/prisma";

const VERSION = 2 as const;
const APPLY = process.argv.includes("--apply");
const POST_AUDIT = process.argv.includes("--post-audit");
type HarvestWave = "strict" | "review" | "icon-review" | "redirect-review" | "manual-source";
const WAVE_ARG = process.argv.find((arg) => arg.startsWith("--wave="))?.slice("--wave=".length);
if (
  WAVE_ARG &&
  WAVE_ARG !== "strict" &&
  WAVE_ARG !== "review" &&
  WAVE_ARG !== "icon-review" &&
  WAVE_ARG !== "redirect-review" &&
  WAVE_ARG !== "manual-source"
) {
  throw new Error("--wave must be strict, review, icon-review, redirect-review, or manual-source");
}
const WAVE: HarvestWave = (WAVE_ARG || "strict") as HarvestWave;
const PLAN_ID_ARG = process.argv.find((arg) => arg.startsWith("--plan-id="));
const REQUESTED_PLAN_ID = PLAN_ID_ARG?.slice("--plan-id=".length) || null;
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : undefined;
const CONCURRENCY_ARG = process.argv.find((arg) => arg.startsWith("--concurrency="));
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.min(24, Math.max(1, Number(CONCURRENCY_ARG.split("=")[1])))
  : 12;
const EXCLUDE_ARG = process.argv.find((arg) => arg.startsWith("--exclude="));
const EXCLUDED_SLUGS = new Set(
  (EXCLUDE_ARG?.slice("--exclude=".length) || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const ALLOW_DUPLICATES_ARG = process.argv.find((arg) => arg.startsWith("--allow-duplicate-slugs="));
const ALLOWED_DUPLICATE_SLUGS = new Set(
  (ALLOW_DUPLICATES_ARG?.slice("--allow-duplicate-slugs=".length) || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const MANUAL_VISUAL_APPROVAL_ARG = process.argv.find((arg) =>
  arg.startsWith("--manual-visual-approval-slugs="),
);
const MANUAL_VISUAL_APPROVAL_SLUGS = new Set(
  (MANUAL_VISUAL_APPROVAL_ARG?.slice("--manual-visual-approval-slugs=".length) || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const MANUAL_SOURCES = new Map<string, string>();
for (const argument of process.argv.filter((value) => value.startsWith("--manual-source="))) {
  const pair = argument.slice("--manual-source=".length);
  const separator = pair.indexOf("::");
  if (separator < 1) throw new Error("--manual-source must use <merchant-slug>::<asset-url>");
  const merchantSlug = pair.slice(0, separator).trim();
  const assetUrl = pair.slice(separator + 2).trim();
  if (!cleanHttpUrl(assetUrl)) throw new Error(`Invalid manual asset URL for ${merchantSlug}`);
  if (MANUAL_SOURCES.has(merchantSlug)) throw new Error(`Duplicate manual source for ${merchantSlug}`);
  MANUAL_SOURCES.set(merchantSlug, assetUrl);
}
if (WAVE === "manual-source" && !APPLY && !POST_AUDIT && MANUAL_SOURCES.size === 0) {
  throw new Error("manual-source wave requires at least one --manual-source argument");
}
if (WAVE !== "manual-source" && MANUAL_VISUAL_APPROVAL_SLUGS.size > 0) {
  throw new Error("--manual-visual-approval-slugs is only valid with --wave=manual-source");
}
for (const slug of MANUAL_VISUAL_APPROVAL_SLUGS) {
  if (!MANUAL_SOURCES.has(slug)) {
    throw new Error(`Visual filename approval has no matching manual source: ${slug}`);
  }
}

const REPORT_DIR = path.join(process.cwd(), "reports");
const PLAN_JSON = path.join(REPORT_DIR, "merchant-logo-remediation-v3-plan.json");
const PLAN_CSV = path.join(REPORT_DIR, "merchant-logo-remediation-v3-plan.csv");
const APPLY_JSON = path.join(REPORT_DIR, "merchant-logo-remediation-v3-apply.json");
const POST_AUDIT_JSON = path.join(REPORT_DIR, "merchant-logo-remediation-v3-post-audit.json");
const PUBLIC_LOGO_DIR = path.join(process.cwd(), "public", "merchant-logos");
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

type CandidateSource =
  | "HEADER_IMAGE"
  | "JSONLD_LOGO"
  | "OG_IMAGE"
  | "TWITTER_IMAGE"
  | "SITE_ICON";

type Candidate = {
  url: string;
  source: CandidateSource;
  evidence: string;
  declaredWidth: number | null;
  declaredHeight: number | null;
  score: number;
};

type ValidatedAsset = {
  url: string;
  contentType: string;
  extension: string;
  bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
};

type Finding = {
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string | null;
  finalWebsiteUrl: string | null;
  status: "SAFE" | "REVIEW" | "NONE" | "ERROR";
  reasonCodes: string[];
  bestCandidate: Candidate | null;
  validatedAsset: ValidatedAsset | null;
};

type Action = {
  actionId: string;
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string;
  sourceUrl: string;
  source: CandidateSource;
  evidence: string;
  score: number;
  sha256: string;
  contentType: string;
  extension: string;
  bytes: number;
  width: number | null;
  height: number | null;
  localUrl: string;
};

type TargetSnapshot = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  officialUrl: string | null;
  logoUrl: string | null;
  logoSourceUrl: string | null;
  updatedAt: string;
};

type Plan = {
  version: typeof VERSION;
  mode: "PREVIEW";
  wave: HarvestWave;
  generatedAt: string;
  planId: string;
  targetFingerprint: string;
  targetCount: number;
  concurrency: number;
  summary: {
    safe: number;
    review: number;
    none: number;
    error: number;
  };
  actions: Action[];
  findings: Finding[];
};

type AssetFetchResult =
  | { ok: true; asset: ValidatedAsset; buffer: Buffer }
  | { ok: false; reason: string };

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanHttpUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizedHost(value: string) {
  return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
}

function sameOfficialSite(candidateUrl: string, websiteUrl: string) {
  try {
    const candidateHost = normalizedHost(candidateUrl);
    const websiteHost = normalizedHost(websiteUrl);
    const candidateDomain = getDomain(candidateHost) || candidateHost;
    const websiteDomain = getDomain(websiteHost) || websiteHost;
    return candidateDomain === websiteDomain;
  } catch {
    return false;
  }
}

function absoluteUrl(value: string | undefined, base: string) {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function merchantTokens(name: string) {
  return [...new Set(normalizeText(name).split(/\s+/).filter((token) => token.length >= 4))];
}

function negativeVariant(url: string) {
  const pathname = (() => {
    try {
      return decodeURIComponent(new URL(url).pathname).toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  return /(^|[-_.\/])(white|light|negative|inverse|inverted)([-_.\/]|$)/i.test(pathname);
}

function badAsset(url: string) {
  const value = url.toLowerCase();
  return [
    "sprite",
    "loader",
    "spinner",
    "placeholder",
    "payment",
    "mastercard",
    "paypal",
    "trustpilot",
    "facebook",
    "instagram",
    "twitter",
    "youtube",
    "cookie",
    "banner",
  ].some((token) => value.includes(token));
}

function sourceScore(source: CandidateSource) {
  if (source === "HEADER_IMAGE") return 210;
  if (source === "JSONLD_LOGO") return 175;
  if (source === "OG_IMAGE") return 45;
  if (source === "TWITTER_IMAGE") return 35;
  return 15;
}

function scoreCandidate(
  candidate: Omit<Candidate, "score">,
  merchantName: string,
  websiteUrl: string,
) {
  const url = candidate.url.toLowerCase();
  const evidence = normalizeText(candidate.evidence);
  const tokens = merchantTokens(merchantName);
  let score = sourceScore(candidate.source);

  if (url.includes("logo")) score += 55;
  if (url.includes("brand")) score += 16;
  if (url.endsWith(".svg") || url.includes(".svg?")) score += 28;
  if (url.endsWith(".png") || url.includes(".png?")) score += 16;
  if (sameOfficialSite(candidate.url, websiteUrl)) score += 35;
  else score -= 90;
  if (tokens.some((token) => url.includes(token) || evidence.includes(token))) score += 18;
  if (negativeVariant(candidate.url)) score -= 180;
  if (badAsset(candidate.url)) score -= 220;

  const width = candidate.declaredWidth;
  const height = candidate.declaredHeight;
  if (width && height) {
    const ratio = width / Math.max(height, 1);
    if (width >= 120 && height >= 32) score += 15;
    if (ratio >= 1.7) score += 18;
    if (width < 48 || height < 20) score -= 80;
  }

  return score;
}

function srcsetUrls(value?: string) {
  if (!value || value.startsWith("data:")) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function assetIdentity(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function requestedAssetWidth(candidate: Candidate) {
  try {
    const parsed = new URL(candidate.url);
    return Number(parsed.searchParams.get("width") || parsed.searchParams.get("w")) || candidate.declaredWidth || 0;
  } catch {
    return candidate.declaredWidth || 0;
  }
}

function extractCandidates(html: string, base: string, merchantName: string) {
  const $ = load(html);
  const candidates: Array<Omit<Candidate, "score">> = [];

  const push = (
    rawUrl: string | undefined,
    source: CandidateSource,
    evidence: string,
    width?: number | null,
    height?: number | null,
  ) => {
    const url = absoluteUrl(rawUrl, base);
    if (!url) return;
    candidates.push({
      url,
      source,
      evidence,
      declaredWidth: width || null,
      declaredHeight: height || null,
    });
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const walk = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        const object = value as Record<string, unknown>;
        const logo = object.logo;
        if (typeof logo === "string") {
          push(logo, "JSONLD_LOGO", "JSON-LD logo property");
        } else if (logo && typeof logo === "object") {
          const logoObject = logo as Record<string, unknown>;
          const rawUrl = logoObject.url || logoObject.contentUrl;
          if (typeof rawUrl === "string") {
            push(
              rawUrl,
              "JSONLD_LOGO",
              "JSON-LD logo ImageObject",
              Number(logoObject.width) || null,
              Number(logoObject.height) || null,
            );
          }
        }
        Object.values(object).forEach(walk);
      };
      walk(parsed);
    } catch {
      // Broken JSON-LD is ignored and recorded indirectly through other candidates.
    }
  });

  $("meta").each((_, element) => {
    const node = $(element);
    const key = (node.attr("property") || node.attr("name") || "").toLowerCase();
    const content = node.attr("content");
    if (key === "og:image" || key === "og:image:url") {
      push(content, "OG_IMAGE", key);
    } else if (key === "twitter:image" || key === "twitter:image:src") {
      push(content, "TWITTER_IMAGE", key);
    }
    if ((node.attr("itemprop") || "").toLowerCase() === "logo") {
      push(content, "JSONLD_LOGO", "meta itemprop=logo");
    }
  });

  $('link[rel*="icon"]')
    .each((_, element) => {
      const node = $(element);
      push(
        node.attr("href"),
        "SITE_ICON",
        `link rel=${node.attr("rel") || "icon"}`,
        Number(node.attr("sizes")?.split("x")[0]) || null,
        Number(node.attr("sizes")?.split("x")[1]) || null,
      );
    });

  try {
    const faviconUrl = new URL("/favicon.ico", base).toString();
    push(faviconUrl, "SITE_ICON", "well-known /favicon.ico fallback");
  } catch {
    // Invalid page bases have already been rejected before candidate extraction.
  }

  $("img").each((_, element) => {
    const node = $(element);
    const parent = node.closest("a");
    const structuralText = [
      node.attr("class"),
      node.attr("id"),
      parent.attr("class"),
      parent.attr("id"),
    ]
      .filter(Boolean)
      .join(" ");
    const classText = [
      structuralText,
      node.attr("alt"),
      parent.attr("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");
    const normalized = classText.toLowerCase();
    if (!/(logo|brand|custom-logo|site-logo|navbar-brand)/i.test(normalized)) return;

    const directUrls = [
      node.attr("src"),
      node.attr("data-src"),
      node.attr("data-lazy-src"),
      node.attr("data-original"),
      ...srcsetUrls(node.attr("srcset")),
      ...srcsetUrls(node.attr("data-srcset")),
    ].filter((value): value is string => Boolean(value));

    // A product image or third-party trust badge can legitimately contain the
    // word "logo" in its alt text. Only accept DOM images tied to site chrome,
    // an explicit logo component, or a link back to the official homepage.
    const normalizedStructure = structuralText.toLowerCase();
    const strongLogoStructure =
      /(^|\s)(custom[-_]+logo|site[-_]+logo|header[-_]+logo|heading[-_]+logo|navbar[-_]+brand|main[-_]+logo|footer[-_]+logo|logo[-_]+(image|img|link|wrapper)|logo)(\s|$)/i.test(
        normalizedStructure,
      ) ||
      /(^|[-_])(site|header|heading|main|footer)[-_]+logo($|[-_])/i.test(normalizedStructure) ||
      /(^|\s)(wd|xts|basel|woodmart|fusion|qodef|mkdf|sc_layouts)[-_][^\s]*logo[^\s]*(\s|$)/i.test(
        normalizedStructure,
      );
    const inHeaderOrNav = node.closest("header, nav, [role='banner']").length > 0;
    const hasExplicitLogoSignal =
      normalized.includes("logo") || directUrls.some((url) => /logo/i.test(url));
    const matchesMerchant = merchantTokens(merchantName).some(
      (token) =>
        normalizeText(classText).includes(token) ||
        directUrls.some((url) => {
          try {
            return normalizeText(new URL(url, base).pathname).includes(token);
          } catch {
            return false;
          }
        }),
    );
    const linksHome = (() => {
      const href = parent.attr("href");
      if (!href) return false;
      try {
        const resolved = new URL(href, base);
        const path = resolved.pathname.replace(/\/+$/, "") || "/";
        return (
          sameOfficialSite(resolved.toString(), base) &&
          /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?$/.test(path)
        );
      } catch {
        return false;
      }
    })();
    const productOrCarouselMarker =
      /(archive[-_]?product|product[-_]?image|woocommerce|loopproduct|swiper|carousel)/i.test(
        normalizedStructure,
      );
    if (productOrCarouselMarker && !strongLogoStructure) return;
    if (!strongLogoStructure && !linksHome && !(inHeaderOrNav && hasExplicitLogoSignal && matchesMerchant)) {
      return;
    }

    const width = Number(node.attr("width")) || null;
    const height = Number(node.attr("height")) || null;

    for (const rawUrl of directUrls) {
      push(rawUrl, "HEADER_IMAGE", `img:${classText || "logo marker"}`, width, height);
    }

    node.closest("picture").find("source").each((__, sourceElement) => {
      const source = $(sourceElement);
      for (const rawUrl of srcsetUrls(source.attr("srcset") || source.attr("data-srcset"))) {
        push(rawUrl, "HEADER_IMAGE", `picture:${classText || "logo marker"}`, width, height);
      }
    });
  });

  $("[style*='background']").each((_, element) => {
    const node = $(element);
    const structuralText = [
      node.attr("class"),
      node.attr("id"),
      node.attr("aria-label"),
      node.closest("a").attr("class"),
      node.closest("a").attr("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");
    if (!/(logo|brand|navbar-brand|site-identity)/i.test(structuralText)) return;
    const style = node.attr("style") || "";
    for (const match of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      push(match[2], "HEADER_IMAGE", `css-background:${structuralText}`);
    }
  });

  $("object[data], embed[src], input[type='image'][src]").each((_, element) => {
    const node = $(element);
    const rawUrl = node.attr("data") || node.attr("src");
    const evidence = [node.attr("class"), node.attr("id"), node.attr("aria-label"), rawUrl]
      .filter(Boolean)
      .join(" ");
    if (!/(logo|brand|site-identity)/i.test(evidence)) return;
    push(rawUrl, "HEADER_IMAGE", `embedded-logo:${evidence}`);
  });

  $("noscript").each((_, element) => {
    const fragment = $(element).html() || $(element).text();
    if (!fragment || !/(logo|brand)/i.test(fragment)) return;
    const noscript = load(fragment);
    noscript("img").each((__, image) => {
      const node = noscript(image);
      const rawUrl = node.attr("src") || node.attr("data-src");
      const evidence = [node.attr("class"), node.attr("id"), node.attr("alt"), rawUrl]
        .filter(Boolean)
        .join(" ");
      if (!/(logo|brand|site-identity)/i.test(evidence)) return;
      push(rawUrl, "HEADER_IMAGE", `noscript-logo:${evidence}`);
    });
  });

  const deduped = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const scored = {
      ...candidate,
      score: scoreCandidate(candidate, merchantName, base),
    };
    const identity = assetIdentity(scored.url);
    const current = deduped.get(identity);
    if (
      !current ||
      current.score < scored.score ||
      (current.score === scored.score && requestedAssetWidth(current) < requestedAssetWidth(scored))
    ) {
      deduped.set(identity, scored);
    }
  }
  return [...deduped.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": BROWSER_USER_AGENT,
        "accept-language": "el-GR,el;q=0.9,en;q=0.8",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`PAGE_HTTP_${response.status}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error(`PAGE_NOT_HTML:${contentType || "unknown"}`);
    }
    const contentLength = Number(response.headers.get("content-length")) || 0;
    if (contentLength > 5 * 1024 * 1024) throw new Error(`PAGE_TOO_LARGE:${contentLength}`);
    return { html: await response.text(), finalUrl: response.url };
  } finally {
    clearTimeout(timer);
  }
}

function extensionFrom(contentType: string, url: string) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  const byType: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/ico": ".ico",
  };
  if (byType[type]) return byType[type];
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif", ".ico"].includes(extension)) {
      return extension === ".jpeg" ? ".jpg" : extension;
    }
  } catch {
    return null;
  }
  return null;
}

function unsafeSvg(buffer: Buffer) {
  const value = buffer.toString("utf8").toLowerCase();
  return /<script\b|<foreignobject\b|\son\w+\s*=|javascript:|(?:href|src)\s*=\s*["']https?:/i.test(value);
}

function icoDimensions(buffer: Buffer) {
  if (buffer.length < 22 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return null;
  const count = buffer.readUInt16LE(4);
  if (count < 1 || buffer.length < 6 + count * 16) return null;

  let best: { width: number; height: number } | null = null;
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    const bytes = buffer.readUInt32LE(offset + 8);
    const imageOffset = buffer.readUInt32LE(offset + 12);
    if (bytes < 1 || imageOffset + bytes > buffer.length) return null;
    if (!best || width * height > best.width * best.height) best = { width, height };
  }
  return best;
}

function publicAssetUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") return false;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchAndValidateAsset(
  url: string,
  websiteUrl: string,
  allowPageReferencedExternalAsset = false,
  allowSmallIcon = false,
  allowVisuallyApprovedFilenameRisk = false,
): Promise<AssetFetchResult> {
  if (!publicAssetUrl(url)) return { ok: false, reason: "UNSAFE_ASSET_URL" };
  if (!allowPageReferencedExternalAsset && !sameOfficialSite(url, websiteUrl)) {
    return { ok: false, reason: "EXTERNAL_ASSET_HOST" };
  }
  if (!allowVisuallyApprovedFilenameRisk && negativeVariant(url)) {
    return { ok: false, reason: "NEGATIVE_OR_WHITE_VARIANT" };
  }
  if (!allowVisuallyApprovedFilenameRisk && badAsset(url)) {
    return { ok: false, reason: "DISALLOWED_ASSET_TOKEN" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": BROWSER_USER_AGENT,
        "accept-language": "el-GR,el;q=0.9,en;q=0.8",
        accept: "image/png,image/svg+xml,image/webp,image/jpeg,image/x-icon,*/*;q=0.1",
        referer: websiteUrl,
      },
    });
    if (!response.ok) return { ok: false, reason: `ASSET_HTTP_${response.status}` };
    if (!publicAssetUrl(response.url)) return { ok: false, reason: "UNSAFE_ASSET_REDIRECT" };
    if (!allowPageReferencedExternalAsset && !sameOfficialSite(response.url, websiteUrl)) {
      return { ok: false, reason: "ASSET_REDIRECTED_EXTERNAL" };
    }
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const extension = extensionFrom(contentType, response.url);
    if (!contentType.startsWith("image/") && !response.url.toLowerCase().includes(".svg")) {
      return { ok: false, reason: `ASSET_NOT_IMAGE:${contentType || "unknown"}` };
    }
    if (!extension) return { ok: false, reason: "ASSET_UNSUPPORTED_FORMAT" };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 350) return { ok: false, reason: `ASSET_TOO_SMALL:${buffer.length}` };
    if (buffer.length > 3 * 1024 * 1024) {
      return { ok: false, reason: `ASSET_TOO_LARGE:${buffer.length}` };
    }
    if (extension === ".svg" && unsafeSvg(buffer)) return { ok: false, reason: "UNSAFE_SVG" };

    let width: number | null = null;
    let height: number | null = null;
    if (extension === ".ico") {
      const dimensions = icoDimensions(buffer);
      if (!dimensions) return { ok: false, reason: "IMAGE_DECODE_FAILED" };
      width = dimensions.width;
      height = dimensions.height;
    } else {
      try {
        const metadata = await sharp(buffer, { animated: false }).metadata();
        width = metadata.width || null;
        height = metadata.height || null;
      } catch {
        return { ok: false, reason: "IMAGE_DECODE_FAILED" };
      }
    }
    const minimumWidth = allowSmallIcon ? 16 : 48;
    const minimumHeight = allowSmallIcon ? 16 : 20;
    if (width && height && (width < minimumWidth || height < minimumHeight)) {
      return { ok: false, reason: `IMAGE_DIMENSIONS_TOO_SMALL:${width}x${height}` };
    }

    const asset: ValidatedAsset = {
      url: response.url,
      contentType: contentType.split(";")[0],
      extension,
      bytes: buffer.length,
      width,
      height,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    };
    return { ok: true, asset, buffer };
  } catch (error) {
    if (WAVE === "icon-review") {
      const fallbackUrl = (() => {
        try {
          return new URL("/favicon.ico", pageUrl).toString();
        } catch {
          return null;
        }
      })();
      if (fallbackUrl) {
        const candidateBase = {
          url: fallbackUrl,
          source: "SITE_ICON" as const,
          evidence: `well-known /favicon.ico fallback after ${pageEvidence} fetch failure`,
          declaredWidth: null,
          declaredHeight: null,
        };
        const candidate: Candidate = {
          ...candidateBase,
          score: scoreCandidate(candidateBase, merchant.name, pageUrl),
        };
        const validated = await fetchAndValidateAsset(candidate.url, pageUrl, false, true);
        if (validated.ok) {
          const confirmation = await fetchAndValidateAsset(candidate.url, pageUrl, false, true);
          if (confirmation.ok && confirmation.asset.sha256 === validated.asset.sha256) {
            return {
              ...base,
              finalWebsiteUrl: pageUrl,
              status: "SAFE",
              reasonCodes: [
                pageEvidence,
                "PAGE_FETCH_FAILED_ICON_FALLBACK",
                "SITE_ICON",
                "SAME_SITE_ASSET",
                "IMAGE_VALIDATED",
              ],
              bestCandidate: candidate,
              validatedAsset: validated.asset,
            };
          }
        }
      }
    }
    return {
      ok: false,
      reason: error instanceof Error && error.name === "AbortError" ? "ASSET_TIMEOUT" : "ASSET_FETCH_FAILED",
    };
  } finally {
    clearTimeout(timer);
  }
}

function safeCandidate(candidate: Candidate, second: Candidate | undefined, websiteUrl: string) {
  const gap = candidate.score - (second?.score ?? 0);
  if (negativeVariant(candidate.url) || badAsset(candidate.url)) return false;
  if (WAVE === "review" || WAVE === "icon-review" || WAVE === "redirect-review") {
    if (candidate.source === "HEADER_IMAGE") return candidate.score >= 120;
    if (candidate.source === "JSONLD_LOGO") {
      if (WAVE === "icon-review") {
        const pathname = (() => {
          try {
            return normalizeText(decodeURIComponent(new URL(candidate.url).pathname));
          } catch {
            return "";
          }
        })();
        return candidate.score >= 100 && /(logo|fav|icon|android chrome|safari pinned)/.test(pathname);
      }
      return candidate.score >= 100;
    }
    if (candidate.source === "SITE_ICON") {
      const pathname = (() => {
        try {
          return normalizeText(decodeURIComponent(new URL(candidate.url).pathname));
        } catch {
          return "";
        }
      })();
      return candidate.score >= 50 && /(logo|fav|icon|android chrome|safari pinned)/.test(pathname);
    }
    if (candidate.source === "OG_IMAGE" || candidate.source === "TWITTER_IMAGE") {
      const pathname = (() => {
        try {
          return normalizeText(decodeURIComponent(new URL(candidate.url).pathname));
        } catch {
          return "";
        }
      })();
      return candidate.score >= 80 && pathname.includes("logo");
    }
    return false;
  }
  if (!sameOfficialSite(candidate.url, websiteUrl)) return false;
  if (candidate.source === "HEADER_IMAGE") return candidate.score >= 245 && gap >= 12;
  if (candidate.source === "JSONLD_LOGO") return candidate.score >= 215 && gap >= 20;
  return false;
}

type InspectableMerchant = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  officialUrl: string | null;
};

async function inspectMerchantPage(
  merchant: InspectableMerchant,
  pageUrl: string,
  pageEvidence: "OFFICIAL_WEBSITE_PAGE" | "OFFICIAL_GIFT_CARD_PAGE",
): Promise<Finding> {
  const base = {
    merchantId: merchant.id,
    merchantName: merchant.name,
    merchantSlug: merchant.slug,
    websiteUrl: merchant.websiteUrl,
  };
  try {
    const { html, finalUrl } = await fetchHtml(pageUrl);
    const redirectedToDifferentDomain = !sameOfficialSite(finalUrl, pageUrl);
    if (redirectedToDifferentDomain && WAVE !== "redirect-review") {
      return {
        ...base,
        finalWebsiteUrl: finalUrl,
        status: "REVIEW",
        reasonCodes: ["WEBSITE_REDIRECTED_TO_DIFFERENT_DOMAIN"],
        bestCandidate: null,
        validatedAsset: null,
      };
    }
    const candidates = extractCandidates(html, finalUrl, merchant.name);
    if (!candidates.length) {
      return {
        ...base,
        finalWebsiteUrl: finalUrl,
        status: "NONE",
        reasonCodes: ["NO_LOGO_CANDIDATE"],
        bestCandidate: null,
        validatedAsset: null,
      };
    }

    const validationReasons: string[] = [];
    for (let index = 0; index < Math.min(candidates.length, 6); index += 1) {
      const candidate = candidates[index];
      const second = candidates.find((item) => item.url !== candidate.url);
      if (!safeCandidate(candidate, second, finalUrl)) continue;
      const iconReviewCandidate =
        WAVE === "icon-review" &&
        (candidate.source === "SITE_ICON" || /(logo|fav|icon)/i.test(candidate.url));
      const validated = await fetchAndValidateAsset(
        candidate.url,
        finalUrl,
        WAVE !== "strict",
        iconReviewCandidate,
      );
      if (!validated.ok) {
        validationReasons.push(validated.reason);
        continue;
      }
      if (WAVE !== "strict" && validated.asset.contentType === "image/avif") {
        validationReasons.push("DYNAMIC_AVIF_VARIANT_NOT_STABLE_FOR_AUDIT");
        continue;
      }
      if (WAVE !== "strict") {
        const confirmation = await fetchAndValidateAsset(candidate.url, finalUrl, true, iconReviewCandidate);
        if (!confirmation.ok) {
          validationReasons.push(`STABILITY_${confirmation.reason}`);
          continue;
        }
        if (confirmation.asset.sha256 !== validated.asset.sha256) {
          validationReasons.push("ASSET_UNSTABLE_BETWEEN_FETCHES");
          continue;
        }
      }
      if (
        candidate.source === "SITE_ICON" &&
        validated.asset.width &&
        validated.asset.height &&
        WAVE !== "icon-review" &&
        (validated.asset.width < 64 || validated.asset.height < 64)
      ) {
        validationReasons.push(`SITE_ICON_TOO_SMALL:${validated.asset.width}x${validated.asset.height}`);
        continue;
      }
      return {
        ...base,
        finalWebsiteUrl: finalUrl,
        status: "SAFE",
        reasonCodes: [
          pageEvidence,
          ...(redirectedToDifferentDomain
            ? ["WEBSITE_REDIRECTED_TO_DIFFERENT_DOMAIN_REVIEWED"]
            : []),
          candidate.source,
          sameOfficialSite(validated.asset.url, finalUrl)
            ? "SAME_SITE_ASSET"
            : "PAGE_REFERENCED_EXTERNAL_ASSET",
          "IMAGE_VALIDATED",
        ],
        bestCandidate: candidate,
        validatedAsset: validated.asset,
      };
    }

    return {
      ...base,
      finalWebsiteUrl: finalUrl,
      status: "REVIEW",
      reasonCodes: validationReasons.length
        ? ["STRONG_CANDIDATE_REJECTED", ...new Set(validationReasons)]
        : ["NO_AUTO_SAFE_CANDIDATE"],
      bestCandidate: candidates[0],
      validatedAsset: null,
    };
  } catch (error) {
    return {
      ...base,
      finalWebsiteUrl: null,
      status: "ERROR",
      reasonCodes: [
        error instanceof Error && error.name === "AbortError"
          ? "PAGE_TIMEOUT"
          : error instanceof Error
            ? error.message
            : "PAGE_FETCH_FAILED",
      ],
      bestCandidate: null,
      validatedAsset: null,
    };
  }
}

async function inspectMerchant(merchant: InspectableMerchant): Promise<Finding> {
  const pageOptions = [
    { url: cleanHttpUrl(merchant.websiteUrl), evidence: "OFFICIAL_WEBSITE_PAGE" as const },
    { url: cleanHttpUrl(merchant.officialUrl), evidence: "OFFICIAL_GIFT_CARD_PAGE" as const },
  ].filter(
    (option): option is { url: string; evidence: "OFFICIAL_WEBSITE_PAGE" | "OFFICIAL_GIFT_CARD_PAGE" } =>
      Boolean(option.url),
  );
  const uniquePages = pageOptions.filter(
    (option, index) =>
      pageOptions.findIndex((candidate) => candidate.url === option.url) === index,
  );
  const base = {
    merchantId: merchant.id,
    merchantName: merchant.name,
    merchantSlug: merchant.slug,
    websiteUrl: merchant.websiteUrl,
  };
  if (WAVE === "manual-source") {
    const assetUrl = MANUAL_SOURCES.get(merchant.slug);
    const pageUrl = cleanHttpUrl(merchant.websiteUrl) || cleanHttpUrl(merchant.officialUrl);
    if (!assetUrl || !pageUrl) {
      return {
        ...base,
        finalWebsiteUrl: pageUrl,
        status: "ERROR",
        reasonCodes: [!assetUrl ? "MANUAL_SOURCE_NOT_PROVIDED" : "INVALID_WEBSITE_AND_OFFICIAL_URL"],
        bestCandidate: null,
        validatedAsset: null,
      };
    }
    const visuallyApprovedFilenameRisk = MANUAL_VISUAL_APPROVAL_SLUGS.has(merchant.slug);
    const candidateBase = {
      url: assetUrl,
      source: "HEADER_IMAGE" as const,
      evidence: visuallyApprovedFilenameRisk
        ? "OPERATOR_CURATED_FROM_RENDERED_OFFICIAL_PAGE_ASSET_WITH_VISUAL_FILENAME_OVERRIDE"
        : "OPERATOR_CURATED_FROM_RENDERED_OFFICIAL_PAGE_ASSET",
      declaredWidth: null,
      declaredHeight: null,
    };
    const candidate: Candidate = {
      ...candidateBase,
      score: scoreCandidate(candidateBase, merchant.name, pageUrl),
    };
    const validated = await fetchAndValidateAsset(
      assetUrl,
      pageUrl,
      true,
      false,
      visuallyApprovedFilenameRisk,
    );
    if (!validated.ok) {
      return {
        ...base,
        finalWebsiteUrl: pageUrl,
        status: "REVIEW",
        reasonCodes: ["OPERATOR_CURATED_SOURCE_REJECTED", validated.reason],
        bestCandidate: candidate,
        validatedAsset: null,
      };
    }
    const confirmation = await fetchAndValidateAsset(
      assetUrl,
      pageUrl,
      true,
      false,
      visuallyApprovedFilenameRisk,
    );
    if (!confirmation.ok || confirmation.asset.sha256 !== validated.asset.sha256) {
      return {
        ...base,
        finalWebsiteUrl: pageUrl,
        status: "REVIEW",
        reasonCodes: [
          "OPERATOR_CURATED_SOURCE_UNSTABLE",
          confirmation.ok ? "ASSET_UNSTABLE_BETWEEN_FETCHES" : confirmation.reason,
        ],
        bestCandidate: candidate,
        validatedAsset: null,
      };
    }
    return {
      ...base,
      finalWebsiteUrl: pageUrl,
      status: "SAFE",
      reasonCodes: [
        "OPERATOR_CURATED_FROM_RENDERED_OFFICIAL_PAGE_ASSET",
        ...(visuallyApprovedFilenameRisk ? ["OPERATOR_VISUALLY_APPROVED_FILENAME_RISK"] : []),
        "IMAGE_VALIDATED",
      ],
      bestCandidate: candidate,
      validatedAsset: validated.asset,
    };
  }
  if (!uniquePages.length) {
    return {
      ...base,
      finalWebsiteUrl: null,
      status: "ERROR",
      reasonCodes: ["INVALID_WEBSITE_AND_OFFICIAL_URL"],
      bestCandidate: null,
      validatedAsset: null,
    };
  }

  const attempts: Finding[] = [];
  for (const page of uniquePages) {
    const finding = await inspectMerchantPage(merchant, page.url, page.evidence);
    if (finding.status === "SAFE") return finding;
    attempts.push(finding);
  }
  const selected = [...attempts].sort((a, b) => {
    const rank = { REVIEW: 3, NONE: 2, ERROR: 1, SAFE: 4 } as const;
    return rank[b.status] - rank[a.status] ||
      (b.bestCandidate?.score ?? -Infinity) - (a.bestCandidate?.score ?? -Infinity);
  })[0];
  return {
    ...selected,
    reasonCodes: [
      ...new Set(
        attempts.flatMap((attempt, index) =>
          attempt.reasonCodes.map((reason) =>
            `${uniquePages[index]?.evidence || "OFFICIAL_PAGE"}:${reason}`,
          ),
        ),
      ),
    ],
  };
}

function safeSlug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "merchant"
  );
}

function actionFromFinding(finding: Finding): Action | null {
  if (finding.status !== "SAFE" || !finding.bestCandidate || !finding.validatedAsset || !finding.finalWebsiteUrl) {
    return null;
  }
  const asset = finding.validatedAsset;
  const filename = `${safeSlug(finding.merchantSlug)}-${asset.sha256.slice(0, 12)}${asset.extension}`;
  return {
    actionId: `set-merchant-logo:${finding.merchantId}:${asset.sha256.slice(0, 12)}`,
    merchantId: finding.merchantId,
    merchantName: finding.merchantName,
    merchantSlug: finding.merchantSlug,
    websiteUrl: finding.finalWebsiteUrl,
    sourceUrl: asset.url,
    source: finding.bestCandidate.source,
    evidence: finding.bestCandidate.evidence,
    score: finding.bestCandidate.score,
    sha256: asset.sha256,
    contentType: asset.contentType,
    extension: asset.extension,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    localUrl: `/merchant-logos/${filename}`,
  };
}

function targetMaterial(targets: TargetSnapshot[]) {
  return targets.map((target) => ({ ...target })).sort((a, b) => a.id.localeCompare(b.id));
}

function planMaterial(plan: Omit<Plan, "generatedAt" | "planId">) {
  return plan;
}

function verifyPlan(plan: Plan) {
  const { generatedAt: _generatedAt, planId: _planId, ...material } = plan;
  void _generatedAt;
  void _planId;
  if (stableHash(planMaterial(material)) !== plan.planId) throw new Error("Stored plan ID is invalid.");
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(findings: Finding[], outputPath = PLAN_CSV) {
  const headers = [
    "status",
    "merchantId",
    "merchantName",
    "merchantSlug",
    "websiteUrl",
    "finalWebsiteUrl",
    "reasonCodes",
    "candidateSource",
    "candidateScore",
    "candidateUrl",
    "evidence",
    "sha256",
    "width",
    "height",
    "bytes",
  ];
  const lines = [
    headers.join(","),
    ...findings.map((finding) =>
      [
        finding.status,
        finding.merchantId,
        finding.merchantName,
        finding.merchantSlug,
        finding.websiteUrl,
        finding.finalWebsiteUrl,
        finding.reasonCodes,
        finding.bestCandidate?.source,
        finding.bestCandidate?.score,
        finding.bestCandidate?.url,
        finding.bestCandidate?.evidence,
        finding.validatedAsset?.sha256,
        finding.validatedAsset?.width,
        finding.validatedAsset?.height,
        finding.validatedAsset?.bytes,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  fs.writeFileSync(outputPath, `\uFEFF${lines.join("\n")}\n`, "utf8");
}

function loadReplaceMerchantIdsFromLatestAudit() {
  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((name) => /^merchant-logo-audit-v2-.*\.json$/i.test(name))
    .map((name) => ({
      name,
      fullPath: path.join(REPORT_DIR, name),
      mtimeMs: fs.statSync(path.join(REPORT_DIR, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!files.length) {
    throw new Error(
      "No merchant-logo-audit-v2 JSON found in reports/. Run audit-merchant-logos-v2.ts first.",
    );
  }

  const selected = files[0];
  const parsed = JSON.parse(fs.readFileSync(selected.fullPath, "utf8"));
  const ids = new Set<string>();

  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }

    const obj = value as Record<string, unknown>;

    if (obj.classification === "REPLACE") {
      const merchantId =
        typeof obj.merchantId === "string"
          ? obj.merchantId
          : typeof obj.id === "string"
            ? obj.id
            : null;

      if (merchantId) ids.add(merchantId);
    }

    for (const child of Object.values(obj)) walk(child);
  };

  walk(parsed);

  if (!ids.size) {
    throw new Error(
      `Latest logo audit contains no REPLACE merchant IDs: ${selected.fullPath}`,
    );
  }

  console.log(
    `Replacement source audit: ${path.relative(process.cwd(), selected.fullPath)} (${ids.size} REPLACE merchants)`,
  );

  return ids;
}
async function loadTargetsByIds(ids?: string[]) {
  const merchants = await prisma.merchant.findMany({
    where: ids
      ? { id: { in: ids } }
      : {
          status: "ACTIVE",
          giftCards: { some: { status: "ACTIVE" } },
          
        },
    orderBy: { name: "asc" },
    ...(!ids && LIMIT ? { take: LIMIT } : {}),
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
  const replaceIds = ids ? null : loadReplaceMerchantIdsFromLatestAudit();

  return merchants
    .filter((merchant) => {
      if (ids) return true;

      const missing = !merchant.logoUrl;
      const replace = replaceIds?.has(merchant.id) ?? false;

      return missing || replace;
    })
    .map(({ giftCards, ...merchant }) => ({
      ...merchant,
      officialUrl: giftCards[0]?.officialUrl || null,
      updatedAt: merchant.updatedAt.toISOString(),
    }));
}

async function buildPlan(): Promise<Plan> {
  const loadedTargets = await loadTargetsByIds();
  const targets =
    WAVE === "manual-source"
      ? loadedTargets.filter((target) => MANUAL_SOURCES.has(target.slug))
      : loadedTargets;
  if (WAVE === "manual-source" && targets.length !== MANUAL_SOURCES.size) {
    const found = new Set(targets.map((target) => target.slug));
    const missing = [...MANUAL_SOURCES.keys()].filter((slug) => !found.has(slug));
    throw new Error(`Manual-source merchants are not eligible logo targets: ${missing.join(", ")}`);
  }
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  const findings = await Promise.all(
    targets.map((target) =>
      limit(async () => {
        const finding = await inspectMerchant(target);
        completed += 1;
        if (completed % 50 === 0 || completed === targets.length) {
          console.log(`Progress: ${completed}/${targets.length}`);
        }
        return finding;
      }),
    ),
  );
  findings.sort((a, b) => a.merchantName.localeCompare(b.merchantName) || a.merchantId.localeCompare(b.merchantId));
  for (const finding of findings) {
    if (finding.status !== "SAFE" || !EXCLUDED_SLUGS.has(finding.merchantSlug)) continue;
    finding.status = "REVIEW";
    finding.reasonCodes = ["OPERATOR_EXCLUDED_AFTER_VISUAL_REVIEW"];
  }
  const safeByHash = new Map<string, Finding[]>();
  for (const finding of findings) {
    const hash = finding.status === "SAFE" ? finding.validatedAsset?.sha256 : null;
    if (!hash) continue;
    const group = safeByHash.get(hash) || [];
    group.push(finding);
    safeByHash.set(hash, group);
  }
  for (const group of safeByHash.values()) {
    if (group.length < 2) continue;
    if (group.every((finding) => ALLOWED_DUPLICATE_SLUGS.has(finding.merchantSlug))) {
      for (const finding of group) {
        finding.reasonCodes = [...finding.reasonCodes, "OPERATOR_ALLOWED_DUPLICATE_AFTER_VISUAL_REVIEW"];
      }
      continue;
    }
    for (const finding of group) {
      finding.status = "REVIEW";
      finding.reasonCodes = ["DUPLICATE_ASSET_HASH_ACROSS_MERCHANTS"];
    }
  }
  const actions = findings.map(actionFromFinding).filter((action): action is Action => Boolean(action));
  actions.sort((a, b) => a.merchantName.localeCompare(b.merchantName) || a.actionId.localeCompare(b.actionId));
  const summary = {
    safe: findings.filter((finding) => finding.status === "SAFE").length,
    review: findings.filter((finding) => finding.status === "REVIEW").length,
    none: findings.filter((finding) => finding.status === "NONE").length,
    error: findings.filter((finding) => finding.status === "ERROR").length,
  };
  const material = {
    version: VERSION,
    mode: "PREVIEW" as const,
    wave: WAVE,
    targetFingerprint: stableHash(targetMaterial(targets)),
    targetCount: targets.length,
    concurrency: CONCURRENCY,
    summary,
    actions,
    findings,
  };
  return {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(planMaterial(material)),
  };
}

function readPlan() {
  if (!fs.existsSync(PLAN_JSON)) throw new Error(`Preview plan is missing: ${PLAN_JSON}`);
  const plan = JSON.parse(fs.readFileSync(PLAN_JSON, "utf8")) as Plan;
  verifyPlan(plan);
  return plan;
}

function assertApplyRequest(plan: Plan) {
  if (!REQUESTED_PLAN_ID) throw new Error("Apply requires --plan-id=<preview planId>.");
  if (REQUESTED_PLAN_ID !== plan.planId) throw new Error("Requested plan ID does not match the stored preview.");
}

function absolutePublicPath(localUrl: string) {
  const resolved = path.resolve(path.join(process.cwd(), "public", localUrl.replace(/^\/+/, "")));
  const root = path.resolve(PUBLIC_LOGO_DIR);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe logo output path: ${resolved}`);
  }
  return resolved;
}

async function applyPlan(plan: Plan) {
  assertApplyRequest(plan);
  const targetIds = plan.findings.map((finding) => finding.merchantId);
  const currentTargets = await loadTargetsByIds(targetIds);
  if (currentTargets.length !== plan.targetCount) throw new Error("Logo target set changed after preview.");
  if (stableHash(targetMaterial(currentTargets)) !== plan.targetFingerprint) {
    throw new Error("Merchant logo state changed after preview. Generate a new plan.");
  }
  const expectedById = new Map(
    currentTargets.map((target) => [target.id, target] as const),
  );

  fs.mkdirSync(PUBLIC_LOGO_DIR, { recursive: true });
  const downloadLimit = pLimit(CONCURRENCY);
  const downloads = await Promise.all(
    plan.actions.map((action) =>
      downloadLimit(async () => {
        const result = await fetchAndValidateAsset(
          action.sourceUrl,
          action.websiteUrl,
          plan.wave !== "strict",
          plan.wave === "icon-review" &&
            (action.source === "SITE_ICON" || /(logo|fav|icon)/i.test(action.sourceUrl)),
          action.evidence ===
            "OPERATOR_CURATED_FROM_RENDERED_OFFICIAL_PAGE_ASSET_WITH_VISUAL_FILENAME_OVERRIDE",
        );
        if (!result.ok) throw new Error(`${action.actionId}: ${result.reason}`);
        if (result.asset.sha256 !== action.sha256) throw new Error(`${action.actionId}: ASSET_HASH_CHANGED`);
        return { action, buffer: result.buffer };
      }),
    ),
  );

  const createdFiles: string[] = [];
  try {
    for (const { action, buffer } of downloads) {
      const filePath = absolutePublicPath(action.localUrl);
      if (fs.existsSync(filePath)) {
        const currentHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
        if (currentHash !== action.sha256) throw new Error(`Existing logo hash mismatch: ${filePath}`);
        continue;
      }
      const tempPath = `${filePath}.${plan.planId.slice(0, 8)}.tmp`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, filePath);
      createdFiles.push(filePath);
    }

    const applied: Array<{ actionId: string; merchantId: string; localUrl: string }> = [];
    await prisma.$transaction(
      async (tx) => {
        for (const action of plan.actions) {
          const expected = expectedById.get(action.merchantId);

          if (!expected) {
            throw new Error(`Missing expected merchant state: ${action.merchantId}`);
          }

          const expectedMissing = !expected.logoUrl;

          const result = await tx.merchant.updateMany({
            where: expectedMissing
              ? {
                  id: action.merchantId,
                  OR: [{ logoUrl: null }, { logoUrl: "" }],
                }
              : {
                  id: action.merchantId,
                  logoUrl: expected.logoUrl,
                  logoSourceUrl: expected.logoSourceUrl,
                },
            data: {
              logoUrl: action.localUrl,
              logoSourceUrl: action.sourceUrl,
            },
          });
          if (result.count !== 1) throw new Error(`Merchant precondition failed: ${action.merchantId}`);
          await tx.mediaAsset.updateMany({
            where: {
              merchantId: action.merchantId,
              isPrimary: true,
            },
            data: {
              isPrimary: false,
            },
          });
          await tx.mediaAsset.create({
            data: {
              merchantId: action.merchantId,
              url: action.localUrl,
              sourceUrl: action.sourceUrl,
              altText: `Ξ›ΞΏΞ³ΟΟ„Ο…Ο€ΞΏ ${action.merchantName}`,
              usageStatus: "APPROVED",
              isPrimary: true,
            },
          });
          applied.push({
            actionId: action.actionId,
            merchantId: action.merchantId,
            localUrl: action.localUrl,
          });
        }
      },
      { isolationLevel: "Serializable", maxWait: 20_000, timeout: 180_000 },
    );

    const report = {
      version: VERSION,
      mode: "APPLY",
      appliedAt: new Date().toISOString(),
      planId: plan.planId,
      appliedCount: applied.length,
      applied,
    };
    fs.writeFileSync(APPLY_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(
      path.join(REPORT_DIR, `merchant-logo-remediation-v3-apply-${plan.planId.slice(0, 16)}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    return report;
  } catch (error) {
    for (const filePath of createdFiles) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    throw error;
  }
}

async function postAudit(plan: Plan) {
  assertApplyRequest(plan);
  const merchants = await prisma.merchant.findMany({
    where: { id: { in: plan.actions.map((action) => action.merchantId) } },
    select: {
      id: true,
      logoUrl: true,
      logoSourceUrl: true,
      mediaAssets: {
        where: { isPrimary: true },
        select: { url: true, sourceUrl: true, usageStatus: true },
      },
    },
  });
  const byId = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  const results = plan.actions.map((action) => {
    const merchant = byId.get(action.merchantId);
    const filePath = absolutePublicPath(action.localUrl);
    const fileExists = fs.existsSync(filePath);
    const fileHash = fileExists
      ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
      : null;
    const passed = Boolean(
      merchant &&
        merchant.logoUrl === action.localUrl &&
        merchant.logoSourceUrl === action.sourceUrl &&
        fileHash === action.sha256 &&
        merchant.mediaAssets.some(
          (asset) =>
            asset.url === action.localUrl &&
            asset.sourceUrl === action.sourceUrl &&
            asset.usageStatus === "APPROVED",
        ),
    );
    return { actionId: action.actionId, merchantId: action.merchantId, passed, fileExists, fileHash };
  });
  const report = {
    version: VERSION,
    mode: "POST_AUDIT",
    generatedAt: new Date().toISOString(),
    planId: plan.planId,
    checked: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    databaseWrites: 0,
    results,
  };
  fs.writeFileSync(POST_AUDIT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(REPORT_DIR, `merchant-logo-remediation-v3-post-audit-${plan.planId.slice(0, 16)}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (report.failed) throw new Error(`Post-audit failed for ${report.failed} logo actions.`);
  return report;
}

async function main() {
  if (APPLY && POST_AUDIT) throw new Error("--apply and --post-audit cannot be combined.");
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  if (APPLY) {
    const plan = readPlan();
    const report = await applyPlan(plan);
    console.log("Dorokartes Merchant Logo Remediation v3 β€” APPLY");
    console.log(`Plan ID: ${plan.planId}`);
    console.log(`Applied: ${report.appliedCount}`);
    console.log(`Report: ${APPLY_JSON}`);
    return;
  }

  if (POST_AUDIT) {
    const plan = readPlan();
    const report = await postAudit(plan);
    console.log("Dorokartes Merchant Logo Remediation v3 β€” POST-AUDIT");
    console.log(`Checked: ${report.checked}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Report: ${POST_AUDIT_JSON}`);
    return;
  }

  console.log("Dorokartes Merchant Logo Remediation v3 β€” PREVIEW");
  console.log(`Wave: ${WAVE}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  const plan = await buildPlan();
  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.findings);
  const immutablePlanJson = path.join(
    REPORT_DIR,
    `merchant-logo-remediation-v3-plan-${plan.planId.slice(0, 16)}.json`,
  );
  const immutablePlanCsv = path.join(
    REPORT_DIR,
    `merchant-logo-remediation-v3-plan-${plan.planId.slice(0, 16)}.csv`,
  );
  fs.writeFileSync(immutablePlanJson, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeCsv(plan.findings, immutablePlanCsv);
  console.log(`Plan ID: ${plan.planId}`);
  console.log(`Targets: ${plan.targetCount}`);
  console.log("Target set: MISSING + audit-v2 REPLACE");
  console.log(`Safe: ${plan.summary.safe}`);
  console.log(`Review: ${plan.summary.review}`);
  console.log(`None: ${plan.summary.none}`);
  console.log(`Error: ${plan.summary.error}`);
  console.log(`JSON: ${PLAN_JSON}`);
  console.log(`CSV: ${PLAN_CSV}`);
  console.log("PREVIEW ONLY β€” no assets or database rows changed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

