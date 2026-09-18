import fs from "node:fs";

const file = "scripts/pipeline/admin/extract-bestprice-issuers.ts";

if (!fs.existsSync(file)) {
  throw new Error("Missing " + file + ". Install BestPrice issuer v3 first.");
}

let s = fs.readFileSync(file, "utf8");
fs.copyFileSync(file, file + ".backup-before-v3.1.1");

const start = s.indexOf("function firstExistingInput()");
const end = s.indexOf("\nfunction pick(", start);

if (start < 0 || end < 0) {
  throw new Error("Could not locate firstExistingInput() in extractor.");
}

const replacement = `
function inspectCsvCandidate(file: string) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\\\\uFEFF/, "");
    const matrix = parseCsv(raw);
    const headers = (matrix[0] ?? []).map((x) => x.trim().toLowerCase());
    const rows = Math.max(0, matrix.length - 1);
    const name = path.basename(file).toLowerCase();

    const hasProductishHeader = headers.some((h) =>
      [
        "title", "product_title", "product", "name", "listing_title",
        "card_title", "product_url", "bestprice_url", "listing_url",
        "source_url", "url"
      ].includes(h)
    );

    const hasSellerHeader = headers.some((h) =>
      ["seller", "seller_name", "merchant", "merchant_name", "shop", "shop_name"].includes(h)
    );

    let score = rows;

    if (hasProductishHeader) score += 500;
    if (hasSellerHeader) score += 100;

    if (/product|listing|giftcard|prepaid-card|item/i.test(name)) score += 300;
    if (/merchant|seller/i.test(name)) score -= 1000;

    return { file, rows, headers, score };
  } catch {
    return null;
  }
}

function firstExistingInput() {
  const dir = path.join(ROOT, "data", "discovery", "bestprice");
  if (!fs.existsSync(dir)) return null;

  const csvs = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(dir, f))
    .filter((p) => !p.endsWith("bestprice-inventory-v3.csv"))
    .filter((p) => !p.endsWith("bestprice-issuers-v3.csv"));

  const inspected = csvs
    .map(inspectCsvCandidate)
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.score - a.score || b.rows - a.rows);

  console.log("BestPrice CSV candidates:");
  for (const x of inspected) {
    console.log(
      "  rows=" +
        x.rows.toString().padStart(4) +
        " score=" +
        x.score.toString().padStart(5) +
        "  " +
        path.basename(x.file)
    );
  }
  console.log("");

  return inspected.find((x) => x.rows >= 100)?.file ?? inspected[0]?.file ?? null;
}
`;

s = s.slice(0, start) + replacement + s.slice(end);

s = s.replace(
  "Dorokartes BestPrice Inventory + Issuer Extractor v3",
  "Dorokartes BestPrice Inventory + Issuer Extractor v3.1.1"
);

fs.writeFileSync(file, s, "utf8");

console.log("Patched BestPrice issuer extractor to v3.1.1");
console.log("- fixed installer syntax error");
console.log("- auto-detects product/listing CSV by row count + headers");
console.log("- strongly penalizes merchant/seller summary CSVs");
console.log("- prints all BestPrice CSV candidates before choosing input");
console.log("- backup created: " + file + ".backup-before-v3.1.1");
