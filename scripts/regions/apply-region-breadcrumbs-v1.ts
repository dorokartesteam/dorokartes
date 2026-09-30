import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(process.cwd(), "app", "regions", "[slug]", "page.tsx");

async function main() {
  const source = await fs.readFile(FILE, "utf8");

  if (source.includes('"@type": "BreadcrumbList"')) {
    console.log("PASS: BreadcrumbList already present. No changes needed.");
    return;
  }

  const anchor = `      {
        "@type": "CollectionPage",`;

  if (!source.includes(anchor)) {
    throw new Error("STOP: CollectionPage anchor not found. File unchanged.");
  }

  const breadcrumbBlock = `      {
        "@type": "BreadcrumbList",
        "@id": \`\${regionUrl}#breadcrumb\`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Αρχική",
            item: \`\${base}/\`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Περιοχές",
            item: \`\${base}/regions\`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: region.label,
            item: regionUrl,
          },
        ],
      },
`;

  const updated = source.replace(anchor, breadcrumbBlock + anchor);

  const backup = FILE + ".before-region-breadcrumbs-v1";
  await fs.writeFile(backup, source, "utf8");
  await fs.writeFile(FILE, updated, "utf8");

  console.log("PASS: BreadcrumbList JSON-LD added.");
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), FILE));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
