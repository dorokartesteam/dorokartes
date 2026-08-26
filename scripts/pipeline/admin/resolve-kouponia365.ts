import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type ResolutionState = {
  discoveryItemId: string;
  merchantName: string;
  officialGiftCardUrl: string | null;
  registeredDomain: string | null;
  status:
    | "RESOLVED"
    | "MARKET_REVIEW"
    | "AMBIGUOUS"
    | "UNAVAILABLE"
    | "ERROR";
  confidence: number;
  market: "GR" | "EU_WITH_GR" | "GLOBAL" | "FOREIGN_ONLY" | "UNKNOWN";
  validationStatus: number | null;
  finalUrl: string | null;
  title: string | null;
  reason: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  searchedAt: string;
};

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const ROOT = process.cwd();
const STATE_PATH =
  process.env.KOUPONIA365_RESOLUTION_STATE_PATH ??
  path.join(
    ROOT,
    "data",
    "discovery",
    "kouponia365",
    "kouponia365-paid-resolution.jsonl",
  );

const MODEL = process.env.KOUPONIA365_RESOLVER_MODEL ?? "gpt-5.6-luna";
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

function argInt(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((x) => x.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const LIMIT = Math.min(argInt("limit", 5), 25);
const CONCURRENCY = Math.min(argInt("concurrency", 1), 3);
const MIN_CONFIDENCE = 0.84;

function normalizeUrl(input: string | null | undefined) {
  if (!input) return null;

  try {
    const url = new URL(input.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;

    url.hash = "";

    // Remove common tracking parameters while preserving functional query params.
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["gclid", "fbclid", "msclkid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

function registeredDomain(input: string | null) {
  if (!input) return null;

  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return (
      getDomain(hostname, { allowPrivateDomains: true }) ??
      hostname.replace(/^www\./, "")
    );
  } catch {
    return null;
  }
}

function normalizeName(input: string) {
  return input
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\b(greece|hellas|gr|official|store|shop|online)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function brandTokens(input: string) {
  return normalizeName(input)
    .split(" ")
    .filter((x) => x.length >= 3)
    .filter(
      (x) =>
        ![
          "the",
          "and",
          "airlines",
          "hotel",
          "hotels",
          "resort",
          "resorts",
          "sports",
        ].includes(x),
    );
}

function looksLikeBlockedPlatform(host: string) {
  return [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "wikipedia.org",
    "youtube.com",
    "tiktok.com",
    "skroutz.gr",
    "bestprice.gr",
    "kouponia365.gr",
    "tripadvisor.com",
    "booking.com",
    "google.com",
    "bing.com",
    "yahoo.com",
    "amazon.com",
    "amazon.de",
  ].some((x) => host === x || host.endsWith(`.${x}`));
}

function marketFromUrl(url: string) {
  const u = new URL(url);
  const text = `${u.hostname}${u.pathname}${u.search}`.toLowerCase();

  if (
    u.hostname.endsWith(".gr") ||
    /(^|[\/_.-])(el-gr|el_gr|gr-el|gr_el|greece|hellas)([\/_.?-]|$)/.test(
      text,
    ) ||
    /(^|\/)gr(\/|$)/.test(u.pathname.toLowerCase())
  ) {
    return "GR" as const;
  }

  if (
    /\/(it-it|fr-fr|de-de|es-es|nl-nl|pt-pt|en-au|fr-be|de-at|en-us|en-ca)(\/|$)/.test(
      u.pathname.toLowerCase(),
    )
  ) {
    return "FOREIGN_ONLY" as const;
  }

  if (
    u.hostname.endsWith(".eu") ||
    /\/eu(\/|$)/.test(u.pathname.toLowerCase())
  ) {
    return "EU_WITH_GR" as const;
  }

  return "GLOBAL" as const;
}

function giftCardSignal(text: string) {
  const t = text.toLowerCase();

  const positives = [
    "gift card",
    "giftcard",
    "e-gift",
    "egift",
    "gift voucher",
    "δώροκάρ",
    "δωροκάρ",
    "δωροεπιτα",
    "δωρο επιτα",
  ];

  return positives.some((x) => t.includes(x));
}

async function validateGiftCardUrl(
  merchantName: string,
  candidateUrl: string,
): Promise<{
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  market: ResolutionState["market"];
  reason: string;
}> {
  const normalized = normalizeUrl(candidateUrl);

  if (!normalized) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      title: null,
      market: "UNKNOWN",
      reason: "INVALID_URL",
    };
  }

  const initial = new URL(normalized);

  if (looksLikeBlockedPlatform(initial.hostname.toLowerCase())) {
    return {
      ok: false,
      status: null,
      finalUrl: normalized,
      title: null,
      market: "UNKNOWN",
      reason: "NON_OFFICIAL_OR_AGGREGATOR_PLATFORM",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(normalized, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "DorokartesKouponia365Resolver/1.0 (+https://dorokartes.gr)",
        "accept-language": "el-GR,el;q=0.9,en;q=0.8",
        accept: "text/html,application/xhtml+xml",
      },
    }).finally(() => clearTimeout(timeout));

    const finalUrl = response.url || normalized;
    const final = new URL(finalUrl);

    if (looksLikeBlockedPlatform(final.hostname.toLowerCase())) {
      return {
        ok: false,
        status: response.status,
        finalUrl,
        title: null,
        market: "UNKNOWN",
        reason: "REDIRECTED_TO_NON_OFFICIAL_OR_AGGREGATOR_PLATFORM",
      };
    }

    let title: string | null = null;
    let snippet = "";

    if (response.headers.get("content-type")?.includes("text/html")) {
      const html = (await response.text()).slice(0, 140_000);

      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title =
        titleMatch?.[1]
          ?.replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 250) ?? null;

      snippet = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 6000);
    }

    // A 401/403/429 may still be the correct official page.
    const reachable =
      response.status < 500 || [401, 403, 429].includes(response.status);

    if (!reachable) {
      return {
        ok: false,
        status: response.status,
        finalUrl,
        title,
        market: marketFromUrl(finalUrl),
        reason: `HTTP_${response.status}`,
      };
    }

    const tokens = brandTokens(merchantName);
    const domainText = normalizeName(
      final.hostname.replace(/^www\./, "").split(".")[0],
    );
    const pageText = normalizeName(`${title ?? ""} ${snippet.slice(0, 2500)}`);

    const brandMatch =
      tokens.length === 0 ||
      tokens.some((t) => domainText.includes(t)) ||
      tokens.some((t) => pageText.includes(t));

    // For blocked pages, the URL itself can be sufficient only if it clearly
    // looks like a gift-card page and the domain matches the merchant.
    const urlHasGiftCardSignal = giftCardSignal(
      decodeURIComponent(`${final.pathname} ${final.search}`),
    );

    const visibleGiftCardSignal = giftCardSignal(
      `${title ?? ""} ${snippet.slice(0, 5000)}`,
    );

    const blockedButPlausible =
      [401, 403, 429].includes(response.status) &&
      brandMatch &&
      urlHasGiftCardSignal;

    const ok =
      brandMatch && (visibleGiftCardSignal || urlHasGiftCardSignal || blockedButPlausible);

    return {
      ok,
      status: response.status,
      finalUrl,
      title,
      market: marketFromUrl(finalUrl),
      reason: !brandMatch
        ? "BRAND_SIGNAL_NOT_FOUND"
        : ok
          ? blockedButPlausible
            ? "OFFICIAL_GIFTCARD_URL_BLOCKED_BUT_PLAUSIBLE"
            : "OFFICIAL_GIFTCARD_URL_VALIDATED"
          : "NO_GIFT_CARD_SIGNAL",
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: normalized,
      title: null,
      market: marketFromUrl(normalized),
      reason:
        error instanceof Error
          ? `FETCH_ERROR:${error.name}`
          : "FETCH_ERROR",
    };
  }
}

function extractJson(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("NO_JSON_IN_MODEL_OUTPUT");
    return JSON.parse(match[0]);
  }
}

async function resolveWithWebSearch(
  client: OpenAI,
  merchantName: string,
  sourceTitle: string | null,
): Promise<{
  officialGiftCardUrl: string | null;
  confidence: number;
  market: ResolutionState["market"];
  reason: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}> {
  const prompt = `
Find the OFFICIAL GIFT CARD / E-GIFT CARD / GIFT VOUCHER page for this merchant for customers in Greece.

Merchant: ${merchantName}
Kouponia365 source title: ${sourceTitle ?? "unknown"}

Context:
Kouponia365 listed this merchant inside its gift-card category. Treat that only as discovery evidence.
You must independently locate the merchant's OFFICIAL page.

Rules:
- Search the web.
- Prefer the official Greek gift-card purchase/product page.
- A direct checkout page is acceptable if that is the merchant's stable official gift-card flow.
- If there is no Greek-specific page, an official EU/global gift-card page is acceptable ONLY if Greece is clearly supported.
- Do NOT return Facebook, Instagram, LinkedIn, Wikipedia, Kouponia365, Skroutz, BestPrice, marketplaces, mall directories, review sites, reseller pages, coupon pages, blogs, or gift guides.
- Do NOT return a generic homepage when a gift-card page exists.
- Do NOT return ordinary gift products, gift sets, greeting cards, discount coupons, loyalty rewards, or corporate merchandise pages.
- Do NOT invent a URL.
- A foreign-only locale such as /it-it/, /fr-fr/, /de-de/, /en-us/ is NOT valid for Greece.
- Be conservative. If the official gift-card page cannot be established, return null.

Return ONLY JSON:
{
  "officialGiftCardUrl": string | null,
  "confidence": number,
  "market": "GR" | "EU_WITH_GR" | "GLOBAL" | "FOREIGN_ONLY" | "UNKNOWN",
  "reason": string
}
`.trim();

  const response = await client.responses.create({
    model: MODEL,
    tools: [{ type: "web_search", search_context_size: "low" } as any],
    input: prompt,
    max_output_tokens: 500,
  } as any);

  const parsed = extractJson(response.output_text || "{}");
  const usage: any = response.usage ?? {};

  return {
    officialGiftCardUrl: normalizeUrl(parsed.officialGiftCardUrl),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    market: [
      "GR",
      "EU_WITH_GR",
      "GLOBAL",
      "FOREIGN_ONLY",
      "UNKNOWN",
    ].includes(parsed.market)
      ? parsed.market
      : "UNKNOWN",
    reason: String(parsed.reason ?? "").slice(0, 700),
    inputTokens:
      usage.input_tokens ??
      usage.inputTokens ??
      null,
    outputTokens:
      usage.output_tokens ??
      usage.outputTokens ??
      null,
    totalTokens:
      usage.total_tokens ??
      usage.totalTokens ??
      null,
  };
}

function readState() {
  const map = new Map<string, ResolutionState>();
  if (!fs.existsSync(STATE_PATH)) return map;

  for (const line of fs.readFileSync(STATE_PATH, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    try {
      const item = JSON.parse(line) as ResolutionState;
      map.set(item.discoveryItemId, item);
    } catch {
      // Ignore a malformed historical line.
    }
  }

  return map;
}

function appendState(item: ResolutionState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.appendFileSync(STATE_PATH, JSON.stringify(item) + "\n", "utf8");
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;

  async function lane() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      output[i] = await worker(items[i], i);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => lane(),
    ),
  );

  return output;
}

async function main() {
  const state = readState();

  const unresolved = await prisma.discoveryItem.findMany({
    where: {
      sourceName: "Kouponia365 Gift Cards",
      possibleOfficialUrl: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      merchantName: true,
      title: true,
      sourceUrl: true,
      status: true,
      notes: true,
    },
  });

  const pending = unresolved.filter((item) => {
    if (FORCE) return true;
    const prior = state.get(item.id);
    return !prior || prior.status === "ERROR";
  });

  const batch = pending.slice(0, LIMIT);

  console.log("Dorokartes Kouponia365 Paid Resolver v1");
  console.log("=======================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Unresolved Kouponia365 rows: ${unresolved.length}`);
  console.log(`Prior paid resolution records: ${state.size}`);
  console.log(`Pending paid resolution: ${pending.length}`);
  console.log(`Batch size: ${batch.length}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log("");

  if (!APPLY) {
    console.log("PLAN ONLY. No OpenAI web-search calls were made.");
    console.log(
      `Run: npm run pipeline:resolve-kouponia365 -- --limit=${LIMIT} --apply`,
    );
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let resolvedCount = 0;
  let marketReview = 0;
  let ambiguous = 0;
  let unavailable = 0;
  let errors = 0;
  let apiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  await runPool(batch, CONCURRENCY, async (item) => {
    const now = new Date().toISOString();
    const merchantName = item.merchantName || item.title || "Unknown merchant";

    try {
      apiCalls++;

      const search = await resolveWithWebSearch(
        client,
        merchantName,
        item.title,
      );

      inputTokens += search.inputTokens ?? 0;
      outputTokens += search.outputTokens ?? 0;
      totalTokens += search.totalTokens ?? 0;

      if (!search.officialGiftCardUrl || search.confidence < 0.55) {
        const result: ResolutionState = {
          discoveryItemId: item.id,
          merchantName,
          officialGiftCardUrl: search.officialGiftCardUrl,
          registeredDomain: registeredDomain(search.officialGiftCardUrl),
          status: search.officialGiftCardUrl ? "AMBIGUOUS" : "UNAVAILABLE",
          confidence: search.confidence,
          market: search.market,
          validationStatus: null,
          finalUrl: search.officialGiftCardUrl,
          title: null,
          reason: search.reason || "NO_CONFIDENT_OFFICIAL_GIFTCARD_URL",
          inputTokens: search.inputTokens,
          outputTokens: search.outputTokens,
          totalTokens: search.totalTokens,
          searchedAt: now,
        };

        appendState(result);
        state.set(item.id, result);

        if (result.status === "AMBIGUOUS") ambiguous++;
        else unavailable++;

        console.log(
          `[${result.status}] ${merchantName} -> ${
            result.officialGiftCardUrl ?? "NONE"
          } conf=${result.confidence.toFixed(2)} tokens=${
            result.totalTokens ?? "-"
          }`,
        );

        return result;
      }

      const validation = await validateGiftCardUrl(
        merchantName,
        search.officialGiftCardUrl,
      );

      const effectiveMarket =
        validation.market !== "GLOBAL" && validation.market !== "UNKNOWN"
          ? validation.market
          : search.market;

      let status: ResolutionState["status"] = "AMBIGUOUS";

      if (
        validation.ok &&
        search.confidence >= MIN_CONFIDENCE &&
        ["GR", "EU_WITH_GR"].includes(effectiveMarket)
      ) {
        status = "RESOLVED";
      } else if (
        validation.ok &&
        search.confidence >= MIN_CONFIDENCE &&
        effectiveMarket === "GLOBAL"
      ) {
        // Never silently promote a global/unspecified market page into Greece.
        status = "MARKET_REVIEW";
      } else if (effectiveMarket === "FOREIGN_ONLY") {
        status = "MARKET_REVIEW";
      }

      const result: ResolutionState = {
        discoveryItemId: item.id,
        merchantName,
        officialGiftCardUrl: search.officialGiftCardUrl,
        registeredDomain: registeredDomain(
          validation.finalUrl ?? search.officialGiftCardUrl,
        ),
        status,
        confidence: search.confidence,
        market: effectiveMarket,
        validationStatus: validation.status,
        finalUrl: validation.finalUrl ?? search.officialGiftCardUrl,
        title: validation.title,
        reason: `${search.reason} | ${validation.reason}`.slice(0, 900),
        inputTokens: search.inputTokens,
        outputTokens: search.outputTokens,
        totalTokens: search.totalTokens,
        searchedAt: now,
      };

      appendState(result);
      state.set(item.id, result);

      if (status === "RESOLVED") {
        resolvedCount++;

        await prisma.discoveryItem.update({
          where: { id: item.id },
          data: {
            possibleOfficialUrl: result.finalUrl,
            status:
              item.status === DiscoveryStatus.DISCOVERED
                ? DiscoveryStatus.QUEUED
                : item.status,
            notes: [
              item.notes || "",
              "Official gift-card URL resolved by Kouponia365 paid web-search resolver.",
              `Resolution status: ${status}`,
              `Market: ${result.market}`,
              `Confidence: ${result.confidence.toFixed(2)}`,
              `URL: ${result.finalUrl}`,
              `Reason: ${result.reason}`,
            ]
              .filter(Boolean)
              .join(" | "),
          },
        });
      } else if (status === "MARKET_REVIEW") {
        marketReview++;
      } else {
        ambiguous++;
      }

      console.log(
        `[${status}] ${merchantName} -> ${result.finalUrl ?? "NONE"} ` +
          `market=${result.market} conf=${result.confidence.toFixed(2)} ` +
          `http=${result.validationStatus ?? "-"} tokens=${
            result.totalTokens ?? "-"
          }`,
      );

      return result;
    } catch (error) {
      const result: ResolutionState = {
        discoveryItemId: item.id,
        merchantName,
        officialGiftCardUrl: null,
        registeredDomain: null,
        status: "ERROR",
        confidence: 0,
        market: "UNKNOWN",
        validationStatus: null,
        finalUrl: null,
        title: null,
        reason: error instanceof Error ? error.message : String(error),
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        searchedAt: now,
      };

      appendState(result);
      state.set(item.id, result);
      errors++;

      console.log(`[ERROR] ${merchantName}: ${result.reason}`);
      return result;
    }
  });

  const remaining = await prisma.discoveryItem.count({
    where: {
      sourceName: "Kouponia365 Gift Cards",
      possibleOfficialUrl: null,
    },
  });

  console.log("");
  console.log("=======================================");
  console.log(`Processed: ${batch.length}`);
  console.log(`RESOLVED + written to DB: ${resolvedCount}`);
  console.log(`MARKET_REVIEW: ${marketReview}`);
  console.log(`AMBIGUOUS: ${ambiguous}`);
  console.log(`UNAVAILABLE: ${unavailable}`);
  console.log(`ERROR: ${errors}`);
  console.log(`Kouponia365 still without URL: ${remaining}`);
  console.log(`OpenAI web-search calls: ${apiCalls}`);
  console.log(`Input tokens: ${inputTokens || "-"}`);
  console.log(`Output tokens: ${outputTokens || "-"}`);
  console.log(`Total tokens: ${totalTokens || "-"}`);
  console.log(`State: ${STATE_PATH}`);
  console.log("");
  console.log("Next: npm run pipeline:review");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
