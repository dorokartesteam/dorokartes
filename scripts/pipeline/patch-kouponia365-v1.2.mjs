import fs from "node:fs";

const file = "scripts/pipeline/admin/harvest-kouponia365.ts";
let s = fs.readFileSync(file, "utf8");

const startMarker = `    const rows: HarvestRow[] = [];`;
const endMarker = `    const dedup = new Map<string, HarvestRow>();`;

const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);

if (start < 0 || end < 0 || end <= start) {
  throw new Error("Could not locate Kouponia365 rows extraction block.");
}

const replacement = `
    const rows: HarvestRow[] = [];

    function decodeRedirectTarget(candidate: string) {
      try {
        const u = new URL(candidate, BASE);

        for (const key of [
          "url",
          "u",
          "target",
          "redirect",
          "redirect_url",
          "destination",
          "dest",
          "goto",
          "out",
          "link",
        ]) {
          const value = u.searchParams.get(key);
          if (!value) continue;

          try {
            const decoded = decodeURIComponent(value);
            const nested = new URL(decoded, BASE);
            if (!looksSocialOrInternal(nested.toString())) {
              return nested.toString();
            }
          } catch {}
        }

        return u.toString();
      } catch {
        return "";
      }
    }

    const diagnostics: Array<{
      index: number;
      tag: string;
      className: string;
      text: string;
      hrefs: string;
      dataUrls: string;
    }> = [];

    for (let i = 0; i < count; i++) {
      const c = containers.nth(i);
      const text = normalizeText(await c.textContent());
      if (!text) continue;

      const tag = await c.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
      const className = (await c.getAttribute("class")) || "";

      let title = "";
      const heading = c.locator("h1,h2,h3,h4,h5,.title,[class*='title']").first();

      if ((await heading.count()) > 0) {
        title = normalizeText(await heading.textContent());
      }

      if (!title) {
        const strong = c.locator("strong,b").first();
        if ((await strong.count()) > 0) {
          title = normalizeText(await strong.textContent());
        }
      }

      if (!title) {
        title = text.slice(0, 180);
      }

      const candidates: string[] = [];

      // Normal anchors.
      const links = c.locator("a[href]");
      const linkCount = await links.count();

      for (let j = 0; j < Math.min(linkCount, 80); j++) {
        const hrefRaw = await links.nth(j).getAttribute("href");
        if (!hrefRaw) continue;

        try {
          const absolute = new URL(hrefRaw, BASE).toString();
          candidates.push(absolute);
        } catch {}
      }

      // Coupon themes often store destinations in data-* attributes rather than href.
      const attrNodes = c.locator(
        "[data-url],[data-href],[data-link],[data-target-url],[data-redirect],[data-destination],[onclick]"
      );
      const attrCount = await attrNodes.count();

      for (let j = 0; j < Math.min(attrCount, 80); j++) {
        const node = attrNodes.nth(j);

        for (const attr of [
          "data-url",
          "data-href",
          "data-link",
          "data-target-url",
          "data-redirect",
          "data-destination",
        ]) {
          const value = await node.getAttribute(attr);
          if (!value) continue;

          try {
            candidates.push(new URL(value, BASE).toString());
          } catch {}
        }

        const onclick = await node.getAttribute("onclick");
        if (onclick) {
          const matches = onclick.match(/https?:\\\\/\\\\/[^'"\\\\s)]+/g) || [];
          candidates.push(...matches);
        }
      }

      const uniqueCandidates = [...new Set(candidates)];

      let listingUrl = "";
      let outboundUrl = "";

      // Prefer a true external merchant URL if the card exposes one directly.
      for (const candidate of uniqueCandidates) {
        const decoded = decodeRedirectTarget(candidate);

        if (decoded && !looksSocialOrInternal(decoded)) {
          outboundUrl = decoded;
          break;
        }
      }

      // Otherwise keep a Kouponia365 internal URL for provenance / possible later drill-down.
      for (const candidate of uniqueCandidates) {
        try {
          const u = new URL(candidate);
          const host = u.hostname.toLowerCase();

          if (
            (host === "kouponia365.gr" || host.endsWith(".kouponia365.gr")) &&
            candidate !== BASE &&
            !candidate.includes("/kouponia-katigories/") &&
            !candidate.includes("/category/") &&
            !candidate.includes("/tag/")
          ) {
            listingUrl = candidate;
            break;
          }
        } catch {}
      }

      let merchantName = "";

      const merchantEl = c.locator(
        ".merchant,.store,.brand,[class*='merchant'],[class*='store'],[class*='brand'],[class*='shop']"
      ).first();

      if ((await merchantEl.count()) > 0) {
        merchantName = normalizeText(await merchantEl.textContent());
      }

      if (!merchantName && outboundUrl) {
        merchantName = domainOf(outboundUrl)
          .replace(/\\\\.(gr|com|eu|net|org|shop|store)$/i, "")
          .replace(/[-_]+/g, " ");
      }

      const codeMatch =
        text.match(/(?:κωδικός|code)\\\\s*[:\\\\-]?\\\\s*([A-Z0-9_-]{3,30})/i);

      diagnostics.push({
        index: i + 1,
        tag,
        className,
        text: text.slice(0, 500),
        hrefs: uniqueCandidates.slice(0, 20).join(" | "),
        dataUrls: uniqueCandidates
          .filter((x) => !x.includes("kouponia365.gr"))
          .slice(0, 20)
          .join(" | "),
      });

      // Because this page itself is the gift-card category, each actual coupon/content
      // block is useful even when it has no detail URL. Keep it as aggregator evidence.
      rows.push({
        title,
        merchantName,
        listingUrl,
        outboundUrl,
        registeredDomain: domainOf(outboundUrl),
        codeText: codeMatch?.[1] ?? "",
        description: text.slice(0, 800),
      });
    }

    const diagnosticsCsv = path.join(
      OUT_DIR,
      "kouponia365-debug-blocks.csv",
    );

    writeCsv(
      diagnosticsCsv,
      diagnostics as any,
      ["index", "tag", "className", "text", "hrefs", "dataUrls"],
    );

    console.log(\`Kouponia365 content blocks parsed: \${rows.length}\`);
    console.log(
      \`Blocks with internal listing URL: \${rows.filter((x) => x.listingUrl).length}\`
    );
    console.log(
      \`Blocks with external URL: \${rows.filter((x) => x.outboundUrl).length}\`
    );
    console.log(\`Debug blocks CSV: \${diagnosticsCsv}\`);

`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);

console.log("Kouponia365 harvester v1.2 patch applied.");
console.log("- parses every category content block directly");
console.log("- inspects href/data-url/data-href/onclick");
console.log("- writes kouponia365-debug-blocks.csv for exact DOM diagnostics");
