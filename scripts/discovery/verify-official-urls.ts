import "dotenv/config";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 15_000;

const strongKeywords = [
  "gift card",
  "giftcard",
  "e-gift",
  "egift",
  "gift voucher",
  "δωροκάρτα",
  "δωροκαρτα",
  "δωροεπιταγή",
  "δωροεπιταγη",
];

const supportingKeywords = [
  "αγορά",
  "buy",
  "purchase",
  "καλάθι",
  "cart",
  "€",
  "eur",
  "email",
  "sms",
  "εξαργύρωση",
  "redeem",
  "ισχύ",
  "valid",
  "online",
  "κατάστημα",
];

function normalize(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detect(text: string) {
  const normalized = normalize(text);

  const strong = strongKeywords.filter((keyword) =>
    normalized.includes(normalize(keyword)),
  );

  const supporting = supportingKeywords.filter((keyword) =>
    normalized.includes(normalize(keyword)),
  );

  return { strong, supporting };
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "el-GR,el;q=0.9,en;q=0.7",
      },
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType,
      body: await response.text(),
    };
  } finally {
    clearTimeout(timer);
  }
}

function inspectHtml(html: string, url: string) {
  const $ = cheerio.load(html);

  $("script,style,noscript,svg").remove();

  const title = $("title").first().text().trim();
  const h1 = $("h1").first().text().trim();
  const body = $("body").text().replace(/\s+/g, " ").trim().slice(0, 45_000);

  const actions = $("a,button,input[type=submit]")
    .map((_, el) => $(el).text() || $(el).attr("value") || "")
    .get()
    .join(" ");

  const text = `${title}\n${h1}\n${body}\n${actions}`;
  const detected = detect(text);

  let score = 0;

  if (detected.strong.length > 0) score += 50;
  if (detected.strong.length > 1) score += 10;
  score += Math.min(detected.supporting.length * 3, 20);

  const normalizedUrl = normalize(url);
  if (
    normalizedUrl.includes("gift") ||
    normalizedUrl.includes("voucher") ||
    normalizedUrl.includes("dorok") ||
    normalizedUrl.includes("dwrok") ||
    normalizedUrl.includes("doroepit")
  ) {
    score += 20;
  }

  return {
    title,
    score: Math.min(score, 100),
    strong: detected.strong,
    supporting: detected.supporting,
  };
}

async function verifyItem(item: {
  id: string;
  sourceUrl: string;
  sourceName: string;
  merchantName: string | null;
}) {
  const started = Date.now();

  try {
    const result = await fetchWithTimeout(item.sourceUrl);

    if (!result.ok) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          status: DiscoveryStatus.QUEUED,
          processedAt: new Date(),
          notes: `Exact official URL reachable attempt returned HTTP ${result.status}. Manual/browser review required. Final URL: ${result.finalUrl}`,
        },
      });

      return {
        merchant: item.merchantName ?? item.sourceName,
        result: `QUEUED HTTP ${result.status}`,
        seconds: (Date.now() - started) / 1000,
      };
    }

    if (result.contentType.toLowerCase().includes("pdf")) {
      await prisma.discoveryItem.update({
        where: { id: item.id },
        data: {
          status: DiscoveryStatus.VERIFIED,
          processedAt: new Date(),
          notes: `Exact official PDF reachable (HTTP ${result.status}). Final URL: ${result.finalUrl}`,
        },
      });

      return {
        merchant: item.merchantName ?? item.sourceName,
        result: "VERIFIED PDF",
        seconds: (Date.now() - started) / 1000,
      };
    }

    const inspection = inspectHtml(result.body, result.finalUrl);

    const status =
      inspection.score >= 60
        ? DiscoveryStatus.VERIFIED
        : DiscoveryStatus.QUEUED;

    await prisma.discoveryItem.update({
      where: { id: item.id },
      data: {
        status,
        processedAt: new Date(),
        title: inspection.title || undefined,
        notes: [
          `Exact official URL verifier score ${inspection.score}/100.`,
          `Strong: ${inspection.strong.join(", ") || "none"}.`,
          `Supporting: ${inspection.supporting.join(", ") || "none"}.`,
          `Final URL: ${result.finalUrl}`,
          status === DiscoveryStatus.QUEUED
            ? "Low raw-HTML score may be caused by JavaScript rendering or anti-bot protection; manual/browser review required."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    });

    return {
      merchant: item.merchantName ?? item.sourceName,
      result: `${status} ${inspection.score}/100`,
      seconds: (Date.now() - started) / 1000,
    };
  } catch (error) {
    await prisma.discoveryItem.update({
      where: { id: item.id },
      data: {
        status: DiscoveryStatus.QUEUED,
        processedAt: new Date(),
        notes: `Exact official URL verifier error: ${String(error)}. Manual/browser review required.`,
      },
    });

    return {
      merchant: item.merchantName ?? item.sourceName,
      result: "QUEUED ERROR",
      seconds: (Date.now() - started) / 1000,
    };
  }
}

async function main() {
  const items = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,

      // Critical: never run the direct verifier against candidates
      // generated by the broad website scanner.
      NOT: {
        sourceName: "Official Website Verifier",
      },

      status: {
        in: [
          DiscoveryStatus.DISCOVERED,
          DiscoveryStatus.QUEUED,
          DiscoveryStatus.VERIFYING,
          DiscoveryStatus.VERIFIED,
        ],
      },
    },
    select: {
      id: true,
      sourceUrl: true,
      sourceName: true,
      merchantName: true,
    },
    orderBy: {
      discoveredAt: "asc",
    },
  });

  console.log("Dorokartes Exact Official URL Verifier v1.4");
  console.log(`Seeded/manual official items: ${items.length}`);
  console.log("");

  const limit = pLimit(CONCURRENCY);

  const results = await Promise.all(
    items.map((item, index) =>
      limit(async () => {
        console.log(`[${index + 1}/${items.length}] ${item.merchantName ?? item.sourceName}`);

        const result = await verifyItem(item);

        console.log(`  ${result.result} in ${result.seconds.toFixed(1)}s`);
        return result;
      }),
    ),
  );

  const verified = results.filter((r) => r.result.startsWith("VERIFIED")).length;

  console.log("");
  console.log("Exact official verification completed.");
  console.log(`Verified: ${verified}`);
  console.log(`Queued for manual/browser review: ${results.length - verified}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
