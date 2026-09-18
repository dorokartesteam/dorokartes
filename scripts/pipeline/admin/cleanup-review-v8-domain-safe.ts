import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function host(raw?: string | null) {
  if (!raw) return null;
  try { return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase(); }
  catch { return null; }
}

function domainBrand(raw?: string | null) {
  const h = host(raw);
  if (!h) return null;

  const parts = h.split(".");
  const rawLabel = parts.length >= 2 ? parts[parts.length - 2] : parts[0];

  const known: Record<string,string> = {
    carrotstore: "Carrot Store",
    luckyboutique: "Lucky Boutique",
    waragod: "WARAGOD",
    zador: "Zador",
    hobbywood: "Hobbywood",
  };

  return known[rawLabel] || rawLabel
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, m => m.toUpperCase())
    .trim();
}

function hasAmount(s: string) {
  return /(?:€|eur(?:o)?s?|euro)\s*\d|\d+(?:[.,]\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)/i.test(s);
}

function looksGenericOrPolluted(s: string) {
  const n = norm(s);
  if (!n) return true;
  if (hasAmount(s)) return true;
  if (/^(gift|gift card|gift voucher|voucher|δωροκαρτα|δωροκάρτα|δωροεπιταγη|δωροεπιταγή|digital gift card)$/i.test(n)) return true;
  if (/\b(?:gift card|gift voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\b/i.test(s) && n.split(" ").length <= 4) return true;
  if (/\bдруги\b/i.test(s)) return true;
  return false;
}

function titleSupportsBrand(title: string, brand: string) {
  const t = norm(title);
  const b = norm(brand);
  if (t.includes(b)) return true;

  // domain-derived brands may include spacing absent from source title
  const compactTitle = t.replace(/[^a-z0-9α-ω]/gi, "");
  const compactBrand = b.replace(/[^a-z0-9α-ω]/gi, "");
  return compactBrand.length >= 4 && compactTitle.includes(compactBrand);
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: { in: ["ACTIVE","DRAFT","HIDDEN"] } },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      officialUrl: true,
      merchant: {
        select: {
          id: true,
          name: true,
          websiteUrl: true,
        },
      },
    },
  });

  let safe = 0, review = 0, merchantUpdates = 0, titleUpdates = 0;

  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}\n`);

  for (const card of cards) {
    if (!hasAmount(`${card.merchant.name} ${card.title}`)) continue;
    if (!looksGenericOrPolluted(card.merchant.name)) continue;

    const brand =
      domainBrand(card.merchant.websiteUrl) ||
      domainBrand(card.officialUrl);

    if (!brand) {
      console.log(`REVIEW | ${card.merchant.name} | ${card.title} | reason=no-domain-brand`);
      review++;
      continue;
    }

    // For generic merchant names, domain ownership is enough to recover brand.
    // For partially polluted names, require the recovered brand to appear in title.
    const currentNorm = norm(card.merchant.name);
    const fullyGeneric =
      /^(gift|gift card|gift voucher|voucher|δωροκαρτα|δωροκάρτα|δωροεπιταγη|δωροεπιταγή)$/i.test(currentNorm) ||
      /^\d/.test(currentNorm);

    if (!fullyGeneric && !titleSupportsBrand(card.title, brand)) {
      console.log(`REVIEW | ${card.merchant.name} | ${card.title} | domainBrand=${brand} | reason=brand-not-supported-by-title`);
      review++;
      continue;
    }

    const newTitle = `${brand} Gift Card`;

    console.log(`SAFE | ${card.merchant.name} -> ${brand}`);
    console.log(`     CARD: ${card.title} -> ${newTitle}`);

    safe++;

    if (!APPLY) continue;

    if (card.merchant.name !== brand) {
      await prisma.merchant.update({
        where: { id: card.merchant.id },
        data: { name: brand },
      });
      merchantUpdates++;
    }

    if (card.title !== newTitle) {
      await prisma.giftCard.update({
        where: { id: card.id },
        data: { title: newTitle },
      });
      titleUpdates++;
    }
  }

  console.log("\nSummary");
  console.log(`Auto-safe: ${safe}`);
  console.log(`Manual review: ${review}`);

  if (APPLY) {
    console.log(`Merchant names updated: ${merchantUpdates}`);
    console.log(`Gift-card titles updated: ${titleUpdates}`);
  } else {
    console.log("PREVIEW ONLY — database unchanged.");
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
