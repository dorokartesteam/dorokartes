import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");

const knownBad = [
  {
    id: "cmta1fsds003hq8iywvbrxbq7",
    merchant: "LIAKOPOULOS Brands Store",
    badUrl: "https://liakopoulos-store.gr/product/ck-jeans-350gsm-fleece-gift-giving-fz-hoo-%ce%bc%ce%b1%cf%85%cf%81%ce%bf/",
    restoreUrl: "https://www.liakopoulos-store.gr/"
  },
  {
    id: "cmtb7r2hm0006u8iyspxxt678",
    merchant: "Cla Chic",
    badUrl: "https://www.clachic.gr/en-gb/products/cluse-fluette-gift-box-cg11506-16317-3",
    restoreUrl: "https://www.clachic.gr/"
  },
  {
    id: "cmta1kptg00m8q8iyxikg29yq",
    merchant: "Hlcpro",
    badUrl: "https://hlcpro.gr/product/gift-card-expiry-extension/",
    restoreUrl: "https://hlcpro.gr/"
  },
  {
    id: "cmta1lwrt00qyq8iy0horqkam",
    merchant: "Lovefashionpoint",
    badUrl: "https://lovefashionpoint.gr/gift-card-balance/",
    restoreUrl: "https://lovefashionpoint.gr/"
  }
];

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  let matches = 0;

  for (const item of knownBad) {
    const card = await prisma.giftCard.findUnique({
      where: { id: item.id },
      include: { merchant: true }
    });

    if (!card) {
      console.log(`MISSING | ${item.merchant} | ${item.id}`);
      continue;
    }

    const current = card.officialUrl || "";
    const exactBad = current === item.badUrl;

    console.log(`${exactBad ? "MATCH" : "CHECK"} | ${item.merchant} | current=${current}`);

    if (!exactBad) continue;
    matches++;

    if (APPLY) {
      await prisma.giftCard.update({
        where: { id: item.id },
        data: {
          officialUrl: item.restoreUrl,
          verificationStatus: "NEEDS_REVIEW"
        }
      });
      console.log(`RESTORED | ${item.merchant} | ${item.restoreUrl}`);
    }
  }

  console.log(`Known bad matches: ${matches}`);
  if (!APPLY) console.log("PREVIEW ONLY — database unchanged.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
