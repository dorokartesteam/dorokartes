import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-bestprice.ts";
let s = fs.readFileSync(file, "utf8");

const oldBadHosts = `      const badHosts = [
        "bestprice.gr",
        "facebook.com",
        "instagram.com",
        "linkedin.com",
        "youtube.com",
        "tiktok.com",
        "google.com",
      ];`;

const newBadHosts = `      const badHosts = [
        "bestprice.gr",
        "facebook.com",
        "instagram.com",
        "linkedin.com",
        "youtube.com",
        "tiktok.com",
        "twitter.com",
        "x.com",
        "pinterest.com",
        "pinterest.gr",
        "threads.net",
        "linktr.ee",
        "linktree.com",
        "google.com",
      ];`;

if (s.includes(oldBadHosts)) {
  s = s.replace(oldBadHosts, newBadHosts);
} else if (!s.includes('"pinterest.com"')) {
  throw new Error("Could not find badHosts block in harvest-bestprice.ts");
}

// Strengthen the external-link acceptance rule.
// We only accept a non-social external URL when the visible text or href clearly
// looks like the merchant's own website. This prevents social icon links from
// being picked as the official site.
const oldAccept = `        if (
          text.includes(host.replace(/^www\\./, "")) ||
          /\\.[a-z]{2,}$/i.test(text) ||
          text.includes("ιστοσελίδα") ||
          text.includes("website") ||
          text.includes("site") ||
          rel.includes("external")
        ) {
          return u.toString();
        }`;

const newAccept = `        const visibleDomain = host.replace(/^www\\./, "");
        const textLooksLikeDomain =
          text.includes(visibleDomain) ||
          /[a-z0-9-]+\\.(gr|com|eu|net|org|io|shop|store)$/i.test(text);

        const textLooksLikeWebsiteLabel =
          text === "website" ||
          text === "site" ||
          text === "ιστοσελίδα" ||
          text === "eshop" ||
          text === "e-shop";

        if (textLooksLikeDomain || textLooksLikeWebsiteLabel) {
          return u.toString();
        }`;

if (s.includes(oldAccept)) {
  s = s.replace(oldAccept, newAccept);
} else if (!s.includes("textLooksLikeWebsiteLabel")) {
  throw new Error("Could not find official-link acceptance block.");
}

// Add a post-resolution sanity filter in Node as a second line of defense.
const marker = `        merchant.officialMerchantUrl = official;
        merchant.registeredDomain = domainOf(official);`;

const replacement = `        const socialOrAggregatorHosts = [
          "twitter.com",
          "x.com",
          "pinterest.com",
          "pinterest.gr",
          "facebook.com",
          "instagram.com",
          "linkedin.com",
          "youtube.com",
          "tiktok.com",
          "threads.net",
          "linktr.ee",
          "linktree.com",
          "bestprice.gr",
        ];

        let safeOfficial = official;

        if (safeOfficial) {
          try {
            const host = new URL(safeOfficial).hostname.toLowerCase();
            if (
              socialOrAggregatorHosts.some(
                (x) => host === x || host.endsWith(\`.\${x}\`)
              )
            ) {
              safeOfficial = "";
            }
          } catch {
            safeOfficial = "";
          }
        }

        merchant.officialMerchantUrl = safeOfficial;
        merchant.registeredDomain = domainOf(safeOfficial);`;

if (s.includes(marker)) {
  s = s.replace(marker, replacement);
} else if (!s.includes("socialOrAggregatorHosts")) {
  throw new Error("Could not find merchant URL assignment block.");
}

fs.writeFileSync(file, s);
console.log("BestPrice harvester v2.3 patch applied.");
console.log("Blocked social/profile URLs from being treated as official merchant websites.");
