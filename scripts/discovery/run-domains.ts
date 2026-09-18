import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pLimit from "p-limit";
import { DISCOVERY_CONFIG } from "./config";
import { dedupeCandidates } from "./deduplicator";
import { withTimeout } from "./http";
import { prisma } from "./prisma";
import { scanDomain } from "./website-scanner";
import { storeCandidates } from "./store";
import type { Candidate } from "./types";

async function loadDomains(filePath: string) {
  const raw = await readFile(filePath, "utf-8");

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function main() {
  const input = process.argv[2] ?? "data/discovery/domains.txt";
  const filePath = resolve(process.cwd(), input);
  const domains = await loadDomains(filePath);

  if (domains.length === 0) {
    throw new Error(`No domains found in ${filePath}`);
  }

  console.log("Dorokartes Official Verifier v1.1");
  console.log(`Domains: ${domains.length}`);
  console.log(`Hard timeout/domain: ${DISCOVERY_CONFIG.domainTimeoutMs / 1000}s`);
  console.log("");

  const job = await prisma.crawlJob.create({
    data: {
      sourceName: "Official Website Verifier v1.1",
    },
  });

  const limit = pLimit(DISCOVERY_CONFIG.domainConcurrency);
  const allCandidates: Candidate[] = [];

  let pagesScanned = 0;
  let errors = 0;
  let timedOut = 0;

  try {
    const results = await Promise.all(
      domains.map((domain, index) =>
        limit(async () => {
          const started = Date.now();

          console.log(
            `[${index + 1}/${domains.length}] Scanning ${domain} ...`,
          );

          try {
            const result = await withTimeout(
              scanDomain(domain),
              DISCOVERY_CONFIG.domainTimeoutMs,
              domain,
            );

            pagesScanned += result.pagesChecked;
            errors += result.errors.length;

            console.log(
              `  done in ${((Date.now() - started) / 1000).toFixed(1)}s | ${result.candidates.length} candidate(s) | ${result.pagesChecked} page(s) | ${result.errors.length} error(s)`,
            );

            return result;
          } catch (error) {
            const message = String(error);

            if (message.includes("timed out")) {
              timedOut++;
              console.log(
                `  TIMEOUT after ${DISCOVERY_CONFIG.domainTimeoutMs / 1000}s -> skipped`,
              );
            } else {
              errors++;
              console.log(`  ERROR -> ${message}`);
            }

            return {
              domain,
              candidates: [],
              pagesChecked: 0,
              errors: [message],
            };
          }
        }),
      ),
    );

    for (const result of results) {
      allCandidates.push(...result.candidates);
    }

    const unique = dedupeCandidates(allCandidates);
    const saved = await storeCandidates(unique);

    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        finishedAt: new Date(),
        pagesScanned,
        itemsDiscovered: unique.length,
        itemsCreated: saved,
        errors: errors + timedOut,
        successful: true,
        notes:
          timedOut > 0
            ? `${timedOut} domain(s) timed out and were skipped.`
            : null,
      },
    });

    console.log("");
    console.log("Verifier completed.");
    console.log(`Pages scanned: ${pagesScanned}`);
    console.log(`Unique candidates: ${unique.length}`);
    console.log(`Saved to DiscoveryItem: ${saved}`);
    console.log(`Timeouts: ${timedOut}`);
    console.log(`Other errors: ${errors}`);
  } catch (error) {
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        finishedAt: new Date(),
        pagesScanned,
        itemsDiscovered: allCandidates.length,
        errors: errors + timedOut + 1,
        successful: false,
        notes: String(error),
      },
    });

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
