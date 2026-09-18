import { prisma } from "../../../lib/prisma";

function host(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function amounts(value: string) {
  const out = new Set<number>();
  const s = value.replace(/,/g, ".");
  const patterns = [
    /(?:€|eur(?:o)?s?|euro)\s*(\d+(?:\.\d{1,2})?)/gi,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|eur(?:o)?s?|euro)/gi,
  ];
  for (const p of patterns) {
    for (const m of s.matchAll(p)) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out];
}

async function main() {
  const cards = await prisma.giftCard.findMany({
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
    },
  });

  console.log(`Total cards: ${cards.length}\n`);

  console.log("=== PETRIDIS-LIKE RECORDS ===");
  const petridis = cards.filter((c) =>
    `${c.title} ${c.slug} ${c.merchant.name} ${c.merchant.slug} ${c.officialUrl || ""} ${c.merchant.websiteUrl || ""}`
      .toLowerCase()
      .includes("petr")
  );

  for (const c of petridis) {
    console.log(JSON.stringify({
      cardId: c.id,
      title: c.title,
      cardSlug: c.slug,
      cardStatus: c.status,
      officialUrl: c.officialUrl,
      officialHost: host(c.officialUrl),
      merchantId: c.merchant.id,
      merchantName: c.merchant.name,
      merchantSlug: c.merchant.slug,
      merchantWebsiteUrl: c.merchant.websiteUrl,
      merchantHost: host(c.merchant.websiteUrl),
      detectedAmounts: amounts(`${c.title} ${c.merchant.name}`),
    }, null, 2));
  }

  console.log("\n=== RECORDS WITH DETECTED MONEY AMOUNTS ===");
  const withAmounts = cards.filter(
    (c) => amounts(`${c.title} ${c.merchant.name}`).length > 0
  );

  console.log(`Cards with detected amounts: ${withAmounts.length}`);

  for (const c of withAmounts.slice(0, 80)) {
    console.log(
      `${c.merchant.name} || ${c.title} || amounts=${amounts(`${c.title} ${c.merchant.name}`).join(",")} || merchantHost=${host(c.merchant.websiteUrl) || "-"} || officialHost=${host(c.officialUrl) || "-"}`
    );
  }

  console.log("\n=== REPEATED MERCHANT WEBSITE DOMAINS ===");
  const byDomain = new Map<string, typeof cards>();

  for (const c of cards) {
    const d = host(c.merchant.websiteUrl);
    if (!d) continue;
    const arr = byDomain.get(d) || [];
    arr.push(c);
    byDomain.set(d, arr);
  }

  const repeatedDomains = [...byDomain.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Repeated merchant domains: ${repeatedDomains.length}`);

  for (const [domain, arr] of repeatedDomains.slice(0, 60)) {
    console.log(`\nDOMAIN ${domain} (${arr.length})`);
    for (const c of arr.slice(0, 12)) {
      console.log(
        `  merchant="${c.merchant.name}" | title="${c.title}" | amounts=${amounts(`${c.title} ${c.merchant.name}`).join(",") || "-"}`
      );
    }
  }

  console.log("\nDIAGNOSTIC ONLY — no database changes.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
