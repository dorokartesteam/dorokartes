import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

export type EvidencePackage = {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  title: string;
  headings: string[];
  ctas: string[];
  visibleText: string;
  contentHash: string;
  fetchTier: "HTTP" | "PLAYWRIGHT";
};

const UA = "DorokartesVerifier/1.0 (+https://dorokartes.gr)";

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function hashEvidence(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function extractEvidenceFromHtml(
  html: string,
  requestedUrl: string,
  finalUrl: string,
  httpStatus: number | null,
  fetchTier: "HTTP" | "PLAYWRIGHT",
): EvidencePackage {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();

  const title = cleanText($("title").first().text()).slice(0, 300);
  const headings = $("h1,h2,h3")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean)
    .slice(0, 30);

  const ctas = $("a,button,[role=button]")
    .map((_, el) => cleanText($(el).text()))
    .get()
    .filter((x) => x.length >= 2 && x.length <= 120)
    .slice(0, 50);

  const visibleText = cleanText($("body").text()).slice(0, 24000);
  const material = JSON.stringify({ finalUrl, title, headings, ctas, visibleText });

  return {
    requestedUrl,
    finalUrl,
    httpStatus,
    title,
    headings,
    ctas,
    visibleText,
    contentHash: hashEvidence(material),
    fetchTier,
  };
}

export async function fetchHttp(url: string): Promise<EvidencePackage | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });

    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;

    const html = await res.text();
    return extractEvidenceFromHtml(html, url, res.url, res.status, "HTTP");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function looksJavascriptThin(e: EvidencePackage) {
  const text = `${e.title} ${e.visibleText}`.trim();
  return text.length < 700;
}

export async function fetchPlaywright(url: string): Promise<EvidencePackage | null> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
      viewport: { width: 1365, height: 900 },
    });

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });

    await page.waitForTimeout(1200);

    const html = await page.content();
    const finalUrl = page.url();
    return extractEvidenceFromHtml(
      html,
      url,
      finalUrl,
      response?.status() ?? null,
      "PLAYWRIGHT",
    );
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
