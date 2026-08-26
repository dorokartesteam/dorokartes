import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDomain } from "tldts";
import { chromium } from "playwright";

const BASE =
  "https://www.bestprice.gr/cat/3134/prepaid-cards.html";

const APPLY = process.argv.includes("--apply");
const IMPORT = process.argv.includes("--import");
const RESOLVE_MERCHANTS = !process.argv.includes("--no-merchant-resolution");

function argInt(name: string, fallback: number) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const MAX_SCROLLS = Math.min(argInt("max-scrolls", 120), 300);
const STABLE_ROUNDS_REQUIRED = Math.min(argInt("stable-rounds", 8), 30);
const SCROLL_WAIT_MS = Math.max(argInt("scroll-wait-ms", 1400), 700);
const MERCHANT_DELAY_MS = Math.max(argInt("merchant-delay-ms", 900), 700);

const OUT_DIR = path.join(process.cwd(), "data", "discovery", "bestprice");
const PRODUCTS_CSV = path.join(OUT_DIR, "bestprice-prepaid-products.csv");
const MERCHANTS_CSV = path.join(OUT_DIR, "bestprice-prepaid-merchants.csv");
const RAW_HTML = path.join(OUT_DIR, "bestprice-prepaid-final.html");

const DATABASE_URL = process.env.DATABASE_URL;
const prisma =
  IMPORT && DATABASE_URL
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: DATABASE_URL }),
      })
    : null;

type ProductRow = {
  title: string;
  priceText: string;
  merchantName: string;
  productUrl: string;
  merchantProfileUrl: string;
  officialMerchantUrl: string;
  registeredDomain: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function domainOf(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      getDomain(host, { allowPrivateDomains: true }) ??
      host.replace(/^www\./, "")
    );
  } catch {
    return "";
  }
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(
  file: string,
  rows: Record<string, unknown>[],
  headers: string[],
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];

  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

async function resolveMerchantProfile(
  context: any,
  url: string,
): Promise<string> {
  const page = await context.newPage();

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    if (!response) return "";
    if ([401, 403, 429].includes(response.status())) return "";

    await page.waitForTimeout(500);

    const official = await page.evaluate(() => {
      const badHosts = [
        "bestprice.gr",
        "facebook.com",
        "instagram.com",
        "linkedin.com",
        "youtube.com",
        "tiktok.com",
        "twitter.com",
        "x.com",
        "pinterest.com",
        "pinterest.gr",
        "threads.net",
        "linktr.ee",
        "linktree.com",
        "google.com",
      ];

      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));

      for (const link of links) {
        let u: URL;
        try {
          u = new URL(link.href, location.href);
        } catch {
          continue;
        }

        if (!["http:", "https:"].includes(u.protocol)) continue;

        const host = u.hostname.toLowerCase();
        if (badHosts.some((x) => host === x || host.endsWith(`.${x}`))) {
          continue;
        }

        const text = (link.textContent || "").trim().toLowerCase();
        const rel = (link.getAttribute("rel") || "").toLowerCase();

        const visibleDomain = host.replace(/^www\./, "");
        const textLooksLikeDomain =
          text.includes(visibleDomain) ||
          /[a-z0-9-]+\.(gr|com|eu|net|org|io|shop|store)$/i.test(text);

        const textLooksLikeWebsiteLabel =
          text === "website" ||
          text === "site" ||
          text === "ιστοσελίδα" ||
          text === "eshop" ||
          text === "e-shop";

        if (textLooksLikeDomain || textLooksLikeWebsiteLabel) {
          return u.toString();
        }
      }

      return "";
    });

    return official;
  } catch {
    return "";
  } finally {
    await page.close();
  }
}

async function harvestBrowser(): Promise<ProductRow[]> {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    locale: "el-GR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1200 },
  });

  const page = await context.newPage();

  try {
    const response = await page.goto(BASE, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (!response) {
      throw new Error("BestPrice returned no navigation response.");
    }

    const status = response.status();

    if ([401, 403, 429].includes(status)) {
      throw new Error(
        `BestPrice blocked the browser request with HTTP ${status}. ` +
        `No bypass attempted.`,
      );
    }

    console.log(`Initial HTTP: ${status}`);

    await page.waitForTimeout(1800);

    let stableRounds = 0;
    let previousCount = 0;

    for (let round = 1; round <= MAX_SCROLLS; round++) {
      const count = await page.locator('a[href*="/to/"]').count();

      if (count > previousCount) {
        stableRounds = 0;
        previousCount = count;
      } else {
        stableRounds++;
      }

      console.log(
        `[SCROLL ${round}] product-links=${count} stable=${stableRounds}/${STABLE_ROUNDS_REQUIRED}`,
      );

      // Click a visible "load more" style control if BestPrice uses one.
      const clicked = await page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a, [role="button"]'
          )
        );

        const el = candidates.find((node) => {
          const text = (node.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          if (!text) return false;

          const looksLikeMore =
            text.includes("περισσότερα") ||
            text.includes("φόρτωσε περισσότερα") ||
            text.includes("εμφάνιση περισσότερων") ||
            text.includes("load more") ||
            text.includes("show more");

          if (!looksLikeMore) return false;

          const style = getComputedStyle(node);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            node.getBoundingClientRect().height > 0
          );
        });

        if (!el) return false;
        el.click();
        return true;
      });

      if (!clicked) {
        await page.evaluate(() => {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "instant" as ScrollBehavior,
          });
        });
      }

      await page.waitForTimeout(SCROLL_WAIT_MS);

      const after = await page.locator('a[href*="/to/"]').count();

      if (after > previousCount) {
        previousCount = after;
        stableRounds = 0;
      }

      if (stableRounds >= STABLE_ROUNDS_REQUIRED) {
        console.log("Catalog appears stable; stopping dynamic loading.");
        break;
      }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const html = await page.content();
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(RAW_HTML, html, "utf8");


    const productLocator = page.locator('a[href*="/to/"]');
    const rawProducts: Array<{
      title: string;
      priceText: string;
      merchantName: string;
      productUrl: string;
      merchantProfileUrl: string;
    }> = [];

    const productCount = await productLocator.count();

    for (let i = 0; i < productCount; i++) {
      const productAnchor = productLocator.nth(i);

      const productUrl = (await productAnchor.getAttribute("href")) || "";
      const title = ((await productAnchor.textContent()) || "")
        .replace(/\\s+/g, " ")
        .trim();

      if (!productUrl || !title) continue;

      let merchantName = "";
      let merchantProfileUrl = "";
      let priceText = "";

      for (let depth = 1; depth <= 8; depth++) {
        const ancestor = productAnchor.locator("xpath=" + "/..".repeat(depth));

        if ((await ancestor.count()) === 0) continue;

        const merchant = ancestor.locator('a[href*="/m/"]').first();

        if ((await merchant.count()) > 0) {
          merchantName = ((await merchant.textContent()) || "")
            .replace(/\\s+/g, " ")
            .trim();

          merchantProfileUrl =
            (await merchant.getAttribute("href")) || "";

          const text = ((await ancestor.textContent()) || "")
            .replace(/\\s+/g, " ")
            .trim();

          const priceMatch =
            text.match(/\\b\\d{1,4}(?:[.,]\\d{2})?\\s*€/);

          priceText = priceMatch?.[0] || "";
          break;
        }
      }

      if (!merchantProfileUrl) continue;

      rawProducts.push({
        title,
        priceText,
        merchantName,
        productUrl: new URL(productUrl, BASE).toString(),
        merchantProfileUrl: new URL(
          merchantProfileUrl,
          BASE,
        ).toString(),
      });
    }

    const productMap = new Map<
      string,
      (typeof rawProducts)[number]
    >();

    for (const row of rawProducts) {
      if (!productMap.has(row.productUrl)) {
        productMap.set(row.productUrl, row);
      }
    }

    const products = [...productMap.values()];

    console.log(`Browser harvested unique product rows: ${products.length}`);

    const merchantMap = new Map<
      string,
      {
        merchantName: string;
        merchantProfileUrl: string;
        officialMerchantUrl: string;
        registeredDomain: string;
      }
    >();

    for (const p of products) {
      const key = p.merchantProfileUrl || p.merchantName.toLowerCase();

      if (!merchantMap.has(key)) {
        merchantMap.set(key, {
          merchantName: p.merchantName,
          merchantProfileUrl: p.merchantProfileUrl,
          officialMerchantUrl: "",
          registeredDomain: "",
        });
      }
    }

    if (RESOLVE_MERCHANTS) {
      console.log("");
      console.log(
        `Resolving ${merchantMap.size} BestPrice merchant profiles...`,
      );

      let i = 0;

      for (const merchant of merchantMap.values()) {
        i++;

        const official = merchant.merchantProfileUrl
          ? await resolveMerchantProfile(context, merchant.merchantProfileUrl)
          : "";

        const socialOrAggregatorHosts = [
          "twitter.com",
          "x.com",
          "pinterest.com",
          "pinterest.gr",
          "facebook.com",
          "instagram.com",
          "linkedin.com",
          "youtube.com",
          "tiktok.com",
          "threads.net",
          "linktr.ee",
          "linktree.com",
          "bestprice.gr",
        ];

        let safeOfficial = official;

        if (safeOfficial) {
          try {
            const host = new URL(safeOfficial).hostname.toLowerCase();
            if (
              socialOrAggregatorHosts.some(
                (x) => host === x || host.endsWith(`.${x}`)
              )
            ) {
              safeOfficial = "";
            }
          } catch {
            safeOfficial = "";
          }
        }

        merchant.officialMerchantUrl = safeOfficial;
        merchant.registeredDomain = domainOf(safeOfficial);

        console.log(
          `[MERCHANT ${i}/${merchantMap.size}] ${merchant.merchantName} -> ` +
            `${official || "NO OFFICIAL URL FOUND"}`,
        );

        await sleep(MERCHANT_DELAY_MS);
      }
    }

    return products.map((p) => {
      const merchant =
        merchantMap.get(p.merchantProfileUrl || p.merchantName.toLowerCase());

      return {
        ...p,
        officialMerchantUrl: merchant?.officialMerchantUrl || "",
        registeredDomain: merchant?.registeredDomain || "",
      };
    });
  } finally {
    await browser.close();
  }
}

async function importDiscovery(products: ProductRow[]) {
  if (!prisma) throw new Error("Prisma not initialized.");

  let created = 0;
  let existing = 0;

  for (const p of products) {
    const fingerprint =
      `bestprice-prepaid|${p.productUrl.toLowerCase()}`;

    const old = await prisma.discoveryItem.findFirst({
      where: { fingerprint },
      select: { id: true },
    });

    if (old) {
      existing++;
      continue;
    }

    await prisma.discoveryItem.create({
      data: {
        sourceType: SourceType.AGGREGATOR,
        sourceName: "BestPrice Prepaid Cards",
        sourceUrl: p.productUrl,
        title: p.title,
        merchantName: p.merchantName || null,
        status: DiscoveryStatus.QUEUED,
        possibleOfficialUrl: p.officialMerchantUrl || null,
        fingerprint,
        notes: [
          `BestPrice category: ${BASE}`,
          p.priceText ? `Listed price: ${p.priceText}` : "",
          p.merchantProfileUrl
            ? `BestPrice merchant profile: ${p.merchantProfileUrl}`
            : "",
          "Aggregator discovery evidence only; verify against official merchant site before production.",
        ]
          .filter(Boolean)
          .join(" | "),
      },
    });

    created++;
  }

  return { created, existing };
}

async function main() {
  console.log("Dorokartes BestPrice Prepaid Harvester v2");
  console.log("=========================================");
  console.log(`Mode: ${APPLY ? "HARVEST" : "PLAN"}`);
  console.log(`Import to DB: ${IMPORT ? "YES" : "NO"}`);
  console.log(`Resolve merchant profiles: ${RESOLVE_MERCHANTS ? "YES" : "NO"}`);
  console.log(`Max scroll rounds: ${MAX_SCROLLS}`);
  console.log("");

  if (!APPLY) {
    console.log("PLAN only. Browser was not launched.");
    console.log("");
    console.log("Harvest:");
    console.log("  npm run pipeline:harvest-bestprice -- --apply");
    console.log("");
    console.log("Harvest + DB import:");
    console.log("  npm run pipeline:harvest-bestprice -- --apply --import");
    return;
  }

  const products = await harvestBrowser();

  const merchantCounts = new Map<string, number>();

  for (const p of products) {
    const key = p.merchantProfileUrl || p.merchantName;
    merchantCounts.set(key, (merchantCounts.get(key) ?? 0) + 1);
  }

  const merchants = [...new Map(
    products.map((p) => [
      p.merchantProfileUrl || p.merchantName,
      {
        merchantName: p.merchantName,
        merchantProfileUrl: p.merchantProfileUrl,
        officialMerchantUrl: p.officialMerchantUrl,
        registeredDomain: p.registeredDomain,
        products: merchantCounts.get(
          p.merchantProfileUrl || p.merchantName,
        ) ?? 1,
      },
    ]),
  ).values()].sort((a, b) =>
    a.merchantName.localeCompare(b.merchantName),
  );

  writeCsv(
    PRODUCTS_CSV,
    products as any,
    [
      "title",
      "priceText",
      "merchantName",
      "productUrl",
      "merchantProfileUrl",
      "officialMerchantUrl",
      "registeredDomain",
    ],
  );

  writeCsv(
    MERCHANTS_CSV,
    merchants as any,
    [
      "merchantName",
      "merchantProfileUrl",
      "officialMerchantUrl",
      "registeredDomain",
      "products",
    ],
  );

  let imported = { created: 0, existing: 0 };

  if (IMPORT) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL is required for --import.");
    }

    imported = await importDiscovery(products);
  }

  console.log("");
  console.log("=========================================");
  console.log(`Unique BestPrice product rows: ${products.length}`);
  console.log(`Unique BestPrice merchants: ${merchants.length}`);
  console.log(
    `Merchants with official URL: ` +
      `${merchants.filter((x) => x.officialMerchantUrl).length}`,
  );
  console.log(`DiscoveryItems created: ${imported.created}`);
  console.log(`Existing DiscoveryItems skipped: ${imported.existing}`);
  console.log(`Products CSV: ${PRODUCTS_CSV}`);
  console.log(`Merchants CSV: ${MERCHANTS_CSV}`);
  console.log(`Final rendered HTML: ${RAW_HTML}`);

  if (!IMPORT) {
    console.log("");
    console.log(
      "Harvest completed WITHOUT DB import. Inspect counts/CSVs first.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
