import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(process.cwd(), "app", "browse", "page.tsx");

async function main() {
  const source = await fs.readFile(FILE, "utf8");

  const fnStart = source.indexOf("export async function generateMetadata");
  const fnEnd = source.indexOf("export default async function BrowsePage", fnStart);

  if (fnStart < 0 || fnEnd < 0) {
    throw new Error("STOP: browse generateMetadata boundaries not found. File unchanged.");
  }

  const before = source.slice(0, fnStart);
  let metadataFn = source.slice(fnStart, fnEnd);
  const after = source.slice(fnEnd);

  if (metadataFn.includes("openGraph:")) {
    console.log("PASS: /browse Open Graph metadata already present. No changes needed.");
    return;
  }

  const filteredAnchor =
    "  const filtered = Boolean(q || category || occasion || page > 1);";

  if (!metadataFn.includes(filteredAnchor)) {
    throw new Error("STOP: filtered metadata anchor not found. File unchanged.");
  }

  metadataFn = metadataFn.replace(
    filteredAnchor,
    `${filteredAnchor}

  const title = q ? \`Αναζήτηση «\${q}» – Δωροκάρτες\` : "Όλες οι δωροκάρτες";
  const description =
    "Αναζήτησε και σύγκρινε ενεργές δωροκάρτες ανά κατάστημα, κατηγορία και περίσταση.";`
  );

  const titleLine = '    title: q ? `Αναζήτηση «${q}» – Δωροκάρτες` : "Όλες οι δωροκάρτες",';
  const descriptionLine =
    '    description: "Αναζήτησε και σύγκρινε ενεργές δωροκάρτες ανά κατάστημα, κατηγορία και περίσταση.",';

  if (!metadataFn.includes(titleLine) || !metadataFn.includes(descriptionLine)) {
    throw new Error("STOP: existing title/description lines not found. File unchanged.");
  }

  metadataFn = metadataFn
    .replace(titleLine, "    title,")
    .replace(descriptionLine, "    description,");

  const robotsLine =
    "    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },";

  if (!metadataFn.includes(robotsLine)) {
    throw new Error("STOP: robots line not found. File unchanged.");
  }

  metadataFn = metadataFn.replace(
    robotsLine,
    `${robotsLine}
    openGraph: {
      type: "website",
      url: "/browse",
      siteName: "Dorokartes.gr",
      title,
      description,
      locale: "el_GR",
    },`
  );

  const updated = before + metadataFn + after;
  const backup = FILE + ".before-browse-opengraph-v1.1";

  await fs.writeFile(backup, source, "utf8");
  await fs.writeFile(FILE, updated, "utf8");

  console.log("PASS: /browse Open Graph metadata added.");
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), FILE));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
