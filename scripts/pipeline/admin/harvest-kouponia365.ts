import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { chromium, type Locator, type Page } from "playwright";
import { getDomain } from "tldts";

const BASE = "https://kouponia365.gr/kouponia-katigories/dorokartes/";
const APPLY = process.argv.includes("--apply");
const IMPORT = process.argv.includes("--import");

function argInt(name: string, fallback: number) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const MAX_PAGES = Math.min(argInt("max-pages", 100), 500);
const MAX_EMPTY_PAGES = Math.min(argInt("max-empty-pages", 2), 5);

const OUT_DIR = path.join(process.cwd(), "data", "discovery", "kouponia365");
const ITEMS_CSV = path.join(OUT_DIR, "kouponia365-giftcards.csv");
const MERCHANTS_CSV = path.join(OUT_DIR, "kouponia365-merchants.csv");
const DEBUG_CSV = path.join(OUT_DIR, "kouponia365-debug-all-pages.csv");
const FINAL_HTML_DIR = path.join(OUT_DIR, "pages");

const DATABASE_URL = process.env.DATABASE_URL;
const prisma =
  IMPORT && DATABASE_URL
    ? new PrismaClient({
        adapter: new PrismaPg({ connectionString: DATABASE_URL }),
      })
    : null;

type Row = {
  title: string;
  merchantName: string;
  sourcePage: string;
  listingUrl: string;
  possibleOfficialUrl: string;
  registeredDomain: string;
  codeText: string;
  description: string;
};

type DebugRow = {
  page: number;
  sourcePage: string;
  index: number;
  title: string;
  merchantName: string;
  toggleTarget: string;
  hiddenText: string;
  detectedDomains: string;
  possibleOfficialUrl: string;
};

function norm(v: string | null | undefined) {
  return (v || "").replace(/\s+/g, " ").trim();
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function domainOf(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return getDomain(host, { allowPrivateDomains: true }) ?? host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function parseToggleTarget(href: string) {
  const m = href.match(/toggle\(['"]([^'"]+)['"]\)/i);
  return m?.[1] || "";
}

function merchantFromTitle(title: string) {
  const t = norm(title);
  const lower = t.toLocaleLowerCase("el-GR");

  // Current known mappings from page 1.
  const known: Array<[string, string]> = [
    ["big shoes", "Big Shoes"],
    ["camper", "Camper"],
    ["ψυχογιός", "Εκδόσεις Ψυχογιός"],
    ["central", "Central"],
    ["iqueens", "iQueens"],
    ["xxxl leo", "XXXL Leo"],
    ["herbstore", "HerbStore"],
    ["galerie de beaute", "Galerie de Beaute"],
    ["rundome", "Rundome"],
    ["shein", "SHEIN"],
    ["stan & stefan", "Stan & Stefan"],
    ["mandellos sports", "Mandellos Sports"],
    ["sneaker10", "Sneaker10"],
    ["me and joe", "Me and Joe"],
    ["red raven eyewear", "Red Raven Eyewear"],
    ["slamdunk", "Slamdunk"],
    ["anthemion flowers", "Anthemion Flowers"],
    ["carpetlinen", "Carpetlinen"],
    ["pharm24", "Pharm24"],
    ["the body shop", "The Body Shop"],
  ];

  for (const [needle, merchant] of known) {
    if (lower.includes(needle)) return merchant;
  }

  // Generic parser for later pages.
  const tokens = [
    "δωροκάρτα",
    "δωροκάρτες",
    "δωροεπιταγή",
    "δωροεπιταγές",
    "gift card",
    "giftcard",
    "gift voucher",
  ];

  let bestIndex = -1;
  let bestToken = "";

  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0 && (bestIndex < 0 || idx < bestIndex)) {
      bestIndex = idx;
      bestToken = token;
    }
  }

  let merchant = t;

  if (bestIndex === 0) {
    merchant = t.slice(bestToken.length).trim();
  } else if (bestIndex > 0) {
    merchant = t.slice(0, bestIndex).trim();
  }

  const noise = [
    ": το ιδανικό δώρο",
    " – το ιδανικό δώρο",
    " - το ιδανικό δώρο",
    " — το ιδανικό δώρο",
    " το ιδανικό δώρο",
    " έξυπνο δώρο",
    " για κάθε περίσταση",
  ];

  let merchantLower = merchant.toLocaleLowerCase("el-GR");
  for (const marker of noise) {
    const idx = merchantLower.indexOf(marker);
    if (idx > 0) {
      merchant = merchant.slice(0, idx).trim();
      merchantLower = merchant.toLocaleLowerCase("el-GR");
    }
  }

  merchant = merchant
    .replace(/^[\s:;,.!–—-]+|[\s:;,.!–—-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return merchant || t;
}

function detectDomains(value: string) {
  const matches =
    value.match(
      /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.(?:gr|com|eu|net|org|shop|store)\b/gi,
    ) || [];

  return [
    ...new Set(
      matches
        .map((x) =>
          x
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .toLowerCase(),
        )
        .filter((x) => !x.endsWith("kouponia365.gr")),
    ),
  ];
}

function toOfficialUrl(domain: string) {
  return domain ? `https://${domain}/` : "";
}

async function findCard(status: Locator) {
  let node = status;

  for (let depth = 1; depth <= 10; depth++) {
    node = node.locator("xpath=..");
    if ((await node.count()) === 0) break;

    const hasToggle = (await node.locator('a[href*="toggleText_"]').count()) > 0;
    const body = norm(await node.textContent());

    if (hasToggle && body.length > 80) return node;
  }

  return status.locator("xpath=..");
}

async function extractTitle(card: Locator) {
  const heading = card.locator("h1,h2,h3,h4,h5,h6,.title,[class*='title']").first();

  if ((await heading.count()) > 0) {
    const t = norm(await heading.textContent());
    if (t && !/^Επιβεβαιωμένο/i.test(t)) return t;
  }

  const links = card.locator("a[href]");
  const count = await links.count();

  for (let i = 0; i < Math.min(count, 100); i++) {
    const t = norm(await links.nth(i).textContent());
    if (
      t &&
      !/^Επιβεβαιωμένο/i.test(t) &&
      !/^Αγόρασε Τώρα!?$/i.test(t) &&
      !/^Δες Το Στο Κατάστημα$/i.test(t)
    ) {
      return t;
    }
  }

  return norm(await card.textContent()).slice(0, 180);
}

async function extractHidden(card: Locator, page: Page) {
  const toggle = card.locator('a[href*="toggleText_"]').first();

  if ((await toggle.count()) === 0) {
    return { targetId: "", hiddenText: "" };
  }

  const href = (await toggle.getAttribute("href")) || "";
  const targetId = parseToggleTarget(href);

  if (!targetId) return { targetId: "", hiddenText: "" };

  // Kouponia365 can render duplicate id="toggleText_*" values on the same
  // document. Scope the lookup to the current card first, then fall back to
  // the first page-level match. Never use a strict multi-match locator.
  let target = card.locator(`[id="${targetId}"]`).first();

  if ((await target.count()) === 0) {
    target = page.locator(`[id="${targetId}"]`).first();
  }

  if ((await target.count()) === 0) {
    return { targetId, hiddenText: "" };
  }

  return {
    targetId,
    hiddenText: norm(await target.textContent()),
  };
}


function hasGiftCardSignal(value: string) {
  const v = value.toLocaleLowerCase("el-GR");
  return (
    v.includes("δωροκάρτ") ||
    v.includes("δωροεπιταγ") ||
    v.includes("gift card") ||
    v.includes("giftcard") ||
    v.includes("gift voucher")
  );
}

async function categoryPageLooksValid(page: Page) {
  const statuses = page.locator(".coupon-status");
  const count = await statuses.count();

  if (count === 0) return false;

  let checked = 0;
  let giftLike = 0;

  for (let i = 0; i < Math.min(count, 12); i++) {
    const status = statuses.nth(i);
    const card = await findCard(status);
    const title = await extractTitle(card);
    const hidden = await extractHidden(card, page);
    const evidence = `${title} ${hidden.hiddenText}`;

    checked++;
    if (hasGiftCardSignal(evidence)) giftLike++;
  }

  if (checked === 0) return false;

  // Require a majority of sampled cards to actually be gift-card content.
  // This prevents WordPress soft-fallback pages (generic coupon archives)
  // from being mistaken for page 4+ of the gift-card category.
  return giftLike / checked >= 0.6;
}

async function pageCandidates(page: Page) {
  // 1) Native rel=next / pagination controls.
  const selectors = [
    'a[rel="next"]',
    '.next.page-numbers',
    '.pagination a.next',
    '.nav-links a.next',
    'a.next',
    'a:has-text("Επόμενη")',
    'a:has-text("Επόμενο")',
    'a:has-text("Next")',
    'a:has-text("›")',
    'a:has-text("»")',
  ];

  for (const sel of selectors) {
    const locator = page.locator(sel).first();
    if ((await locator.count()) === 0) continue;

    const href = await locator.getAttribute("href").catch(() => null);
    if (!href) continue;

    try {
      return new URL(href, page.url()).toString();
    } catch {}
  }

  return "";
}

function guessedPageUrls(pageNo: number) {
  // Common WordPress pagination variants. We only use them as fallback if
  // the site does not expose rel=next. Each candidate is tested by the browser.
  const n = String(pageNo);

  return [
    new URL(`page/${n}/`, BASE).toString(),
    `${BASE}?paged=${n}`,
    `${BASE}?page=${n}`,
    `${BASE}?pg=${n}`,
  ];
}

async function openNextPage(page: Page, nextPageNo: number, visited: Set<string>) {
  const explicit = await pageCandidates(page);

  const candidates = [
    ...(explicit ? [explicit] : []),
    ...guessedPageUrls(nextPageNo),
  ];

  for (const url of candidates) {
    const normalized = url.replace(/#.*$/, "");
    if (visited.has(normalized)) continue;

    const response = await page.goto(normalized, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    }).catch(() => null);

    if (!response) continue;
    if (response.status() >= 400) continue;

    await page.waitForTimeout(700);

    const count = await page.locator(".coupon-status").count();

    if (count > 0) {
      const validCategoryPage = await categoryPageLooksValid(page);

      if (validCategoryPage) {
        return normalized;
      }

      console.log(
        `Rejected pagination candidate (not gift-card category content): ${normalized}`,
      );
    }
  }

  return "";
}

async function harvestAllPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "el-GR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    const response = await page.goto(BASE, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    if (!response) throw new Error("No response from Kouponia365.");
    console.log(`Initial HTTP: ${response.status()}`);

    if ([401, 403, 429].includes(response.status())) {
      throw new Error(`Blocked by Kouponia365 with HTTP ${response.status()}.`);
    }

    const allRows: Row[] = [];
    const debug: DebugRow[] = [];
    const seenTitles = new Set<string>();
    const visitedPages = new Set<string>();

    let sourcePage = BASE;
    let pageNo = 1;
    let emptyPages = 0;

    fs.mkdirSync(FINAL_HTML_DIR, { recursive: true });

    while (pageNo <= MAX_PAGES && sourcePage) {
      const normalizedSource = sourcePage.replace(/#.*$/, "");
      visitedPages.add(normalizedSource);

      console.log("");
      console.log(`[PAGE ${pageNo}] ${normalizedSource}`);

      await page.waitForTimeout(700);

      const validCurrentPage = await categoryPageLooksValid(page);

      if (!validCurrentPage) {
        console.log(
          `[PAGE ${pageNo}] rejected: content is not predominantly gift-card listings.`,
        );
        break;
      }

      const statuses = page.locator(".coupon-status");
      const count = await statuses.count();

      console.log(`[PAGE ${pageNo}] coupon-status nodes: ${count}`);

      const htmlFile = path.join(FINAL_HTML_DIR, `page-${String(pageNo).padStart(3, "0")}.html`);
      fs.writeFileSync(htmlFile, await page.content(), "utf8");

      let newOnPage = 0;

      for (let i = 0; i < count; i++) {
        const status = statuses.nth(i);
        const card = await findCard(status);
        const title = await extractTitle(card);
        const hidden = await extractHidden(card, page);

        if (!title) continue;

        const fingerprint = title.toLocaleLowerCase("el-GR");
        if (seenTitles.has(fingerprint)) continue;

        seenTitles.add(fingerprint);
        newOnPage++;

        const merchantName = merchantFromTitle(title);
        const detectedDomains = detectDomains(hidden.hiddenText);
        const possibleOfficialUrl =
          detectedDomains.length === 1 ? toOfficialUrl(detectedDomains[0]) : "";

        const codeMatch = hidden.hiddenText.match(
          /(?:κωδικός|code)\s*[:\-]?\s*([A-Z0-9_-]{3,30})/i,
        );

        allRows.push({
          title,
          merchantName,
          sourcePage: normalizedSource,
          listingUrl: normalizedSource,
          possibleOfficialUrl,
          registeredDomain: domainOf(possibleOfficialUrl),
          codeText: codeMatch?.[1] || "",
          description: hidden.hiddenText.slice(0, 1500),
        });

        debug.push({
          page: pageNo,
          sourcePage: normalizedSource,
          index: i + 1,
          title,
          merchantName,
          toggleTarget: hidden.targetId,
          hiddenText: hidden.hiddenText.slice(0, 1500),
          detectedDomains: detectedDomains.join(" | "),
          possibleOfficialUrl,
        });

        console.log(
          `[PAGE ${pageNo} CARD ${i + 1}/${count}] ${merchantName} -> ${
            possibleOfficialUrl || "NEEDS OFFICIAL RESOLUTION"
          }`,
        );
      }

      console.log(
        `[PAGE ${pageNo}] new unique cards: ${newOnPage} | total unique: ${allRows.length}`,
      );

      if (newOnPage === 0) emptyPages++;
      else emptyPages = 0;

      if (emptyPages >= MAX_EMPTY_PAGES) {
        console.log(
          `Stopping: ${MAX_EMPTY_PAGES} consecutive pages produced no new cards.`,
        );
        break;
      }

      const next = await openNextPage(page, pageNo + 1, visitedPages);

      if (!next) {
        console.log("No valid next page found; pagination exhausted.");
        break;
      }

      sourcePage = next;
      pageNo++;
    }

    return { rows: allRows, debug, pagesVisited: visitedPages.size };
  } finally {
    await browser.close();
  }
}

async function importRows(rows: Row[]) {
  if (!prisma) throw new Error("Prisma not initialized.");

  let created = 0;
  let existing = 0;

  for (const row of rows) {
    const fingerprint = [
      "kouponia365-giftcards",
      row.title.toLocaleLowerCase("el-GR"),
    ].join("|");

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
        sourceName: "Kouponia365 Gift Cards",
        sourceUrl: row.sourcePage,
        title: row.title,
        merchantName: row.merchantName,
        status: DiscoveryStatus.QUEUED,
        possibleOfficialUrl: row.possibleOfficialUrl || null,
        fingerprint,
        notes: [
          `Aggregator source page: ${row.sourcePage}`,
          row.registeredDomain
            ? `Explicit domain mentioned in source copy: ${row.registeredDomain}`
            : "Official URL not exposed by source; resolve from merchant name before verification.",
          row.codeText ? `Observed code: ${row.codeText}` : "",
          row.description ? `Source evidence: ${row.description.slice(0, 700)}` : "",
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
  console.log("Dorokartes Kouponia365 Full-Category Harvester v1.9.1");
  console.log("==================================================");
  console.log(`Mode: ${APPLY ? "HARVEST" : "PLAN"}`);
  console.log(`Import to DB: ${IMPORT ? "YES" : "NO"}`);
  console.log(`Max pages: ${MAX_PAGES}`);
  console.log("");

  if (!APPLY) {
    console.log("PLAN only.");
    return;
  }

  const { rows, debug, pagesVisited } = await harvestAllPages();

  writeCsv(
    DEBUG_CSV,
    debug as any,
    [
      "page",
      "sourcePage",
      "index",
      "title",
      "merchantName",
      "toggleTarget",
      "hiddenText",
      "detectedDomains",
      "possibleOfficialUrl",
    ],
  );

  writeCsv(
    ITEMS_CSV,
    rows as any,
    [
      "title",
      "merchantName",
      "sourcePage",
      "listingUrl",
      "possibleOfficialUrl",
      "registeredDomain",
      "codeText",
      "description",
    ],
  );

  const merchantMap = new Map<
    string,
    {
      merchantName: string;
      possibleOfficialUrl: string;
      registeredDomain: string;
      cards: number;
    }
  >();

  for (const row of rows) {
    const key = row.merchantName.toLocaleLowerCase("el-GR");
    const current = merchantMap.get(key);

    if (current) {
      current.cards++;
      if (!current.possibleOfficialUrl && row.possibleOfficialUrl) {
        current.possibleOfficialUrl = row.possibleOfficialUrl;
        current.registeredDomain = row.registeredDomain;
      }
    } else {
      merchantMap.set(key, {
        merchantName: row.merchantName,
        possibleOfficialUrl: row.possibleOfficialUrl,
        registeredDomain: row.registeredDomain,
        cards: 1,
      });
    }
  }

  const merchants = [...merchantMap.values()].sort((a, b) =>
    a.merchantName.localeCompare(b.merchantName, "el"),
  );

  writeCsv(
    MERCHANTS_CSV,
    merchants as any,
    ["merchantName", "possibleOfficialUrl", "registeredDomain", "cards"],
  );

  let imported = { created: 0, existing: 0 };

  if (IMPORT) {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is required for --import.");
    imported = await importRows(rows);
  }

  console.log("");
  console.log("==================================================");
  console.log(`Pages visited: ${pagesVisited}`);
  console.log(`Unique gift-card candidates: ${rows.length}`);
  console.log(`Unique merchant candidates: ${merchants.length}`);
  console.log(
    `Candidates with explicit source domain: ${
      rows.filter((r) => r.possibleOfficialUrl).length
    }`,
  );
  console.log(
    `Candidates needing official-site resolution: ${
      rows.filter((r) => !r.possibleOfficialUrl).length
    }`,
  );
  console.log(`DiscoveryItems created: ${imported.created}`);
  console.log(`Existing DiscoveryItems skipped: ${imported.existing}`);
  console.log(`Items CSV: ${ITEMS_CSV}`);
  console.log(`Merchants CSV: ${MERCHANTS_CSV}`);
  console.log(`Debug CSV: ${DEBUG_CSV}`);

  if (!IMPORT) {
    console.log("");
    console.log("Harvest completed WITHOUT DB import.");
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
