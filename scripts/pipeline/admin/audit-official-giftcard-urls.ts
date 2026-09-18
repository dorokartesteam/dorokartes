import { prisma } from "../../../lib/prisma";

function normalizeUrl(input?: string | null) {
  if (!input) return null;
  try {
    const u = new URL(input);
    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname}`;
  } catch {
    return input.trim().replace(/\/+$/, "");
  }
}

function isHomepage(url?: string | null) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, "");
    return p === "" || p === "/";
  } catch {
    return false;
  }
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    select: {
      id: true,
      title: true,
      officialUrl: true,
      merchant: {
        select: {
          name: true,
          websiteUrl: true,
        },
      },
    },
    orderBy: {
      merchant: {
        name: "asc",
      },
    },
  });

  const suspicious = cards.filter((card) => {
    const gift = normalizeUrl(card.officialUrl);
    const merchant = normalizeUrl(card.merchant?.websiteUrl);

    if (!gift) return true;
    if (merchant && gift === merchant) return true;
    if (isHomepage(card.officialUrl)) return true;

    return false;
  });

  console.log("");
  console.log("Dorokartes official gift-card URL audit");
  console.log("======================================");
  console.log(`Total gift cards: ${cards.length}`);
  console.log(`Suspicious officialUrl values: ${suspicious.length}`);
  console.log("");

  for (const card of suspicious) {
    console.log([
      card.merchant?.name || "",
      card.title || "",
      card.officialUrl || "(missing)",
      card.merchant?.websiteUrl || "(no merchant website)",
      card.id,
    ].join(" | "));
  }

  console.log("");
  console.log("Interpretation:");
  console.log("- If officialUrl equals merchant.websiteUrl, it is probably only the merchant homepage.");
  console.log("- Homepage officialUrl values should be manually checked for a dedicated gift-card page.");
  console.log("- This script DOES NOT modify the database.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
