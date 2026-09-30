import fs from "node:fs/promises";
import path from "node:path";

const PAGE = path.resolve(process.cwd(), "app", "regions", "page.tsx");

function mustReplace(source: string, search: string | RegExp, replacement: string, label: string) {
  const next = source.replace(search as any, replacement);
  if (next === source) {
    throw new Error(`STOP: patch point not found: ${label}. File unchanged.`);
  }
  return next;
}

async function main() {
  let source = await fs.readFile(PAGE, "utf8");
  const original = source;

  // 1. Import canonical region helpers.
  source = mustReplace(
    source,
    'import { merchantPromotionRank } from "@/lib/public/merchant-entitlements";',
    'import { merchantPromotionRank } from "@/lib/public/merchant-entitlements";\nimport { getRegionOptions, regionLabelFromLocation, regionSlug } from "@/lib/regions/region-assignment";',
    "region helper import"
  );

  // 2. Change URL search param from raw city to canonical region slug.
  source = mustReplace(
    source,
    'searchParams: Promise<{ city?: string; q?: string; lat?: string; lng?: string }>;',
    'searchParams: Promise<{ region?: string; q?: string; lat?: string; lng?: string }>;',
    "searchParams type"
  );

  // 3. Load region choices.
  source = mustReplace(
    source,
    '  const hasUserLocation = userLat != null && userLng != null;\n  const allLocations = await prisma.merchantLocation.findMany({',
    '  const hasUserLocation = userLat != null && userLng != null;\n  const regionOptions = await getRegionOptions();\n  const allLocations = await prisma.merchantLocation.findMany({',
    "region options load"
  );

  // 4. Keep cityCounts for stats, but select canonical region instead of raw city.
  source = mustReplace(
    source,
    /  const selectedCity = params\.city && cityCounts\.some\(\(entry\) => entry\.city === params\.city\) \? params\.city : "";/,
    `  const selectedRegionSlug =
    params.region && regionOptions.some((entry) => entry.slug === params.region)
      ? params.region
      : "";
  const selectedRegion =
    regionOptions.find((entry) => entry.slug === selectedRegionSlug)?.label || "";`,
    "selected city -> region"
  );

  // 5. Filter locations using the exact same canonical mapping as the pills.
  source = mustReplace(
    source,
    '      if (selectedCity && location.city !== selectedCity) return false;',
    `      if (selectedRegionSlug) {
        const label = regionLabelFromLocation(location);
        if (!label || regionSlug(label) !== selectedRegionSlug) return false;
      }`,
    "location region filter"
  );

  // 6. Href now carries ?region=<canonical-slug>.
  source = mustReplace(
    source,
    '  const regionsHref = (city = "") => {\n    const next = new URLSearchParams();\n    if (city) next.set("city", city);',
    '  const regionsHref = (region = "") => {\n    const next = new URLSearchParams();\n    if (region) next.set("region", region);',
    "regionsHref"
  );

  // 7. Search form preserves selected region.
  source = mustReplace(
    source,
    '{selectedCity ? <input type="hidden" name="city" value={selectedCity} /> : null}',
    '{selectedRegionSlug ? <input type="hidden" name="region" value={selectedRegionSlug} /> : null}',
    "hidden region input"
  );

  // 8. Replace city pills with canonical region pills.
  source = mustReplace(
    source,
    `                className={!selectedCity ? "active" : ""}
                aria-current={!selectedCity ? "page" : undefined}`,
    `                className={!selectedRegionSlug ? "active" : ""}
                aria-current={!selectedRegionSlug ? "page" : undefined}`,
    "all-regions active state"
  );

  source = mustReplace(
    source,
    /\{cityCounts\.map\(\(entry\) => \{\s*const active = selectedCity === entry\.city;\s*return \(\s*<Link\s*prefetch=\{false\}\s*className=\{active \? "active" : ""\}\s*aria-current=\{active \? "page" : undefined\}\s*href=\{regionsHref\(entry\.city\)\}\s*key=\{entry\.city\}\s*>\s*\{entry\.city\} <span>\{entry\.count\}<\/span>\s*<\/Link>\s*\);\s*\}\)\}/m,
    `{regionOptions.map((entry) => {
                const active = selectedRegionSlug === entry.slug;
                return (
                  <Link
                    prefetch={false}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                    href={regionsHref(entry.slug)}
                    key={entry.slug}
                  >
                    {entry.label} <span>{entry.count}</span>
                  </Link>
                );
              })}`,
    "region pills"
  );

  // 9. Result heading/clear filter state.
  source = mustReplace(
    source,
    'selectedCity ? `',
    'selectedRegion ? `',
    "selected heading conditional"
  );

  source = mustReplace(
    source,
    '${selectedCity}`',
    '${selectedRegion}`',
    "selected heading label"
  );

  source = mustReplace(
    source,
    '{(selectedCity || query || hasUserLocation) ? <Link href="/regions">',
    '{(selectedRegionSlug || query || hasUserLocation) ? <Link href="/regions">',
    "clear filters condition"
  );

  if (source.includes("selectedCity") || source.includes('name="city"')) {
    throw new Error("STOP: selectedCity/city query references remain. File unchanged.");
  }

  const backup = PAGE + ".before-region-ui-v1";
  await fs.writeFile(backup, original, "utf8");
  await fs.writeFile(PAGE, source, "utf8");

  console.log("PASS: /regions UI patched.");
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), PAGE));
  console.log("");
  console.log("NEXT:");
  console.log("  npx tsc --noEmit");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
