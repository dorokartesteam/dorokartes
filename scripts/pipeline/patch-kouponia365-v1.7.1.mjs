import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-kouponia365.ts";
let s = fs.readFileSync(file, "utf8");

const start = s.indexOf("function cleanMerchant(title: string) {");
const end = s.indexOf("\n}\n\nfunction detectDomains", start);

if (start < 0 || end < 0) {
  throw new Error("Could not locate cleanMerchant() in harvester v1.7.");
}

const replacement = `function cleanMerchant(title: string) {
  let s = title.trim();

  // Titles on Kouponia365 are highly regular. Prefer the brand/store text
  // before gift-card wording. If gift-card wording comes first, use the text
  // that follows it.
  const giftRe = /(δωροκάρτες?|δωροεπιταγές?|gift\\\\s*card)/i;
  const giftMatch = s.match(giftRe);

  if (giftMatch?.index !== undefined) {
    const before = s.slice(0, giftMatch.index).trim();
    const after = s.slice(giftMatch.index + giftMatch[0].length).trim();

    if (before) s = before;
    else if (after) s = after;
  }

  // Remove descriptive phrases that are not part of the merchant name.
  s = s
    .replace(/[:\\\\-–—]?\\\\s*το\\\\s+ιδανικό\\\\s+δώρο.*$/i, "")
    .replace(/[:\\\\-–—]?\\\\s*έξυπνο\\\\s+δώρο.*$/i, "")
    .replace(/[:\\\\-–—]?\\\\s*από\\\\s+\\\\d+\\\\s*€.*$/i, "")
    .replace(/[:\\\\-–—]?\\\\s*για\\\\s+κάθε\\\\s+περίσταση.*$/i, "")
    .replace(/[:\\\\-–—]?\\\\s*για\\\\s+άμεση\\\\s+αποστολή.*$/i, "")
    .replace(/\\\\s+/g, " ")
    .trim()
    .replace(/^[\\\\s:;,.!\\\\-–—]+|[\\\\s:;,.!\\\\-–—]+$/g, "");

  // A few source-specific title patterns.
  s = s
    .replace(/^Εκδόσεις\\\\s+/i, "Εκδόσεις ")
    .replace(/^iQueens[:\\\\s]*/i, "iQueens")
    .trim();

  return s;
}`;

s = s.slice(0, start) + replacement + s.slice(end + 2);

// Banner bump.
s = s.replace(
  "Dorokartes Kouponia365 Gift-Card Harvester v1.7",
  "Dorokartes Kouponia365 Gift-Card Harvester v1.7.1",
);

fs.writeFileSync(file, s);

console.log("Applied Kouponia365 v1.7.1 merchant-name cleanup");
