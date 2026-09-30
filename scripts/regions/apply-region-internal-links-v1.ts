import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(process.cwd(), "app", "regions", "page.tsx");

async function main() {
  const source = await fs.readFile(FILE, "utf8");

  if (source.includes('aria-label="Σελίδες δωροκαρτών ανά περιοχή"')) {
    console.log("PASS: region internal links already present. No changes needed.");
    return;
  }

  const cityPillsStart = source.indexOf('<div className="dk28-city-pills">');
  if (cityPillsStart < 0) {
    throw new Error("STOP: dk28-city-pills block not found. File unchanged.");
  }

  const nextSection = source.indexOf(
    '<section className="dk28-location-results"',
    cityPillsStart
  );
  if (nextSection < 0) {
    throw new Error("STOP: location-results section not found. File unchanged.");
  }

  const directorySlice = source.slice(cityPillsStart, nextSection);
  const sectionCloseRel = directorySlice.lastIndexOf("</section>");
  if (sectionCloseRel < 0) {
    throw new Error("STOP: city-directory closing section not found. File unchanged.");
  }

  const insertAt = cityPillsStart + sectionCloseRel;

  const block = `
            <nav
              className="dk-public-filter-row"
              aria-label="Σελίδες δωροκαρτών ανά περιοχή"
              style={{ marginTop: "18px" }}
            >
              {regionOptions
                .filter((entry) => entry.count >= 3)
                .map((entry) => (
                  <Link
                    key={\`landing-\${entry.slug}\`}
                    prefetch={false}
                    href={\`/regions/\${encodeURIComponent(entry.slug)}\`}
                  >
                    Δωροκάρτες σε {entry.label}
                  </Link>
                ))}
            </nav>
`;

  const updated = source.slice(0, insertAt) + block + source.slice(insertAt);

  const backup = FILE + ".before-region-internal-links-v1";
  await fs.writeFile(backup, source, "utf8");
  await fs.writeFile(FILE, updated, "utf8");

  console.log("PASS: crawlable region landing-page links added.");
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), FILE));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
