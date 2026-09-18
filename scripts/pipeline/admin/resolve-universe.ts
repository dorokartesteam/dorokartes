import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { getDomain } from "tldts";

type UniverseRow = {
  merchant_name: string;
  website_url: string;
  category: string;
  subcategory?: string;
  priority?: string;
  country_scope?: string;
  domain_status?: string;
  source_type?: string;
  source_url?: string;
  notes?: string;
};

type ResolutionState = {
  merchantName: string;
  category: string;
  officialUrl: string | null;
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
  searchedAt: string;
};

const ROOT = process.cwd();
const MASTER_PATH =
  process.env.UNIVERSE_MASTER_PATH ??
  path.join(ROOT, "data", "discovery", "mass", "merchant-universe-master.csv");
const STATE_PATH =
  process.env.UNIVERSE_RESOLUTION_STATE_PATH ??
  path.join(ROOT, "data", "discovery", "mass", "merchant-universe-resolution.jsonl");
const RESOLVED_PATH =
  process.env.UNIVERSE_RESOLVED_PATH ??
  path.join(ROOT, "data", "discovery", "mass", "merchant-universe-resolved.csv");

const MODEL = process.env.UNIVERSE_RESOLVER_MODEL ?? "gpt-5.6-luna";
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

function argInt(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((x) => x.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const LIMIT = Math.min(argInt("limit", 25), 100);
const CONCURRENCY = Math.min(argInt("concurrency", 2), 5);
const MIN_CONFIDENCE = 0.84;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => v.trim().length));
}

function readUniverse(): UniverseRow[] {
  const raw = fs.readFileSync(MASTER_PATH, "utf8").replace(/^\uFEFF/, "");
  const matrix = parseCsv(raw);
  const headers = matrix.shift() ?? [];

  return matrix.map((cells) => {
    const out: Record<string, string> = {};
    headers.forEach((h, i) => (out[h.trim()] = cells[i] ?? ""));
    return out as UniverseRow;
  });
}

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function readState(): Map<string, ResolutionState> {
  const map = new Map<string, ResolutionState>();
  if (!fs.existsSync(STATE_PATH)) return map;

  for (const line of fs.readFileSync(STATE_PATH, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as ResolutionState;
      map.set(item.merchantName.trim().toLowerCase(), item);
    } catch {
      // Ignore a malformed historical line; never crash the whole run.
    }
  }
  return map;
}

function appendState(item: ResolutionState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.appendFileSync(STATE_PATH, JSON.stringify(item) + "\n", "utf8");
}

function normalizeUrl(input: string | null | undefined) {
  if (!input) return null;
  try {
    const url = new URL(input.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function registeredDomain(input: string | null) {
  if (!input) return null;
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return getDomain(hostname, { allowPrivateDomains: true }) ?? hostname.replace(/^www\./, "");
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
    .filter((x) => !["the", "and", "hotels", "hotel", "resorts", "resort"].includes(x));
}

function looksLikeDirectoryOrSocial(host: string) {
  return [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "wikipedia.org",
    "youtube.com",
    "tiktok.com",
    "skroutz.gr",
    "bestprice.gr",
    "tripadvisor.com",
    "booking.com",
    "google.com",
    "bing.com",
    "yahoo.com",
  ].some((x) => host === x || host.endsWith(`.${x}`));
}

function marketFromUrl(url: string) {
  const u = new URL(url);
  const text = `${u.hostname}${u.pathname}${u.search}`.toLowerCase();

  if (
    u.hostname.endsWith(".gr") ||
    /(^|[\/_.-])(el-gr|el_gr|gr-el|gr_el|greece|hellas)([\/_.?-]|$)/.test(text) ||
    /(^|\/)gr(\/|$)/.test(u.pathname.toLowerCase())
  ) return "GR" as const;

  if (
    /\/(it-it|fr-fr|de-de|es-es|nl-nl|pt-pt|en-au|fr-be|de-at|en-us|en-ca)(\/|$)/.test(u.pathname.toLowerCase()) ||
    /\/(it\/it|fr\/fr|de\/de|es\/es|nl\/nl|pt\/pt|en\/au|fr\/be|de\/at|en\/us|en\/ca|en\/gb)(\/|$)/.test(u.pathname.toLowerCase())
  ) {
    return "FOREIGN_ONLY" as const;
  }

  if (u.hostname.endsWith(".eu") || /\/eu(\/|$)/.test(u.pathname.toLowerCase())) {
    return "EU_WITH_GR" as const;
  }

  return "GLOBAL" as const;
}

async function validateOfficialUrl(
  merchantName: string,
  candidateUrl: string,
): Promise<{
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  market: ResolutionState["market"];
  reason: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}> {
  const normalized = normalizeUrl(candidateUrl);
  if (!normalized) {
    return { ok: false, status: null, finalUrl: null, title: null, market: "UNKNOWN", reason: "INVALID_URL" };
  }

  const initial = new URL(normalized);
  if (looksLikeDirectoryOrSocial(initial.hostname.toLowerCase())) {
    return { ok: false, status: null, finalUrl: normalized, title: null, market: "UNKNOWN", reason: "NON_OFFICIAL_PLATFORM" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(normalized, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "DorokartesUniverseResolver/1.0 (+https://dorokartes.gr)",
        "accept-language": "el-GR,el;q=0.9,en;q=0.8",
        accept: "text/html,application/xhtml+xml",
      },
    }).finally(() => clearTimeout(timeout));

    const finalUrl = response.url || normalized;
    const final = new URL(finalUrl);

    if (looksLikeDirectoryOrSocial(final.hostname.toLowerCase())) {
      return { ok: false, status: response.status, finalUrl, title: null, market: "UNKNOWN", reason: "REDIRECTED_TO_NON_OFFICIAL_PLATFORM" };
    }

    let title: string | null = null;
    let snippet = "";

    if (response.headers.get("content-type")?.includes("text/html")) {
      const html = (await response.text()).slice(0, 120_000);
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 250) ?? null;
      snippet = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 4000);
    }

    // 401/403/429 can still prove that the official host exists.
    const reachable = response.status < 500 || [401, 403, 429].includes(response.status);
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
    const domainText = normalizeName(final.hostname.replace(/^www\./, "").split(".")[0]);
    const pageText = normalizeName(`${title ?? ""} ${snippet.slice(0, 1200)}`);

    const brandMatch =
      tokens.length === 0 ||
      tokens.some((t) => domainText.includes(t)) ||
      tokens.some((t) => pageText.includes(t));

    return {
      ok: brandMatch,
      status: response.status,
      finalUrl,
      title,
      market: marketFromUrl(finalUrl),
      reason: brandMatch ? "OFFICIAL_DOMAIN_VALIDATED" : "BRAND_SIGNAL_NOT_FOUND",
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: normalized,
      title: null,
      market: marketFromUrl(normalized),
      reason: error instanceof Error ? `FETCH_ERROR:${error.name}` : "FETCH_ERROR",
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
  row: UniverseRow,
): Promise<{
  officialUrl: string | null;
  confidence: number;
  market: ResolutionState["market"];
  reason: string;
}> {
  const prompt = `
Find the OFFICIAL website for this merchant/brand for customers in Greece.

Merchant: ${row.merchant_name}
Category: ${row.category || "unknown"}
Country scope: ${row.country_scope || "GR/EU"}

Rules:
- Search the web.
- Prefer the official Greek storefront/domain.
- If there is no Greek storefront, an official EU/global site is acceptable only if Greece is clearly supported.
- Do NOT return Facebook, Instagram, LinkedIn, Wikipedia, mall directories, marketplaces, review sites, Skroutz, BestPrice, or reseller pages.
- Do NOT invent a URL.
- A foreign-only locale such as /it-it/, /fr-fr/, /de-de/, /en-au/ is NOT valid for Greece.
- Return the brand's homepage/storefront, not a gift-card URL.
- Be conservative. If uncertain, return null.

Return ONLY JSON:
{
  "officialUrl": string | null,
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
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
  const usage: any = response.usage ?? {};

  return {
    officialUrl: normalizeUrl(parsed.officialUrl),
    confidence,
    market: ["GR", "EU_WITH_GR", "GLOBAL", "FOREIGN_ONLY", "UNKNOWN"].includes(parsed.market)
      ? parsed.market
      : "UNKNOWN",
    reason: String(parsed.reason ?? "").slice(0, 500),
    inputTokens: usage.input_tokens ?? usage.inputTokens ?? null,
    outputTokens: usage.output_tokens ?? usage.outputTokens ?? null,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? null,
  };
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

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => lane()));
  return output;
}

function rebuildResolvedCsv(master: UniverseRow[], state: Map<string, ResolutionState>) {
  const rows = master.map((row) => {
    const key = row.merchant_name.trim().toLowerCase();
    const resolved = state.get(key);
    if (!resolved) return row;

    if (resolved.status === "RESOLVED" && resolved.finalUrl) {
      return {
        ...row,
        website_url: resolved.finalUrl,
        domain_status: "SCAN_READY",
        source_type: "OPENAI_WEB_SEARCH_RESOLVED",
        notes: [
          row.notes,
          `Resolver: ${resolved.market}, confidence=${resolved.confidence.toFixed(2)}, ${resolved.reason}`,
        ].filter(Boolean).join(" | "),
      };
    }

    return {
      ...row,
      domain_status: resolved.status,
      notes: [
        row.notes,
        `Resolver: ${resolved.market}, confidence=${resolved.confidence.toFixed(2)}, ${resolved.reason}`,
      ].filter(Boolean).join(" | "),
    };
  });

  const headers = [
    "merchant_name",
    "website_url",
    "category",
    "subcategory",
    "priority",
    "country_scope",
    "domain_status",
    "source_type",
    "source_url",
    "notes",
  ];

  writeCsv(RESOLVED_PATH, rows as any, headers);
  return rows;
}

async function main() {
  const master = readUniverse();
  const state = readState();

  const pending = master.filter((row) => {
    if (row.website_url?.trim()) return false;
    const key = row.merchant_name.trim().toLowerCase();
    if (FORCE) return true;
    const prior = state.get(key);
    return !prior || prior.status === "ERROR";
  });

  console.log("Dorokartes Universe Resolver v1");
  console.log("===============================");
  console.log(`Mode: ${APPLY ? "APPLY" : "PLAN"}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Master rows: ${master.length}`);
  console.log(`Already have URL: ${master.filter((x) => x.website_url?.trim()).length}`);
  console.log(`Resolution records: ${state.size}`);
  console.log(`Pending resolution: ${pending.length}`);
  console.log(`Batch size: ${Math.min(LIMIT, pending.length)}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log("");

  if (!APPLY) {
    console.log("PLAN ONLY. No OpenAI web-search calls were made.");
    console.log(`Run: npm run pipeline:resolve-universe -- --limit=${LIMIT} --apply`);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const batch = pending.slice(0, LIMIT);

  let resolvedCount = 0;
  let marketReview = 0;
  let ambiguous = 0;
  let unavailable = 0;
  let errors = 0;
  let apiCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  await runPool(batch, CONCURRENCY, async (row) => {
    const now = new Date().toISOString();

    try {
      apiCalls++;
      const search = await resolveWithWebSearch(client, row);
      inputTokens += search.inputTokens ?? 0;
      outputTokens += search.outputTokens ?? 0;
      totalTokens += search.totalTokens ?? 0;

      if (!search.officialUrl || search.confidence < 0.55) {
        const item: ResolutionState = {
          merchantName: row.merchant_name,
          category: row.category,
          officialUrl: search.officialUrl,
          registeredDomain: registeredDomain(search.officialUrl),
          status: search.officialUrl ? "AMBIGUOUS" : "UNAVAILABLE",
          confidence: search.confidence,
          market: search.market,
          validationStatus: null,
          finalUrl: search.officialUrl,
          title: null,
          reason: search.reason || "NO_CONFIDENT_OFFICIAL_URL",
          searchedAt: now,
        };
        appendState(item);
        state.set(row.merchant_name.trim().toLowerCase(), item);
        item.status === "AMBIGUOUS" ? ambiguous++ : unavailable++;
        console.log(`[${item.status}] ${row.merchant_name} -> ${item.officialUrl ?? "NONE"} conf=${item.confidence.toFixed(2)}`);
        return item;
      }

      const validation = await validateOfficialUrl(row.merchant_name, search.officialUrl);
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
        // Global official sites need a market check before they enter the Greek scanner.
        status = "MARKET_REVIEW";
      } else if (effectiveMarket === "FOREIGN_ONLY") {
        status = "MARKET_REVIEW";
      }

      const item: ResolutionState = {
        merchantName: row.merchant_name,
        category: row.category,
        officialUrl: search.officialUrl,
        registeredDomain: registeredDomain(validation.finalUrl ?? search.officialUrl),
        status,
        confidence: search.confidence,
        market: effectiveMarket,
        validationStatus: validation.status,
        finalUrl: validation.finalUrl ?? search.officialUrl,
        title: validation.title,
        reason: `${search.reason} | ${validation.reason}`.slice(0, 700),
        searchedAt: now,
      };

      appendState(item);
      state.set(row.merchant_name.trim().toLowerCase(), item);

      if (status === "RESOLVED") resolvedCount++;
      else if (status === "MARKET_REVIEW") marketReview++;
      else ambiguous++;

      console.log(
        `[${status}] ${row.merchant_name} -> ${item.finalUrl ?? "NONE"} ` +
        `market=${item.market} conf=${item.confidence.toFixed(2)} http=${item.validationStatus ?? "-"}`
      );

      return item;
    } catch (error) {
      const item: ResolutionState = {
        merchantName: row.merchant_name,
        category: row.category,
        officialUrl: null,
        registeredDomain: null,
        status: "ERROR",
        confidence: 0,
        market: "UNKNOWN",
        validationStatus: null,
        finalUrl: null,
        title: null,
        reason: error instanceof Error ? error.message : String(error),
        searchedAt: now,
      };

      appendState(item);
      state.set(row.merchant_name.trim().toLowerCase(), item);
      errors++;
      console.log(`[ERROR] ${row.merchant_name}: ${item.reason}`);
      return item;
    }
  });

  const rebuilt = rebuildResolvedCsv(master, state);
  const scanReady = rebuilt.filter(
    (row) => row.website_url?.trim() && row.domain_status === "SCAN_READY"
  );

  console.log("");
  console.log("====================================");
  console.log(`Processed: ${batch.length}`);
  console.log(`RESOLVED: ${resolvedCount}`);
  console.log(`MARKET_REVIEW: ${marketReview}`);
  console.log(`AMBIGUOUS: ${ambiguous}`);
  console.log(`UNAVAILABLE: ${unavailable}`);
  console.log(`ERROR: ${errors}`);
  console.log(`OpenAI web-search calls: ${apiCalls}`);
  console.log(`Input tokens: ${inputTokens || "-"}`);
  console.log(`Output tokens: ${outputTokens || "-"}`);
  console.log(`Total tokens: ${totalTokens || "-"}`);
  console.log(`Total scan-ready rows after rebuild: ${scanReady.length}`);
  console.log(`State: ${STATE_PATH}`);
  console.log(`Resolved universe: ${RESOLVED_PATH}`);
  console.log("");
  console.log("Next: npm run pipeline:build-scan-ready");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
