import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../../lib/prisma";

type Issue =
  | "MERCHANT_NAME_POLLUTED"
  | "CARD_TITLE_POLLUTED"
  | "OFFICIAL_URL_TOO_SPECIFIC"
  | "OFFICIAL_URL_MISSING"
  | "POSSIBLE_DUPLICATE_PROGRAM"
  | "THIRD_PARTY_CARD"
  | "GENERIC_MERCHANT"
  | "CLEAN";

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function host(raw?: string | null) {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function hasMoney(s: string) {
  return /(?:€|eur(?:o)?s?|euro)\s*\d|\d+(?:[.,]\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)/i.test(s);
}

function genericMerchant(s: string) {
  const n = norm(s);
  if (!n || n.length < 3) return true;

  const exact = new Set([
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
  ]);

  if (exact.has(n)) return true;
  if (/^\d/.test(n)) return true;
  return false;
}

function merchantPolluted(s: string) {
  return hasMoney(s) ||
    /\b(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\b/i.test(s);
}

function titlePolluted(s: string) {
  return hasMoney(s) ||
    /(?:\|\s*https?:\/\/|::|gift\s*card\s*-\s*gift\s*card|gif?card_?\d+)/i.test(s);
}

function looksThirdParty(title: string, merchant: string) {
  const t = norm(title);
  const m = norm(merchant);

  const brands = [
    "nintendo", "playstation", "xbox", "steam", "roblox",
    "spotify", "netflix", "google play", "apple gift",
    "amazon gift", "paysafecard"
  ];

  return brands.some((b) => t.includes(b) && !m.includes(b));
}

function urlSpecificity(raw?: string | null) {
  if (!raw) return "missing";

  try {
    const u = new URL(raw);
    const p = decodeURIComponent(u.pathname).toLowerCase();

    if (
      /gift[-_\/ ]?(?:card|voucher)[-_\/ ]?\d+/i.test(p) ||
      /(?:dorokarta|δωροκαρτα|doroepitagi|voucher)[-_\/ ]?\d+/i.test(p) ||
      /(?:^|[-_/])\d+(?:[-_/]|$)/.test(p)
    ) {
      return "specific";
    }

    return "general";
  } catch {
    return "invalid";
  }
}

function canonicalUrlKey(raw?: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return null;
  }
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      verificationStatus: true,
      officialUrl: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
          logoUrl: true,
        },
      },
    },
  });

  const byMerchant = new Map<string, typeof cards>();
  const byDomain = new Map<string, typeof cards>();

  for (const c of cards) {
    const ma = byMerchant.get(c.merchant.id) || [];
    ma.push(c);
    byMerchant.set(c.merchant.id, ma);

    const d = host(c.merchant.websiteUrl) || host(c.officialUrl);
    if (d) {
      const da = byDomain.get(d) || [];
      da.push(c);
      byDomain.set(d, da);
    }
  }

  const rows: any[] = [];
  const counts: Record<Issue, number> = {
    MERCHANT_NAME_POLLUTED: 0,
    CARD_TITLE_POLLUTED: 0,
    OFFICIAL_URL_TOO_SPECIFIC: 0,
    OFFICIAL_URL_MISSING: 0,
    POSSIBLE_DUPLICATE_PROGRAM: 0,
    THIRD_PARTY_CARD: 0,
    GENERIC_MERCHANT: 0,
    CLEAN: 0,
  };

  for (const c of cards) {
    const issues: Issue[] = [];

    if (genericMerchant(c.merchant.name)) issues.push("GENERIC_MERCHANT");
    if (merchantPolluted(c.merchant.name)) issues.push("MERCHANT_NAME_POLLUTED");
    if (titlePolluted(c.title)) issues.push("CARD_TITLE_POLLUTED");
    if (looksThirdParty(c.title, c.merchant.name)) issues.push("THIRD_PARTY_CARD");

    const spec = urlSpecificity(c.officialUrl);
    if (spec === "missing") issues.push("OFFICIAL_URL_MISSING");
    if (spec === "specific") issues.push("OFFICIAL_URL_TOO_SPECIFIC");

    const sameMerchantCards = byMerchant.get(c.merchant.id) || [];
    const d = host(c.merchant.websiteUrl) || host(c.officialUrl);
    const sameDomainCards = d ? (byDomain.get(d) || []) : [];

    const possibleDup =
      sameMerchantCards.length > 1 ||
      sameDomainCards.filter((x) => x.id !== c.id).some((x) => {
        const a = canonicalUrlKey(x.officialUrl);
        const b = canonicalUrlKey(c.officialUrl);
        return x.merchant.id === c.merchant.id || (!!a && !!b && host(x.officialUrl) === host(c.officialUrl));
      });

    if (possibleDup) issues.push("POSSIBLE_DUPLICATE_PROGRAM");

    if (!issues.length) issues.push("CLEAN");

    for (const i of new Set(issues)) counts[i]++;

    rows.push({
      cardId: c.id,
      merchantId: c.merchant.id,
      merchantName: c.merchant.name,
      merchantWebsiteUrl: c.merchant.websiteUrl,
      merchantLogoUrl: c.merchant.logoUrl,
      title: c.title,
      slug: c.slug,
      status: c.status,
      verificationStatus: c.verificationStatus,
      officialUrl: c.officialUrl,
      domain: d,
      issues: [...new Set(issues)],
      sameMerchantCardCount: sameMerchantCards.length,
      sameDomainCardCount: sameDomainCards.length,
    });
  }

  console.log(`Gift cards scanned: ${cards.length}`);
  console.log("");
  console.log("=== FULL CATALOG ISSUE COUNTS ===");

  for (const [k, v] of Object.entries(counts)) {
    console.log(`${k}: ${v}`);
  }

  console.log("");

  const priority = rows
    .filter((r) => !r.issues.includes("CLEAN"))
    .sort((a, b) => b.issues.length - a.issues.length);

  console.log(`Cards needing some review: ${priority.length}`);
  console.log(`Clean cards: ${counts.CLEAN}`);

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "full-catalog-audit-v9.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalCards: cards.length,
        counts,
        rows,
      },
      null,
      2
    )
  );

  const headers = [
    "cardId","merchantId","merchantName","title","officialUrl","merchantWebsiteUrl",
    "status","verificationStatus","domain","issues","sameMerchantCardCount","sameDomainCardCount"
  ];

  const esc = (x: any) => `"${String(x ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => {
      if (h === "issues") return esc(r.issues.join("|"));
      return esc(r[h]);
    }).join(","))
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "full-catalog-audit-v9.csv"), csv);

  console.log("");
  console.log(`JSON report: ${path.join(outDir, "full-catalog-audit-v9.json")}`);
  console.log(`CSV report:  ${path.join(outDir, "full-catalog-audit-v9.csv")}`);
  console.log("AUDIT ONLY — database unchanged.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
