import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-kouponia365.ts";
let s = fs.readFileSync(file, "utf8");

// 1) Never turn javascript: URLs into outbound URLs.
const oldAbsolute = `function absoluteUrl(raw: string, base: string) {
  try {
    return new URL(raw, base).toString();
  } catch {
    return "";
  }
}`;

const newAbsolute = `function absoluteUrl(raw: string, base: string) {
  try {
    const u = new URL(raw, base);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}`;

if (s.includes(oldAbsolute)) {
  s = s.replace(oldAbsolute, newAbsolute);
} else if (!s.includes('if (!["http:", "https:"].includes(u.protocol))')) {
  throw new Error("Could not patch absoluteUrl().");
}

// 2) Add title -> merchant cleanup and toggle target helpers before findMerchantName().
const helperMarker = `async function findMerchantName(container: Locator) {`;

const helpers = `function merchantFromCouponTitle(title: string) {
  return title
    .replace(/\\bδωροκάρτα\\b/gi, "")
    .replace(/\\bδωροεπιταγ(?:ή|ές)\\b/gi, "")
    .replace(/\\bgift\\s*card\\b/gi, "")
    .replace(/\\bτο\\s+ιδανικό\\s+δώρο.*$/i, "")
    .replace(/\\bέξυπνο\\s+δώρο.*$/i, "")
    .replace(/[–—-]\\s*το\\s+ιδανικό.*$/i, "")
    .replace(/\\s+/g, " ")
    .trim()
    .replace(/[,:;.!]+$/g, "");
}

function parseToggleTarget(href: string) {
  const match = href.match(/toggle\\(['\"]([^'\"]+)['\"]\\)/i);
  return match?.[1] ?? "";
}

async function resolveToggleTarget(page: Page, card: Locator) {
  const toggles = card.locator('a[href*="javascript:toggle"],a[href*="toggleText_"]');
  const count = await toggles.count();

  for (let i = 0; i < count; i++) {
    const href = (await toggles.nth(i).getAttribute("href")) || "";
    const targetId = parseToggleTarget(href);
    if (!targetId) continue;

    const target = page.locator(\`#\${targetId}\`);
    if ((await target.count()) === 0) continue;

    const hiddenText = normalizeText(await target.textContent());
    const externalLinks = await collectUrls(target, BASE);
    const outbound = chooseDirectExternal(externalLinks);

    return { targetId, hiddenText, outbound };
  }

  return { targetId: "", hiddenText: "", outbound: "" };
}

`;

if (!s.includes("function merchantFromCouponTitle")) {
  const idx = s.indexOf(helperMarker);
  if (idx < 0) throw new Error("Could not find findMerchantName().");
  s = s.slice(0, idx) + helpers + s.slice(idx);
}

// 3) Replace the outbound resolution block with toggle-aware logic.
const oldResolve = `      const title = await findTitle(card, text);
      const candidates = await collectUrls(card, BASE);

      const listingUrl = chooseInternalListing(candidates);
      let outboundUrl = chooseDirectExternal(candidates);

      if (!outboundUrl && listingUrl) {
        outboundUrl = await extractExternalFromDetail(context, listingUrl);
      }

      const merchantFromDom = await findMerchantName(card);
      const merchantName =
        merchantFromDom ||
        (outboundUrl ? merchantFromDomain(outboundUrl) : "");`;

const newResolve = `      const title = await findTitle(card, text);
      const candidates = await collectUrls(card, BASE);
      const toggle = await resolveToggleTarget(page, card);

      const listingUrl = chooseInternalListing(candidates);
      let outboundUrl = toggle.outbound || chooseDirectExternal(candidates);

      if (!outboundUrl && listingUrl) {
        outboundUrl = await extractExternalFromDetail(context, listingUrl);
      }

      const merchantFromDom = await findMerchantName(card);
      const merchantName =
        merchantFromCouponTitle(title) ||
        merchantFromDom ||
        (outboundUrl ? merchantFromDomain(outboundUrl) : "");`;

if (s.includes(oldResolve)) {
  s = s.replace(oldResolve, newResolve);
} else if (!s.includes("const toggle = await resolveToggleTarget(page, card);")) {
  throw new Error("Could not patch card resolution block.");
}

// 4) Include hidden toggle text when looking for visible coupon codes/evidence.
const oldCode = `      const codeMatch = text.match(
        /(?:κωδικός|code)\\s*[:\\-]?\\s*([A-Z0-9_-]{3,30})/i,
      );`;

const newCode = `      const evidenceText = \`${'${toggle.hiddenText}'} ${'${text}'}\`;
      const codeMatch = evidenceText.match(
        /(?:κωδικός|code)\\s*[:\\-]?\\s*([A-Z0-9_-]{3,30})/i,
      );`;

if (s.includes(oldCode)) s = s.replace(oldCode, newCode);

// 5) Keep the richer evidence in the CSV/DB notes.
const oldDescription = `        description: text.slice(0, 800),`;
const newDescription = `        description: evidenceText.slice(0, 1000),`;
if (s.includes(oldDescription)) s = s.replace(oldDescription, newDescription);

fs.writeFileSync(file, s);

console.log("Kouponia365 harvester v1.5 patch applied.");
console.log("- javascript:toggle() is no longer treated as an outbound URL");
console.log("- toggleText_* hidden content is inspected for real HTTP(S) links");
console.log("- merchant names are derived from coupon titles, not CTA labels");
