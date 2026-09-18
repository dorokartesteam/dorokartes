import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmounts(value: string): number[] {
  const out = new Set<number>();
  const s = value.replace(/,/g, ".");
  const patterns = [
    /(?:€|eur(?:o)?s?|euro)\s*(\d+(?:\.\d{1,2})?)/gi,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|eur(?:o)?s?|euro)/gi,
  ];
  for (const p of patterns) {
    for (const m of s.matchAll(p)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 10000) out.add(n);
    }
  }
  return [...out].sort((a,b)=>a-b);
}

function stripAmountFragments(value: string) {
  return normalize(value)
    .replace(/\b(?:gift\s*card|giftcard|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\b/gi, " ")
    .replace(/(?:€|eur(?:o)?s?|euro)\s*\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)/gi, " ")
    .replace(/\bαξίας\b/gi, " ")
    .replace(/[|–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMerchantName(name: string, title: string) {
  let cleaned = stripAmountFragments(name);

  // If merchant name is almost entirely denomination text, try to recover brand tail from title.
  if (!cleaned || cleaned.length < 2) {
    cleaned = stripAmountFragments(title);
  }

  // Remove generic leftovers.
  cleaned = cleaned
    .replace(/\b(?:digital|electronic|ηλεκτρονική|ηλεκτρονικη)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || name;
}

function canonicalTitle(merchantName: string) {
  return `${merchantName} Gift Card`;
}

function parentUrlCandidates(raw?: string | null) {
  if (!raw) return [];
  try {
    const u = new URL(raw);
    const out = new Set<string>();

    // Remove search/query tracking.
    u.search = "";
    u.hash = "";

    const parts = u.pathname.split("/").filter(Boolean);

    // Candidate 1: direct parent directory.
    if (parts.length > 1) {
      const p = new URL(u.toString());
      p.pathname = "/" + parts.slice(0, -1).join("/") + "/";
      out.add(p.toString());
    }

    // Candidate 2: nearest gift-card/voucher directory.
    const giftIdx = parts.findIndex((x) =>
      /(gift|voucher|δωρο|dwro)/i.test(x)
    );
    if (giftIdx >= 0) {
      const p = new URL(u.toString());
      p.pathname = "/" + parts.slice(0, giftIdx + 1).join("/") + "/";
      out.add(p.toString());
    }

    return [...out];
  } catch {
    return [];
  }
}

async function checkCandidate(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DorokartesCanonicalAudit/1.0; +https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!r.ok) return { ok: false, status: r.status, score: 0 };

    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html")) return { ok: false, status: r.status, score: 0 };

    const html = (await r.text()).toLowerCase();
    let score = 0;

    if (/gift\s*card|giftcard|voucher|δωροκάρτ|δωροκαρτ|δωροεπιταγ/.test(html)) score += 40;

    const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((x) => /gift|voucher|δωρο|dwro/i.test(x));

    score += Math.min(links.length, 8) * 8;

    return {
      ok: true,
      status: r.status,
      score,
      finalUrl: r.url,
      giftLinksFound: links.length,
    };
  } catch (e: any) {
    return { ok: false, status: 0, score: 0, error: e?.name === "AbortError" ? "timeout" : "fetch-failed" };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: { in: ["ACTIVE","DRAFT","HIDDEN"] } },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      officialUrl: true,
      status: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
        },
      },
      variants: {
        select: {
          id: true,
          label: true,
          minValue: true,
          maxValue: true,
          fixedValue: true,
          currency: true,
        },
      },
    },
  });

  const targets = cards.filter((c) =>
    parseAmounts(`${c.title} ${c.merchant.name}`).length > 0
  );

  console.log(`Gift cards scanned: ${cards.length}`);
  console.log(`Amount-specific cards: ${targets.length}`);
  console.log("");

  const report: any[] = [];

  for (const card of targets) {
    const detected = parseAmounts(`${card.title} ${card.merchant.name}`);
    const proposedMerchant = cleanMerchantName(card.merchant.name, card.title);
    const proposedTitle = canonicalTitle(proposedMerchant);
    const candidates = parentUrlCandidates(card.officialUrl);

    let bestParent: any = null;

    for (const candidate of candidates) {
      const check = await checkCandidate(candidate);
      if (check.ok && (!bestParent || check.score > bestParent.score)) {
        bestParent = { url: candidate, ...check };
      }
    }

    const shouldChangeMerchant = proposedMerchant !== card.merchant.name;
    const shouldChangeTitle =
      parseAmounts(card.title).length > 0 ||
      card.title.toLowerCase() !== proposedTitle.toLowerCase();

    console.log(`MERCHANT: ${card.merchant.name}`);
    console.log(`CARD: ${card.title}`);
    console.log(`VALUES: ${detected.map((x) => `€${x}`).join(", ") || "—"}`);
    console.log(`PROPOSED MERCHANT: ${proposedMerchant}`);
    console.log(`PROPOSED TITLE: ${proposedTitle}`);
    console.log(`CURRENT URL: ${card.officialUrl || "—"}`);
    console.log(
      `GENERAL URL CANDIDATE: ${
        bestParent
          ? `${bestParent.url} (score=${bestParent.score}, giftLinks=${bestParent.giftLinksFound})`
          : "—"
      }`
    );
    console.log(`EXISTING VARIANTS: ${card.variants.length}`);
    console.log("");

    report.push({
      cardId: card.id,
      merchantId: card.merchant.id,
      currentMerchantName: card.merchant.name,
      proposedMerchantName: proposedMerchant,
      merchantNameNeedsCleanup: shouldChangeMerchant,
      currentTitle: card.title,
      proposedTitle,
      titleNeedsCleanup: shouldChangeTitle,
      detectedValues: detected,
      currentOfficialUrl: card.officialUrl,
      bestGeneralUrlCandidate: bestParent,
      existingVariants: card.variants,
    });
  }

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, "canonical-giftcard-audit-v4.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scanned: cards.length,
        amountSpecificCards: targets.length,
        records: report,
      },
      null,
      2
    )
  );

  console.log(`Report written: ${outFile}`);
  console.log("AUDIT ONLY — no database changes were made.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
