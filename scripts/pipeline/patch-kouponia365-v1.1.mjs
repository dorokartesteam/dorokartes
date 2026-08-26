import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-kouponia365.ts";
let s = fs.readFileSync(file, "utf8");

// 1) Remove the per-card gift-signal requirement. The entire source page is already
// the Dorokartes category, so requiring each individual card to contain
// "δωροκάρτα" was filtering almost everything out.
const oldGiftFilter = `      const giftSignal =
        /δωροκάρτ|gift\\s*card|gift\\s*voucher|δωροεπιταγ|προπληρωμέν/i.test(text);

      if (!giftSignal) continue;
`;

if (s.includes(oldGiftFilter)) {
  s = s.replace(oldGiftFilter, "");
}

// 2) Category-page cards often point only to Kouponia365 detail pages.
// Replace the current extraction loop with a two-stage parser:
// category -> listing URLs -> listing detail -> external merchant URL.
const startMarker = `    const rows: HarvestRow[] = [];`;
const endMarker = `    // Fallback: if theme structure does not expose useful containers,`;

const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);

if (start < 0 || end < 0 || end <= start) {
  throw new Error("Could not locate Kouponia365 extraction block.");
}

const replacement = `
    const rows: HarvestRow[] = [];

    // Stage 1: collect Kouponia365 listing/detail links from the category cards.
    const listingCandidates = new Map<string, { title: string; description: string }>();

    for (let i = 0; i < count; i++) {
      const c = containers.nth(i);
      const text = normalizeText(await c.textContent());
      if (!text) continue;

      let title = "";
      const heading = c.locator("h1,h2,h3,h4,.title,[class*='title']").first();

      if ((await heading.count()) > 0) {
        title = normalizeText(await heading.textContent());
      }

      const links = c.locator("a[href]");
      const linkCount = await links.count();

      for (let j = 0; j < Math.min(linkCount, 50); j++) {
        const link = links.nth(j);
        const hrefRaw = await link.getAttribute("href");
        if (!hrefRaw) continue;

        let absolute = "";
        try {
          absolute = new URL(hrefRaw, BASE).toString();
        } catch {
          continue;
        }

        const u = new URL(absolute);

        if (
          u.hostname === "kouponia365.gr" ||
          u.hostname.endsWith(".kouponia365.gr")
        ) {
          // Skip category/navigation/self links.
          const normalized = absolute.replace(/#.*$/, "");
          if (
            normalized === BASE ||
            normalized.includes("/kouponia-katigories/") ||
            normalized.includes("/category/") ||
            normalized.includes("/tag/")
          ) {
            continue;
          }

          const linkText = normalizeText(await link.textContent());
          const effectiveTitle = title || linkText || text.slice(0, 180);

          if (!listingCandidates.has(normalized)) {
            listingCandidates.set(normalized, {
              title: effectiveTitle,
              description: text.slice(0, 800),
            });
          }
        }
      }
    }

    console.log(
      \`Kouponia365 listing/detail URLs found: \${listingCandidates.size}\`
    );

    // Stage 2: open each detail/listing page and extract the first plausible
    // external merchant destination. This is where coupon sites usually expose
    // "Visit shop / Get deal" links.
    let listingIndex = 0;

    for (const [listingUrl, seed] of listingCandidates) {
      listingIndex++;

      const detail = await context.newPage();

      try {
        const response = await detail.goto(listingUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        if (!response) continue;

        const status = response.status();

        if ([401, 403, 429].includes(status)) {
          console.log(
            \`[DETAIL \${listingIndex}/\${listingCandidates.size}] blocked HTTP \${status}: \${listingUrl}\`
          );
          continue;
        }

        await detail.waitForTimeout(500);

        let outboundUrl = "";
        let merchantName = "";

        const detailLinks = detail.locator("a[href]");
        const detailLinkCount = await detailLinks.count();

        for (let j = 0; j < Math.min(detailLinkCount, 250); j++) {
          const link = detailLinks.nth(j);
          const hrefRaw = await link.getAttribute("href");
          if (!hrefRaw) continue;

          let absolute = "";
          try {
            absolute = new URL(hrefRaw, listingUrl).toString();
          } catch {
            continue;
          }

          if (looksSocialOrInternal(absolute)) continue;

          const linkText = normalizeText(await link.textContent());

          // Prefer commercial CTA links, but accept a clean external merchant
          // website when there is only one.
          const cta =
            /αγόρασε|πάρε|δες προσφορά|επισκέψου|στο κατάστημα|shop|visit|deal|offer|get/i.test(
              linkText,
            );

          if (!outboundUrl || cta) {
            outboundUrl = absolute;

            if (
              linkText &&
              !/αγόρασε|πάρε|δες|προσφορά|επισκέψου|shop|visit|deal|offer|get/i.test(
                linkText,
              )
            ) {
              merchantName = linkText;
            }

            if (cta) break;
          }
        }

        if (!merchantName) {
          const merchantEl = detail
            .locator(
              ".merchant,.store,.brand,[class*='merchant'],[class*='store'],[class*='brand']",
            )
            .first();

          if ((await merchantEl.count()) > 0) {
            merchantName = normalizeText(await merchantEl.textContent());
          }
        }

        if (!merchantName && outboundUrl) {
          merchantName = domainOf(outboundUrl)
            .replace(/\\.(gr|com|eu|net|org|shop|store)$/i, "")
            .replace(/[-_]+/g, " ");
        }

        const bodyText = normalizeText(await detail.locator("body").textContent());
        const codeMatch =
          bodyText.match(/(?:κωδικός|code)\\s*[:\\-]?\\s*([A-Z0-9_-]{3,30})/i);

        rows.push({
          title: seed.title,
          merchantName,
          listingUrl,
          outboundUrl,
          registeredDomain: domainOf(outboundUrl),
          codeText: codeMatch?.[1] ?? "",
          description: bodyText.slice(0, 800) || seed.description,
        });

        console.log(
          \`[DETAIL \${listingIndex}/\${listingCandidates.size}] \${seed.title.slice(0, 70)} -> \${outboundUrl || "NO OUTBOUND"}\`
        );
      } catch (error) {
        console.log(
          \`[DETAIL \${listingIndex}/\${listingCandidates.size}] ERROR \${listingUrl}: \${error instanceof Error ? error.message : String(error)}\`
        );
      } finally {
        await detail.close();
      }

      await page.waitForTimeout(750);
    }

`;

s = s.slice(0, start) + replacement + s.slice(end);

// 3) Disable the old fallback when we successfully collected detail URLs;
// otherwise it can create one broad false row from the category itself.
s = s.replace(
  `    if (rows.length === 0) {`,
  `    if (rows.length === 0 && listingCandidates.size === 0) {`,
);

fs.writeFileSync(file, s);

console.log("Kouponia365 harvester v1.1 patch applied.");
console.log("- removed incorrect per-card gift keyword requirement");
console.log("- added category -> detail page -> external merchant extraction");
