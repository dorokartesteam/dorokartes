import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-bestprice.ts";
let s = fs.readFileSync(file, "utf8");

const startMarker = `    const products = await page.evaluate`;
const endMarker = `    console.log(\`Browser harvested unique product rows: \${products.length}\`);`;

const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);

if (start < 0 || end < 0 || end <= start) {
  throw new Error("Could not locate current product extraction block.");
}

const replacement = `
    const productLocator = page.locator('a[href*="/to/"]');
    const rawProducts: Array<{
      title: string;
      priceText: string;
      merchantName: string;
      productUrl: string;
      merchantProfileUrl: string;
    }> = [];

    const productCount = await productLocator.count();

    for (let i = 0; i < productCount; i++) {
      const productAnchor = productLocator.nth(i);

      const productUrl = (await productAnchor.getAttribute("href")) || "";
      const title = ((await productAnchor.textContent()) || "")
        .replace(/\\\\s+/g, " ")
        .trim();

      if (!productUrl || !title) continue;

      let merchantName = "";
      let merchantProfileUrl = "";
      let priceText = "";

      for (let depth = 1; depth <= 8; depth++) {
        const ancestor = productAnchor.locator("xpath=" + "/..".repeat(depth));

        if ((await ancestor.count()) === 0) continue;

        const merchant = ancestor.locator('a[href*="/m/"]').first();

        if ((await merchant.count()) > 0) {
          merchantName = ((await merchant.textContent()) || "")
            .replace(/\\\\s+/g, " ")
            .trim();

          merchantProfileUrl =
            (await merchant.getAttribute("href")) || "";

          const text = ((await ancestor.textContent()) || "")
            .replace(/\\\\s+/g, " ")
            .trim();

          const priceMatch =
            text.match(/\\\\b\\\\d{1,4}(?:[.,]\\\\d{2})?\\\\s*€/);

          priceText = priceMatch?.[0] || "";
          break;
        }
      }

      if (!merchantProfileUrl) continue;

      rawProducts.push({
        title,
        priceText,
        merchantName,
        productUrl: new URL(productUrl, BASE).toString(),
        merchantProfileUrl: new URL(
          merchantProfileUrl,
          BASE,
        ).toString(),
      });
    }

    const productMap = new Map<
      string,
      (typeof rawProducts)[number]
    >();

    for (const row of rawProducts) {
      if (!productMap.has(row.productUrl)) {
        productMap.set(row.productUrl, row);
      }
    }

    const products = [...productMap.values()];

`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);
console.log("BestPrice harvester v2.2 patch applied.");
console.log("Removed browser page.evaluate extraction entirely.");
console.log("Product parsing now runs through Playwright locators in Node.");
