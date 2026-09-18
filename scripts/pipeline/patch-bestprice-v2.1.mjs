import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-bestprice.ts";
let s = fs.readFileSync(file, "utf8");

const startMarker = `    const products = await page.evaluate(() => {`;
const endMarker = `    console.log(\`Browser harvested unique product rows: \${products.length}\`);`;

const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);

if (start < 0 || end < 0 || end <= start) {
  throw new Error("Could not locate browser extraction block in harvest-bestprice.ts");
}

const replacement = String.raw`    const products = await page.evaluate(\`
(() => {
  const clean = (input) =>
    (input || "").replace(/\\s+/g, " ").trim();

  const anchors = Array.from(
    document.querySelectorAll('a[href*="/to/"]')
  );

  const output = [];

  for (const productAnchor of anchors) {
    const href = productAnchor.href;
    const title = clean(productAnchor.textContent);

    if (!href || !title) continue;

    let container = productAnchor;

    for (let depth = 0; depth < 8 && container; depth++) {
      const merchantLink = container.querySelector('a[href*="/m/"]');

      if (merchantLink) {
        const merchantName = clean(merchantLink.textContent);
        const text = clean(container.textContent);
        const prices = text.match(/\\b\\d{1,4}(?:[.,]\\d{2})?\\s*€/g);

        output.push({
          title,
          priceText: prices?.[0] || "",
          merchantName,
          productUrl: href,
          merchantProfileUrl: merchantLink.href,
        });

        break;
      }

      container = container.parentElement;
    }
  }

  const dedup = new Map();

  for (const row of output) {
    if (!dedup.has(row.productUrl)) {
      dedup.set(row.productUrl, row);
    }
  }

  return [...dedup.values()];
})()
\`);

`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);
console.log("BestPrice harvester v2.1 patch applied.");
console.log("Fixed Playwright page.evaluate __name serialization bug.");
