import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((x) => x.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : undefined;

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

  return [...out].sort((a, b) => a - b);
}

function stripAmountFragments(value: string) {
  return normalize(value)
    .replace(/(?:€|eur(?:o)?s?|euro)\s*\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)/gi, " ")
    .replace(/[|–—]+/g, " ")
    .replace(/^\s*[-/]+\s*/g, "")
    .replace(/\s*[-/]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMerchantName(name: string) {
  return stripAmountFragments(name)
    .replace(/^\s*(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\s*/gi, "")
    .replace(/\s*(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\s*$/gi, "")
    .replace(/^\s*(?:αξίας|αξιας)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksGenericOrUnsafe(name: string) {
  const n = normalize(name).toLowerCase();

  if (!n || n.length < 3) return true;

  const generic = [
    "gift",
    "gift card",
    "gift voucher",
    "voucher",
    "δωροκαρτα",
    "δωροκάρτα",
    "δωροεπιταγη",
    "δωροεπιταγή",
    "digital gift card",
    "ηλεκτρονικη δωροκαρτα",
    "ηλεκτρονική δωροκάρτα",
    "card",
    "αξιας",
    "αξίας",
  ];

  if (generic.includes(n)) return true;

  if (/^\d/.test(n)) return true;
  if (/^[^a-zα-ωάέήίόύώϊϋΐΰ]+$/i.test(n)) return true;

  // Common garbage residues seen in the audit.
  if (/\b(?:αξιας|αξίας|απο|από|други)\b/i.test(n)) return true;

  return false;
}

function safeCanonicalMerchant(current: string) {
  const cleaned = cleanMerchantName(current);

  if (looksGenericOrUnsafe(cleaned)) return null;

  // Must actually remove amount/gift pollution or already be a clean merchant name.
  return cleaned;
}

function canonicalTitle(merchantName: string) {
  return `${merchantName} Gift Card`;
}

function normalizeUrlForCompare(raw?: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return null;
  }
}

function generalUrlCandidates(raw?: string | null) {
  if (!raw) return [];

  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";

    const parts = u.pathname.split("/").filter(Boolean);
    const out = new Set<string>();

    // Specific safe directory candidate only when the directory itself is gift-card specific.
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/(gift[-_ ]?(?:card|cards|voucher|vouchers)|voucher|δωρο|dwro)/i.test(parts[i])) {
        const candidate = new URL(u.toString());
        candidate.pathname = "/" + parts.slice(0, i + 1).join("/") + "/";
        out.add(candidate.toString());
        break;
      }
    }

    return [...out];
  } catch {
    return [];
  }
}

async function validateGeneralUrl(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DorokartesCanonicalCleanup/1.0; +https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!r.ok) return null;

    const type = (r.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("text/html")) return null;

    const html = (await r.text()).toLowerCase();

    const giftLinks = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .filter((x) => /gift|voucher|δωρο|dwro/i.test(x)).length;

    const hasGiftText =
      /gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτ|δωροκαρτ|δωροεπιταγ/.test(html);

    if (!hasGiftText || giftLinks < 2) return null;

    return {
      url: r.url,
      giftLinks,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: {
      status: { in: ["ACTIVE", "DRAFT", "HIDDEN"] },
    },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    ...(LIMIT ? { take: LIMIT } : {}),
    select: {
      id: true,
      title: true,
      officialUrl: true,
      merchant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const targets = cards.filter((c) =>
    parseAmounts(`${c.title} ${c.merchant.name}`).length > 0
  );

  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  console.log(`Gift cards scanned: ${cards.length}`);
  console.log(`Amount-specific cards: ${targets.length}`);
  console.log("");

  let safe = 0;
  let review = 0;
  let updatedCards = 0;
  let updatedMerchants = 0;
  let updatedUrls = 0;

  for (const card of targets) {
    const values = parseAmounts(`${card.title} ${card.merchant.name}`);
    const proposedMerchant = safeCanonicalMerchant(card.merchant.name);

    if (!proposedMerchant) {
      console.log(
        `REVIEW | ${card.merchant.name} | ${card.title} | values=${values.join(",")}`
      );
      review++;
      continue;
    }

    const proposedTitle = canonicalTitle(proposedMerchant);

    let proposedGeneralUrl: string | null = null;
    const currentNormalized = normalizeUrlForCompare(card.officialUrl);

    for (const candidate of generalUrlCandidates(card.officialUrl)) {
      const candidateNormalized = normalizeUrlForCompare(candidate);
      if (!candidateNormalized || candidateNormalized === currentNormalized) continue;

      const validated = await validateGeneralUrl(candidate);
      if (validated) {
        proposedGeneralUrl = validated.url;
        break;
      }
    }

    console.log(`SAFE | ${card.merchant.name} -> ${proposedMerchant}`);
    console.log(`     CARD: ${card.title} -> ${proposedTitle}`);
    console.log(`     VALUES: ${values.map((x) => `€${x}`).join(", ")}`);
    console.log(`     URL: ${card.officialUrl || "—"}${proposedGeneralUrl ? ` -> ${proposedGeneralUrl}` : ""}`);

    safe++;

    if (!APPLY) continue;

    if (proposedMerchant !== card.merchant.name) {
      await prisma.merchant.update({
        where: { id: card.merchant.id },
        data: { name: proposedMerchant },
      });
      updatedMerchants++;
    }

    const cardData: any = {};
    if (card.title !== proposedTitle) cardData.title = proposedTitle;
    if (proposedGeneralUrl) cardData.officialUrl = proposedGeneralUrl;

    if (Object.keys(cardData).length) {
      await prisma.giftCard.update({
        where: { id: card.id },
        data: cardData,
      });

      if (cardData.title) updatedCards++;
      if (cardData.officialUrl) updatedUrls++;
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`Safe: ${safe}`);
  console.log(`Manual review: ${review}`);

  if (APPLY) {
    console.log(`Merchant names updated: ${updatedMerchants}`);
    console.log(`Gift-card titles updated: ${updatedCards}`);
    console.log(`General official URLs updated: ${updatedUrls}`);
  } else {
    console.log("PREVIEW ONLY — database unchanged.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
