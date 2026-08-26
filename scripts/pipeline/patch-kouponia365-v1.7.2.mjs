import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-kouponia365.ts";
let s = fs.readFileSync(file, "utf8");

const start = s.indexOf("function cleanMerchant(title: string) {");
const end = s.indexOf("\n}\n\nfunction detectDomains", start);

if (start < 0 || end < 0) {
  throw new Error("Could not locate cleanMerchant() in Kouponia365 harvester.");
}

const replacement = `function cleanMerchant(title: string) {
  const original = title.replace(/\\\\s+/g, " ").trim();
  const lower = original.toLocaleLowerCase("el-GR");

  const giftTokens = [
    "δωροκάρτα",
    "δωροκάρτες",
    "δωροεπιταγή",
    "δωροεπιταγές",
    "gift card",
  ];

  let firstIndex = -1;
  let matchedToken = "";

  for (const token of giftTokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0 && (firstIndex < 0 || idx < firstIndex)) {
      firstIndex = idx;
      matchedToken = token;
    }
  }

  let merchant = original;

  if (firstIndex === 0) {
    // "Δωροκάρτα Camper" -> "Camper"
    merchant = original.slice(matchedToken.length).trim();
  } else if (firstIndex > 0) {
    // "Sneaker10 Δωροκάρτα" -> "Sneaker10"
    merchant = original.slice(0, firstIndex).trim();
  }

  // Remove descriptive phrases that may remain when no gift token is present
  // before the brand wording.
  const noiseMarkers = [
    " έξυπνο δώρο",
    ": το ιδανικό δώρο",
    " – το ιδανικό δώρο",
    " - το ιδανικό δώρο",
    " — το ιδανικό δώρο",
    " το ιδανικό δώρο",
  ];

  const merchantLower = merchant.toLocaleLowerCase("el-GR");

  for (const marker of noiseMarkers) {
    const idx = merchantLower.indexOf(marker);
    if (idx > 0) {
      merchant = merchant.slice(0, idx).trim();
      break;
    }
  }

  // Source-specific normalization where the title starts with "Εκδόσεις".
  merchant = merchant
    .replace(/\\\\s+/g, " ")
    .trim()
    .replace(/^[\\\\s:;,.!\\\\-–—]+/, "")
    .replace(/[\\\\s:;,.!\\\\-–—]+$/, "");

  return merchant;
}`;

s = s.slice(0, start) + replacement + s.slice(end + 2);

s = s.replace(
  "Dorokartes Kouponia365 Gift-Card Harvester v1.7.1",
  "Dorokartes Kouponia365 Gift-Card Harvester v1.7.2",
);
s = s.replace(
  "Dorokartes Kouponia365 Gift-Card Harvester v1.7",
  "Dorokartes Kouponia365 Gift-Card Harvester v1.7.2",
);

fs.writeFileSync(file, s);

console.log("Applied Kouponia365 v1.7.2 merchant parser fix");
console.log("Expected examples:");
console.log("  Δωροκάρτα Camper -> Camper");
console.log("  Εκδόσεις Ψυχογιός δωροκάρτα -> Εκδόσεις Ψυχογιός");
console.log("  iQueens: Το Ιδανικό Δώρο!... -> iQueens");
console.log("  Big Shoes Έξυπνο Δώρο Παπούτσια -> Big Shoes");
console.log("  Pharm24 Δωροκάρτα Δωροεπιταγή Gift Card -> Pharm24");
