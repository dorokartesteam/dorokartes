import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-kouponia365.ts";
let s = fs.readFileSync(file, "utf8");

// 1) Fix duplicate toggleText_* IDs by scoping lookup to the current card first.
const oldExtract = `  const target = page.locator(\`#\${targetId}\`);
  if ((await target.count()) === 0) return { targetId, hiddenText: "" };

  return {
    targetId,
    hiddenText: norm(await target.textContent()),
  };`;

const newExtract = `  // Kouponia365 can render duplicate id="toggleText_*" values on the same
  // document. Scope the lookup to the current card first, then fall back to
  // the first page-level match. Never use a strict multi-match locator.
  let target = card.locator(\`[id="\${targetId}"]\`).first();

  if ((await target.count()) === 0) {
    target = page.locator(\`[id="\${targetId}"]\`).first();
  }

  if ((await target.count()) === 0) {
    return { targetId, hiddenText: "" };
  }

  return {
    targetId,
    hiddenText: norm(await target.textContent()),
  };`;

if (!s.includes(oldExtract)) {
  throw new Error("Could not locate extractHidden target block.");
}
s = s.replace(oldExtract, newExtract);

// 2) Add a page-level gift-card relevance validator.
const marker = `async function pageCandidates(page: Page) {`;
const validator = `
function hasGiftCardSignal(value: string) {
  const v = value.toLocaleLowerCase("el-GR");
  return (
    v.includes("δωροκάρτ") ||
    v.includes("δωροεπιταγ") ||
    v.includes("gift card") ||
    v.includes("giftcard") ||
    v.includes("gift voucher")
  );
}

async function categoryPageLooksValid(page: Page) {
  const statuses = page.locator(".coupon-status");
  const count = await statuses.count();

  if (count === 0) return false;

  let checked = 0;
  let giftLike = 0;

  for (let i = 0; i < Math.min(count, 12); i++) {
    const status = statuses.nth(i);
    const card = await findCard(status);
    const title = await extractTitle(card);
    const hidden = await extractHidden(card, page);
    const evidence = \`\${title} \${hidden.hiddenText}\`;

    checked++;
    if (hasGiftCardSignal(evidence)) giftLike++;
  }

  if (checked === 0) return false;

  // Require a majority of sampled cards to actually be gift-card content.
  // This prevents WordPress soft-fallback pages (generic coupon archives)
  // from being mistaken for page 4+ of the gift-card category.
  return giftLike / checked >= 0.6;
}

`;
if (!s.includes(marker)) {
  throw new Error("Could not locate pageCandidates marker.");
}
s = s.replace(marker, validator + marker);

// 3) Tighten openNextPage: validate that the candidate is really still the gift-card category.
const oldOpenBlock = `    const count = await page.locator(".coupon-status").count();

    if (count > 0) {
      return normalized;
    }`;

const newOpenBlock = `    const count = await page.locator(".coupon-status").count();

    if (count > 0) {
      const validCategoryPage = await categoryPageLooksValid(page);

      if (validCategoryPage) {
        return normalized;
      }

      console.log(
        \`Rejected pagination candidate (not gift-card category content): \${normalized}\`,
      );
    }`;

if (!s.includes(oldOpenBlock)) {
  throw new Error("Could not locate openNextPage validation block.");
}
s = s.replace(oldOpenBlock, newOpenBlock);

// 4) Prevent invalid page rows from being committed if the current page itself is off-category.
// Insert validation at top of each loop, before parsing.
const loopMarker = `      console.log("");
      console.log(\`[PAGE \${pageNo}] \${normalizedSource}\`);

      await page.waitForTimeout(700);

      const statuses = page.locator(".coupon-status");`;

const loopReplacement = `      console.log("");
      console.log(\`[PAGE \${pageNo}] \${normalizedSource}\`);

      await page.waitForTimeout(700);

      const validCurrentPage = await categoryPageLooksValid(page);

      if (!validCurrentPage) {
        console.log(
          \`[PAGE \${pageNo}] rejected: content is not predominantly gift-card listings.\`,
        );
        break;
      }

      const statuses = page.locator(".coupon-status");`;

if (!s.includes(loopMarker)) {
  throw new Error("Could not locate page loop block.");
}
s = s.replace(loopMarker, loopReplacement);

// 5) Banner bump.
s = s.replace(
  "Dorokartes Kouponia365 Full-Category Harvester v1.9",
  "Dorokartes Kouponia365 Full-Category Harvester v1.9.1",
);

fs.writeFileSync(file, s);

console.log("Applied Kouponia365 full-category harvester v1.9.1");
console.log("- duplicate toggleText_* ids are scoped to the current card");
console.log("- generic coupon archive fallback pages are rejected");
console.log("- page 4+ will stop when content is no longer gift-card specific");
