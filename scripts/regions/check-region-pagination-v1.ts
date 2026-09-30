import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const file = path.resolve(process.cwd(), "app", "regions", "[slug]", "page.tsx");
  const source = await fs.readFile(file, "utf8");

  const checks = {
    pageSize24: source.includes("const REGION_PAGE_SIZE = 24"),
    acceptsPageParam: source.includes('searchParams: Promise<{ page?: string | string[] }>'),
    parsesPage: source.includes("parsePublicPage(query.page)"),
    calculatesTotalPages: source.includes("Math.ceil(totalCards / REGION_PAGE_SIZE)"),
    slicesIds: source.includes("ids.slice(start, start + REGION_PAGE_SIZE)"),
    rendersPagination: source.includes("<PublicPagination"),
    pageSpecificCanonical: source.includes("?page=${currentPage}"),
    pageSpecificTitle: source.includes("– Σελίδα ${currentPage}"),
    rejectsOutOfRange: source.includes("if (currentPage > totalPages) notFound()"),
    jsonLdUsesPagePositions: source.includes("position: start + index + 1"),
    preservesBreadcrumb: source.includes('"@type": "BreadcrumbList"'),
    preservesCollectionPage: source.includes('"@type": "CollectionPage"'),
    preservesItemList: source.includes('"@type": "ItemList"'),
  };

  console.table(checks);

  if (Object.values(checks).some((value) => !value)) {
    throw new Error("STOP: region pagination checks failed.");
  }

  console.log("PASS: region pagination checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
