import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(process.cwd(), "app", "regions", "[slug]", "page.tsx");

async function main() {
  let source = await fs.readFile(FILE, "utf8");

  if (source.includes("getRegionLandingContent")) {
    console.log("PASS: region landing content already integrated. No changes needed.");
    return;
  }

  const importAnchor = `import {
  getGiftCardIdsForRegion,
  getRegionOptions,
} from "@/lib/regions/region-assignment";`;

  if (!source.includes(importAnchor)) {
    throw new Error("STOP: region-assignment import anchor not found. File unchanged.");
  }

  source = source.replace(
    importAnchor,
    `${importAnchor}
import { getRegionLandingContent } from "@/lib/regions/region-landing-content";`
  );

  const regionAnchor = `  const region = await getRegion(slug);

  if (!region) notFound();`;

  if (!source.includes(regionAnchor)) {
    throw new Error("STOP: region page anchor not found. File unchanged.");
  }

  source = source.replace(
    regionAnchor,
    `  const region = await getRegion(slug);

  if (!region) notFound();

  const landingContent = getRegionLandingContent(region.slug);`
  );

  const introAnchor = `            <p>
              Ανακάλυψε δωροκάρτες από επιχειρήσεις με επαληθευμένη φυσική παρουσία
              στην περιοχή {region.label}. Η φυσική παρουσία ενός εμπόρου δεν σημαίνει
              απαραίτητα ότι κάθε δωροκάρτα αγοράζεται ή εξαργυρώνεται στο κατάστημα.
            </p>`;

  if (!source.includes(introAnchor)) {
    throw new Error("STOP: intro paragraph anchor not found. File unchanged.");
  }

  const replacement = `            {landingContent ? (
              <>
                <p>{landingContent.intro}</p>
                <p>{landingContent.supporting}</p>
              </>
            ) : (
              <p>
                Ανακάλυψε δωροκάρτες από επιχειρήσεις με επαληθευμένη φυσική παρουσία
                στην περιοχή {region.label}. Η φυσική παρουσία ενός εμπόρου δεν σημαίνει
                απαραίτητα ότι κάθε δωροκάρτα αγοράζεται ή εξαργυρώνεται στο κατάστημα.
              </p>
            )}`;

  source = source.replace(introAnchor, replacement);

  const backup = FILE + ".before-region-content-v1";
  await fs.writeFile(backup, await fs.readFile(FILE, "utf8"), "utf8");
  await fs.writeFile(FILE, source, "utf8");

  console.log("PASS: region landing content integrated.");
  console.log("Backup:", path.relative(process.cwd(), backup));
  console.log("Updated:", path.relative(process.cwd(), FILE));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
