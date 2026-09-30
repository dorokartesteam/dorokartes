import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const source = await fs.readFile(
    path.resolve(process.cwd(), "app", "browse", "page.tsx"),
    "utf8"
  );

  const start = source.indexOf("export async function generateMetadata");
  const end = source.indexOf("export default async function BrowsePage", start);
  const metadata = start >= 0 && end >= 0 ? source.slice(start, end) : "";

  const checks = {
    hasOpenGraph: metadata.includes("openGraph:"),
    websiteType: metadata.includes('type: "website"'),
    browseUrl: metadata.includes('url: "/browse"'),
    siteName: metadata.includes('siteName: "Dorokartes.gr"'),
    locale: metadata.includes('locale: "el_GR"'),
    sharedTitle: metadata.includes("const title ="),
    sharedDescription: metadata.includes("const description ="),
    preservesCanonical: metadata.includes('alternates: { canonical: "/browse" }'),
    preservesRobots: metadata.includes("robots: filtered ?"),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: browse Open Graph v1.1 checks failed.");
  }

  console.log("PASS: browse Open Graph v1.1 checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
