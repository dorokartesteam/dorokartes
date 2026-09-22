import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";

type Target = {
  key: string;
  label: string;
  aliases: string[];
  domains: string[];
};

const TARGETS: Target[] = [
  { key: "nike", label: "Nike", aliases: ["Nike", "Nike Greece"], domains: ["nike.com"] },
  { key: "zara", label: "Zara", aliases: ["Zara", "Zara Greece"], domains: ["zara.com"] },
  { key: "hm", label: "H&M", aliases: ["H&M", "H&M Greece"], domains: ["hm.com"] },
  { key: "adidas", label: "adidas", aliases: ["adidas", "Adidas", "Adidas Greece"], domains: ["adidas.gr", "adidas.com"] },
  { key: "bershka", label: "Bershka", aliases: ["Bershka", "Bershka Greece"], domains: ["bershka.com"] },
  { key: "pullbear", label: "Pull&Bear", aliases: ["Pull & Bear", "Pull&Bear", "Pull&Bear Greece"], domains: ["pullandbear.com"] },
  { key: "stradivarius", label: "Stradivarius", aliases: ["Stradivarius", "Stradivarius Greece"], domains: ["stradivarius.com"] },
  { key: "oysho", label: "Oysho", aliases: ["Oysho", "Oysho Greece"], domains: ["oysho.com"] },
  { key: "massimodutti", label: "Massimo Dutti", aliases: ["Massimo Dutti", "Massimo Dutti Greece"], domains: ["massimodutti.com"] },
  { key: "zarahome", label: "Zara Home", aliases: ["Zara Home", "Zara Home Greece"], domains: ["zarahome.com"] },
  { key: "ikea", label: "IKEA", aliases: ["IKEA", "IKEA Greece"], domains: ["ikea.gr"] },
  { key: "playstation", label: "PlayStation", aliases: ["PlayStation", "PlayStation Greece", "Sony PlayStation"], domains: ["playstation.com"] },
  { key: "xbox", label: "Xbox", aliases: ["Xbox", "Xbox Greece"], domains: ["xbox.com"] },
  { key: "steam", label: "Steam", aliases: ["Steam"], domains: ["steampowered.com"] },
  { key: "netflix", label: "Netflix", aliases: ["Netflix"], domains: ["netflix.com"] },
  { key: "spotify", label: "Spotify", aliases: ["Spotify"], domains: ["spotify.com"] },
];

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9α-ω]+/gi, "")
    .trim();
}

function hostname(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function domainMatches(host: string | null, domains: string[]) {
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

async function main() {
  const merchants = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      websiteUrl: true,
      giftCards: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          verificationStatus: true,
          officialUrl: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = TARGETS.map((target) => {
    const aliasSet = new Set(target.aliases.map(normalizeName));

    const matches = merchants.filter((merchant) => {
      const exactName = aliasSet.has(normalizeName(merchant.name));
      const domainMatch = domainMatches(hostname(merchant.websiteUrl), target.domains);
      return exactName || domainMatch;
    });

    const cards = matches.flatMap((merchant) =>
      merchant.giftCards.map((card) => ({
        merchantId: merchant.id,
        merchantName: merchant.name,
        merchantSlug: merchant.slug,
        merchantStatus: merchant.status,
        merchantWebsiteUrl: merchant.websiteUrl,
        merchantHost: hostname(merchant.websiteUrl),
        cardId: card.id,
        cardTitle: card.title,
        cardSlug: card.slug,
        cardStatus: card.status,
        verificationStatus: card.verificationStatus,
        officialUrl: card.officialUrl,
        officialHost: hostname(card.officialUrl),
      })),
    );

    const activeCards = cards.filter((c) => c.cardStatus === "ACTIVE");

    let classification = "MISSING_MERCHANT";
    if (matches.length > 0) classification = "MERCHANT_ONLY";
    if (activeCards.length > 0) classification = "ACTIVE_CARD_PRESENT";
    if (activeCards.some((c) => c.verificationStatus === "VERIFIED")) {
      classification = "ACTIVE_VERIFIED_CARD_PRESENT";
    }

    return {
      key: target.key,
      brand: target.label,
      officialDomains: target.domains,
      classification,
      merchantMatches: matches.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        status: m.status,
        websiteUrl: m.websiteUrl,
        host: hostname(m.websiteUrl),
        giftCardCount: m.giftCards.length,
      })),
      cards,
      activeCards,
    };
  });

  const summary = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY",
    matcher: "EXACT_NORMALIZED_NAME_OR_OFFICIAL_DOMAIN",
    targets: rows.length,
    summary,
    rows,
  };

  const dir = path.join(process.cwd(), "reports", "postlaunch");
  fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, "major-brand-coverage-v2.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("Dorokartes Major Brand Coverage v2 — READ ONLY");
  console.log("Matcher: exact normalized merchant name OR official domain");
  console.log("============================================================");

  for (const row of rows) {
    const merchantNames = row.merchantMatches
      .map((m) => `${m.name} (${m.host ?? "no-domain"})`)
      .join(", ") || "-";

    const cardText = row.activeCards
      .map((c) => `${c.cardTitle} [${c.verificationStatus}]`)
      .join(" | ") || "-";

    console.log(`${row.brand.padEnd(16)} ${row.classification}`);
    console.log(`  merchants: ${merchantNames}`);
    console.log(`  active cards: ${cardText}`);
  }

  console.log("============================================================");
  console.log(summary);
  console.log(`JSON: ${jsonPath}`);
  console.log("READ ONLY — database unchanged.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
