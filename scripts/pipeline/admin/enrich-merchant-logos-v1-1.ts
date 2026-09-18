import { prisma } from "../../../lib/prisma";

type Candidate = {
  url: string;
  source: string;
  score: number;
};

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((x) => x.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : undefined;

function cleanUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function sameMerchantHost(assetUrl: string, websiteUrl: string) {
  try {
    const a = new URL(assetUrl);
    const w = new URL(websiteUrl);

    const ah = a.hostname.replace(/^www\./, "");
    const wh = w.hostname.replace(/^www\./, "");

    return ah === wh || ah.endsWith("." + wh) || wh.endsWith("." + ah);
  } catch {
    return false;
  }
}

function absoluteUrl(raw: string, base: string) {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function looksLikeFavicon(url: string) {
  const u = url.toLowerCase();
  return (
    u.includes("favicon") ||
    u.includes("apple-touch-icon") ||
    u.includes("site-icon") ||
    u.includes("cropped-") ||
    u.includes("cropped_") ||
    /(^|[\/_.-])icon([\/_.-]|$)/.test(u)
  );
}

function badAsset(url: string) {
  const u = url.toLowerCase();

  return (
    u.includes("sprite") ||
    u.includes("loader") ||
    u.includes("spinner") ||
    u.includes("placeholder") ||
    u.includes("payment") ||
    u.includes("visa") ||
    u.includes("mastercard") ||
    u.includes("paypal") ||
    u.includes("social") ||
    u.includes("facebook") ||
    u.includes("instagram") ||
    u.includes("twitter") ||
    u.includes("youtube") ||
    u.includes("badge") ||
    u.includes("trustpilot")
  );
}

function assetScore(
  url: string,
  source: string,
  width?: number | null,
  height?: number | null
) {
  let score = 0;
  const u = url.toLowerCase();

  if (source === "header-logo") score += 150;
  if (source === "jsonld-logo") score += 125;
  if (source === "og-image") score += 35;
  if (source === "twitter-image") score += 25;
  if (source === "apple-touch-icon") score += 10;
  if (source === "icon") score += 5;

  if (u.includes("logo")) score += 55;
  if (u.includes("brand")) score += 18;
  if (u.includes("header")) score += 18;
  if (u.includes("mobilelogo") || u.includes("mobile-logo")) score += 12;

  if (u.endsWith(".svg")) score += 35;
  if (u.endsWith(".png")) score += 20;
  if (u.endsWith(".webp")) score += 16;
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) score += 8;

  if (looksLikeFavicon(url)) score -= 120;

  if (width && height) {
    const ratio = width / Math.max(height, 1);

    if (width >= 140 && height >= 35) score += 18;
    if (ratio >= 1.8) score += 24;

    if (ratio >= 0.8 && ratio <= 1.25) {
      // Square-ish image can still be a real logo, but needs stronger evidence.
      score -= 12;
    }

    if (width < 64 || height < 24) score -= 50;
  }

  if (badAsset(url)) score -= 150;

  return score;
}

function decodeHtml(s: string) {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function parseTagAttrs(tag: string) {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gis)) {
    attrs[m[1].toLowerCase()] = decodeHtml(m[3]);
  }
  return attrs;
}

function extractJsonLdLogos(html: string, base: string) {
  const out: Candidate[] = [];
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const m of scripts) {
    const raw = m[1].trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];

      const walk = (obj: any) => {
        if (!obj || typeof obj !== "object") return;

        const logo = obj.logo;

        if (typeof logo === "string") {
          const abs = absoluteUrl(logo, base);
          if (abs) {
            out.push({
              url: abs,
              source: "jsonld-logo",
              score: assetScore(abs, "jsonld-logo"),
            });
          }
        } else if (logo && typeof logo === "object") {
          const rawUrl = logo.url || logo.contentUrl;
          const abs = typeof rawUrl === "string" ? absoluteUrl(rawUrl, base) : null;

          if (abs) {
            out.push({
              url: abs,
              source: "jsonld-logo",
              score: assetScore(
                abs,
                "jsonld-logo",
                Number(logo.width) || null,
                Number(logo.height) || null
              ),
            });
          }
        }

        for (const value of Object.values(obj)) {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === "object") walk(value);
        }
      };

      nodes.forEach(walk);
    } catch {
      // Ignore broken JSON-LD.
    }
  }

  return out;
}

function extractCandidates(html: string, base: string) {
  const candidates: Candidate[] = [];

  candidates.push(...extractJsonLdLogos(html, base));

  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseTagAttrs(m[0]);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    const content = attrs.content;
    if (!content) continue;

    let source: string | null = null;

    if (key === "og:image" || key === "og:image:url") source = "og-image";
    if (key === "twitter:image" || key === "twitter:image:src") source = "twitter-image";

    if (source) {
      const abs = absoluteUrl(content, base);
      if (abs) {
        candidates.push({
          url: abs,
          source,
          score: assetScore(abs, source),
        });
      }
    }
  }

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseTagAttrs(m[0]);
    const rel = (attrs.rel || "").toLowerCase();
    const href = attrs.href;
    if (!href) continue;

    let source: string | null = null;

    if (rel.includes("apple-touch-icon")) source = "apple-touch-icon";
    else if (rel.split(/\s+/).includes("icon")) source = "icon";

    if (source) {
      const abs = absoluteUrl(href, base);
      if (abs) {
        candidates.push({
          url: abs,
          source,
          score: assetScore(abs, source),
        });
      }
    }
  }

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = parseTagAttrs(m[0]);
    const src = attrs.src || attrs["data-src"] || attrs["data-lazy-src"];
    if (!src) continue;

    const classText = `${attrs.class || ""} ${attrs.id || ""} ${attrs.alt || ""}`.toLowerCase();

    const clearlyLogo =
      classText.includes("logo") ||
      classText.includes("brand") ||
      classText.includes("site-logo") ||
      classText.includes("navbar-brand");

    if (!clearlyLogo) continue;

    const abs = absoluteUrl(src, base);
    if (!abs) continue;

    const width = attrs.width ? Number(attrs.width) : null;
    const height = attrs.height ? Number(attrs.height) : null;

    candidates.push({
      url: abs,
      source: "header-logo",
      score: assetScore(abs, "header-logo", width, height),
    });
  }

  const deduped = new Map<string, Candidate>();

  for (const c of candidates) {
    if (badAsset(c.url)) continue;

    const current = deduped.get(c.url);
    if (!current || current.score < c.score) {
      deduped.set(c.url, c);
    }
  }

  return [...deduped.values()].sort((a, b) => b.score - a.score);
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DorokartesLogoAudit/1.1; +https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      throw new Error(`Unexpected content type: ${type}`);
    }

    return {
      html: await response.text(),
      finalUrl: response.url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateAsset(url: string, merchantWebsite: string) {
  if (!sameMerchantHost(url, merchantWebsite)) {
    return { ok: false, reason: "external-host" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DorokartesLogoAudit/1.1; +https://dorokartes.gr)",
        accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return { ok: false, reason: `asset-http-${response.status}` };
    }

    if (!sameMerchantHost(response.url, merchantWebsite)) {
      return { ok: false, reason: "redirected-external-host" };
    }

    const type = (response.headers.get("content-type") || "").toLowerCase();
    const isImage =
      type.startsWith("image/") || response.url.toLowerCase().endsWith(".svg");

    if (!isImage) {
      return {
        ok: false,
        reason: `not-image:${type || "unknown"}`,
      };
    }

    return { ok: true, finalUrl: response.url };
  } catch (e: any) {
    return {
      ok: false,
      reason: e?.name === "AbortError" ? "asset-timeout" : "asset-fetch-failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function safeForAutoApply(best: Candidate, second?: Candidate) {
  const gap = best.score - (second?.score ?? 0);

  if (looksLikeFavicon(best.url)) return false;
  if (best.source === "og-image" || best.source === "twitter-image") return false;
  if (best.source === "icon" || best.source === "apple-touch-icon") return false;

  if (best.source === "header-logo") {
    return best.score >= 165 && gap >= 18;
  }

  if (best.source === "jsonld-logo") {
    return best.score >= 155 && gap >= 25;
  }

  return false;
}

async function main() {
  const merchants = await prisma.merchant.findMany({
    where: {
      websiteUrl: { not: null },
      OR: [{ logoUrl: null }, { logoUrl: "" }],
    },
    orderBy: { name: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      logoUrl: true,
    },
  });

  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  console.log(`Merchants to inspect: ${merchants.length}`);
  console.log("");

  let safe = 0;
  let review = 0;
  let noCandidate = 0;
  let failed = 0;
  let updated = 0;

  for (const merchant of merchants) {
    const websiteUrl = cleanUrl(merchant.websiteUrl);

    if (!websiteUrl) {
      console.log(`SKIP | ${merchant.name} | invalid websiteUrl`);
      failed++;
      continue;
    }

    try {
      const { html, finalUrl } = await fetchHtml(websiteUrl);

      const candidates = extractCandidates(html, finalUrl).filter((x) =>
        sameMerchantHost(x.url, finalUrl)
      );

      const best = candidates[0];
      const second = candidates[1];

      if (!best) {
        console.log(`NONE | ${merchant.name} | ${websiteUrl}`);
        noCandidate++;
        continue;
      }

      const gap = best.score - (second?.score ?? 0);
      const isSafe = safeForAutoApply(best, second);

      if (!isSafe) {
        console.log(
          `REVIEW | ${merchant.name} | ${best.source} | score=${best.score} gap=${gap} | ${best.url}`
        );
        review++;
        continue;
      }

      const validation = await validateAsset(best.url, finalUrl);

      if (!validation.ok) {
        console.log(
          `REJECT | ${merchant.name} | ${validation.reason} | ${best.url}`
        );
        review++;
        continue;
      }

      const finalLogo = validation.finalUrl!;

      console.log(
        `${APPLY ? "SAFE" : "CANDIDATE"} | ${merchant.name} | ${best.source} | score=${best.score} gap=${gap} | ${finalLogo}`
      );

      safe++;

      if (APPLY) {
        await prisma.merchant.update({
          where: { id: merchant.id },
          data: { logoUrl: finalLogo },
        });

        console.log(`UPDATED | ${merchant.name} | ${finalLogo}`);
        updated++;
      }
    } catch (e: any) {
      console.log(`ERROR | ${merchant.name} | ${e?.message || "unknown error"}`);
      failed++;
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`Safe candidates: ${safe}`);
  console.log(`Manual review: ${review}`);
  console.log(`No candidate: ${noCandidate}`);
  console.log(`Failed: ${failed}`);
  if (APPLY) console.log(`Updated: ${updated}`);
  else console.log("PREVIEW ONLY — database unchanged.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
