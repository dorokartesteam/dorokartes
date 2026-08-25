import { resolve } from "node:path";
import { dedupeDiscoveries } from "./dedupe";
import { loadFolder } from "./loaders";
import { disconnect, storeNormalized } from "./store";

async function main() {
  const folderArg = process.argv[2] ?? "data/discovery/sources";
  const folder = resolve(process.cwd(), folderArg);

  console.log("Dorokartes Multi-Source Collector v1");
  console.log(`Loading from: ${folder}`);

  const raw = await loadFolder(folder);

  console.log(`Raw items: ${raw.length}`);

  const unique = dedupeDiscoveries(raw);

  console.log(`After dedupe/merge: ${unique.length}`);

  const saved = await storeNormalized(unique);

  console.log(`Saved to DiscoveryItem: ${saved}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect();
  });
