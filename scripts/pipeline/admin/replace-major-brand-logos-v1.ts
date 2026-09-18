import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as cheerio from "cheerio";
import { prisma } from "../../../lib/prisma";

type Mode = "preview" | "apply";

type Candidate = {
  url: string;
  score: number;
  reasons: string[];
  tag: string;
  alt?: string;
  width?: number | null;
  height?: number | null;
};

type BrandResult = {
  merchantId: string;
  merchantName: string;
  websiteUrl: string | null;
  currentLogoUrl: string | null;
  currentLogoSourceUrl: string | null;
  homepageUsed: string | null;
  selected: Candidate | null;
  candidates: Candidate[];
  action: "KEEP" | "PROPOSE_REPLACE" | "APPLIED" | "MANUAL_REVIEW" | "NOT_FOUND";
  note?: string;
  newLogoUrl?: string;
};

const MODE: Mode =
  process.argv.includes("--apply") ? "apply" : "preview";

const REPORT_DIR = path.resolve(process.cwd(), "reports");
const LOGO_DIR = path.resolve(process.cwd(), "public", "merchant-logos");

const TARGETS = [
  "Adidas",
  "Sephora",
  "Amazon",
  "Airbnb",
  "Netflix",
  "Rituals",
  "Zalando",
  "Germanos",
  "Decathlon Greece",
  "KIKO",
  "Hondos Center",
  "Mango",
  "Intersport",
  "LEGO Store Greece",
  "Shell",
  "Ryanair",
  "Mothercare Greece",
] as const;

const BAD_TOKENS = [
  "favicon",
  "apple-touch",
  "apple_touch",
  "touch-icon",
  "site-icon",
  "site_icon",
  "sprite",
  "loader",
  "spinner",
  "payment",
  "visa",
  "mastercard",
  "social",
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "x-logo",
  "app-store",
  "google-play",
  "flag",
  "country",
  "newsletter",
  "cookie",
  "placeholder",
  "dummy",
];

const GOOD_TOKENS = [
  "logo",
  "wordmark",
  "brand",
  "header",
  "navbar",
  "nav-logo",
  "site-logo",
  "brand-logo",
  "logotype",
];

const MIME_EXT: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function host(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function relatedHost(a: string | null, b: string | null) {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function absolutize(raw: string, base: string) {
  try {
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return null;
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function firstSrcFromSrcset(srcset: string | undefined, base: string) {
  if (!srcset) return null;
  const first = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)[0];
  return first ? absolutize(first, base) : null;
}

function parseNum(value: string | undefined) {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function brandTokens(name: string) {
  return name
    .toLowerCase()
    .replace(/greece/g, " ")
    .replace(/store/g, " ")
    .split(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/iu)
    .filter((x) => x.length >= 3);
}

function scoreCandidate(
  c: Omit<Candidate, "score" | "reasons">,
  merchantName: string,
  officialHost: string | null,
) {
  let score = 0;
  const reasons: string[] = [];
  const evidence = `${c.url} ${c.alt ?? ""} ${c.tag}`.toLowerCase();
  const candidateHost = host(c.url);

  if (officialHost && relatedHost(candidateHost, officialHost)) {
    score += 70;
    reasons.push("official-domain");
  } else if (candidateHost) {
    // CDN can still be official infrastructure, but never gets the strongest trust.
    score += 10;
    reasons.push("external-cdn");
  }

  for (const token of GOOD_TOKENS) {
    if (evidence.includes(token)) {
      score += 30;
      reasons.push(`good:${token}`);
      break;
    }
  }

  const tokens = brandTokens(merchantName);
  if (tokens.some((t) => evidence.includes(t))) {
    score += 35;
    reasons.push("brand-name-match");
  }

  if (/header|navbar|navigation|masthead/i.test(c.tag)) {
    score += 25;
    reasons.push("header-context");
  }

  if (/\.svg(?:$|\?)/i.test(c.url)) {
    score += 25;
    reasons.push("svg");
  }

  if (c.width && c.height) {
    if (c.width >= 140 && c.height >= 30) {
      score += 15;
      reasons.push("usable-dimensions");
    }
    if (c.width <= 96 && c.height <= 96) {
      score -= 90;
      reasons.push("tiny-square");
    }
  }

  for (const token of BAD_TOKENS) {
    if (evidence.includes(token)) {
      score -= 140;
      reasons.push(`bad:${token}`);
      break;
    }
  }

  if (/\/icons?\//i.test(c.url)) {
    score -= 60;
    reasons.push("icon-path");
  }

  if (/\.(ico)(?:$|\?)/i.test(c.url)) {
    score -= 200;
    reasons.push("ico");
  }

  return { score, reasons };
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; DorokartesLogoAudit/1.0; +https://dorokartes.gr)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return { text, finalUrl: response.url || url };
}

function collectCandidates(
  html: string,
  baseUrl: string,
  merchantName: string,
  officialHost: string | null,
) {
  const $ = cheerio.load(html);
  const seen = new Map<string, Candidate>();

  function add(
    rawUrl: string | null | undefined,
    tag: string,
    alt?: string,
    width?: number | null,
    height?: number | null,
  ) {
    if (!rawUrl) return;
    const url = absolutize(rawUrl, baseUrl);
    if (!url || !url.startsWith("https://")) return;

    const base = { url, tag, alt, width, height };
    const { score, reasons } = scoreCandidate(base, merchantName, officialHost);
    const candidate: Candidate = { ...base, score, reasons };

    const old = seen.get(url);
    if (!old || candidate.score > old.score) seen.set(url, candidate);
  }

  $("img").each((_, el) => {
    const node = $(el);
    const parentEvidence = node
      .parents("header,nav,[class*='header'],[class*='nav'],[id*='header'],[id*='nav']")
      .first()
      .attr("class") || "";
    const tag = `img ${node.attr("class") || ""} ${node.attr("id") || ""} ${parentEvidence}`;
    const alt = node.attr("alt") || node.attr("title") || "";
    const width = parseNum(node.attr("width"));
    const height = parseNum(node.attr("height"));

    add(node.attr("src"), tag, alt, width, height);
    add(node.attr("data-src"), `${tag} data-src`, alt, width, height);
    add(node.attr("data-lazy-src"), `${tag} lazy`, alt, width, height);
    add(firstSrcFromSrcset(node.attr("srcset"), baseUrl), `${tag} srcset`, alt, width, height);
  });

  $("source").each((_, el) => {
    const node = $(el);
    add(firstSrcFromSrcset(node.attr("srcset"), baseUrl), `source ${node.attr("class") || ""}`);
  });

  $("link[rel]").each((_, el) => {
    const node = $(el);
    const rel = (node.attr("rel") || "").toLowerCase();
    // Deliberately collect icons too, but scoring will heavily penalize them.
    if (rel.includes("icon")) {
      add(node.attr("href"), `link rel=${rel}`);
    }
  });

  $('meta[property="og:image"],meta[name="twitter:image"]').each((_, el) => {
    const node = $(el);
    add(node.attr("content"), `meta ${node.attr("property") || node.attr("name") || ""}`);
  });

  // JSON-LD Organization.logo is useful evidence and is often a proper logo.
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const obj = stack.pop();
        if (!obj || typeof obj !== "object") continue;
        if (obj.logo) {
          if (typeof obj.logo === "string") add(obj.logo, "jsonld organization logo");
          if (typeof obj.logo === "object" && typeof obj.logo.url === "string") {
            add(obj.logo.url, "jsonld organization logo");
          }
        }
        if (Array.isArray(obj["@graph"])) stack.push(...obj["@graph"]);
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  });

  return [...seen.values()]
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, 20);
}

function extensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = path.extname(pathname);
    if ([".svg", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {}
  return null;
}

async function downloadLogo(url: string, merchantName: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; DorokartesLogoAudit/1.0; +https://dorokartes.gr)",
      accept: "image/avif,image/webp,image/svg+xml,image/png,image/jpeg,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) throw new Error(`Logo download HTTP ${response.status}`);

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image: ${contentType || "unknown content-type"}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  if (!buf.length) throw new Error("Downloaded file is empty");
  if (buf.length > 5 * 1024 * 1024) throw new Error("Image exceeds 5 MB");

  let ext = MIME_EXT[contentType] || extensionFromUrl(response.url) || extensionFromUrl(url);
  if (!ext) throw new Error(`Unsupported image type: ${contentType}`);

  fs.mkdirSync(LOGO_DIR, { recursive: true });

  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
  const filename = `${slugify(merchantName)}-official-${hash}${ext}`;
  const absolute = path.join(LOGO_DIR, filename);
  fs.writeFileSync(absolute, buf);

  return `/merchant-logos/${filename}`;
}

async function processMerchant(merchant: {
  id: string;
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  logoSourceUrl: string | null;
}): Promise<BrandResult> {
  if (!merchant.websiteUrl) {
    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      websiteUrl: null,
      currentLogoUrl: merchant.logoUrl,
      currentLogoSourceUrl: merchant.logoSourceUrl,
      homepageUsed: null,
      selected: null,
      candidates: [],
      action: "MANUAL_REVIEW",
      note: "Merchant websiteUrl is missing.",
    };
  }

  try {
    const { text, finalUrl } = await fetchText(merchant.websiteUrl);
    const officialHost = host(finalUrl) || host(merchant.websiteUrl);
    const candidates = collectCandidates(text, finalUrl, merchant.name, officialHost);
    const selected = candidates[0] || null;

    // Conservative threshold: don't auto-replace weak/ambiguous candidates.
    if (!selected || selected.score < 90) {
      return {
        merchantId: merchant.id,
        merchantName: merchant.name,
        websiteUrl: merchant.websiteUrl,
        currentLogoUrl: merchant.logoUrl,
        currentLogoSourceUrl: merchant.logoSourceUrl,
        homepageUsed: finalUrl,
        selected,
        candidates,
        action: selected ? "MANUAL_REVIEW" : "NOT_FOUND",
        note: selected
          ? `Best candidate score ${selected.score} is below safe threshold 90.`
          : "No logo candidate found.",
      };
    }

    if (MODE === "preview") {
      return {
        merchantId: merchant.id,
        merchantName: merchant.name,
        websiteUrl: merchant.websiteUrl,
        currentLogoUrl: merchant.logoUrl,
        currentLogoSourceUrl: merchant.logoSourceUrl,
        homepageUsed: finalUrl,
        selected,
        candidates,
        action: "PROPOSE_REPLACE",
      };
    }

    const newLogoUrl = await downloadLogo(selected.url, merchant.name);

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        logoUrl: newLogoUrl,
        logoSourceUrl: selected.url,
      },
    });

    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      websiteUrl: merchant.websiteUrl,
      currentLogoUrl: merchant.logoUrl,
      currentLogoSourceUrl: merchant.logoSourceUrl,
      homepageUsed: finalUrl,
      selected,
      candidates,
      action: "APPLIED",
      newLogoUrl,
    };
  } catch (error) {
    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      websiteUrl: merchant.websiteUrl,
      currentLogoUrl: merchant.logoUrl,
      currentLogoSourceUrl: merchant.logoSourceUrl,
      homepageUsed: merchant.websiteUrl,
      selected: null,
      candidates: [],
      action: "MANUAL_REVIEW",
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function findTarget(name: string) {
  const exact = await prisma.merchant.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      logoUrl: true,
      logoSourceUrl: true,
    },
  });
  if (exact) return exact;

  return prisma.merchant.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      logoUrl: true,
      logoSourceUrl: true,
    },
  });
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  console.log(`=== MAJOR BRAND LOGO REPLACEMENT V1 (${MODE.toUpperCase()}) ===`);
  console.log("No DB changes in preview mode.\n");

  const results: BrandResult[] = [];

  for (const target of TARGETS) {
    const merchant = await findTarget(target);

    if (!merchant) {
      const missing: BrandResult = {
        merchantId: "",
        merchantName: target,
        websiteUrl: null,
        currentLogoUrl: null,
        currentLogoSourceUrl: null,
        homepageUsed: null,
        selected: null,
        candidates: [],
        action: "NOT_FOUND",
        note: "No matching merchant found in DB.",
      };
      results.push(missing);
      console.log(`- [NOT_FOUND] ${target}`);
      continue;
    }

    const result = await processMerchant(merchant);
    results.push(result);

    const best = result.selected
      ? `${result.selected.url} (score ${result.selected.score})`
      : "none";

    console.log(`- [${result.action}] ${result.merchantName}`);
    console.log(`  site: ${result.websiteUrl ?? "none"}`);
    console.log(`  old:  ${result.currentLogoUrl ?? "none"}`);
    console.log(`  best: ${best}`);
    if (result.newLogoUrl) console.log(`  new:  ${result.newLogoUrl}`);
    if (result.note) console.log(`  note: ${result.note}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    REPORT_DIR,
    `major-brand-logo-replacement-v1-${MODE}-${timestamp}.json`,
  );

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: MODE,
        threshold: 90,
        targets: TARGETS,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\nReport: ${path.relative(process.cwd(), reportPath)}`);
  console.log(
    MODE === "preview"
      ? "\nPREVIEW ONLY. Review proposed sources before running --apply."
      : "\nAPPLY COMPLETE. Commit the downloaded logos only after visual verification.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
