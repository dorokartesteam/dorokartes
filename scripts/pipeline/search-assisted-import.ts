import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");

type Candidate = {
  merchantName: string;
  merchantDomain: string;
  candidateUrl: string;
  discoverySource: string;
  evidenceUrl: string;
  evidenceKind: string;
  evidenceSummary: string;
  expectedRole?: string;
};

function registeredDomain(input: string) {
  const u = new URL(input);
  return (
    getDomain(u.hostname, { allowPrivateDomains: true }) ??
    u.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function fp(domain: string, url: string) {
  return createHash("sha256")
    .update(`search-assisted|${domain}|${url}`)
    .digest("hex");
}

async function main() {
  const parsed = JSON.parse(
    await readFile("data/pipeline/search-assisted-candidates.json", "utf8"),
  ) as { candidates: Candidate[] };

  console.log("Dorokartes Search-Assisted Discovery");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Candidates: ${parsed.candidates.length}`);
  console.log("");

  let valid = 0;
  let created = 0;
  let existing = 0;
  let rejected = 0;

  for (const c of parsed.candidates) {
    const actualDomain = registeredDomain(c.candidateUrl);
    const expectedDomain = c.merchantDomain.toLowerCase();

    // Accept official subdomains but not cross-registered-domain redirects.
    if (actualDomain !== expectedDomain) {
      console.log(`[REJECT] ${c.merchantName}`);
      console.log(`  candidate=${c.candidateUrl}`);
      console.log(`  domain mismatch: ${actualDomain} != ${expectedDomain}`);
      rejected++;
      continue;
    }

    valid++;
    console.log(`[VALID] ${c.merchantName}`);
    console.log(`  ${c.candidateUrl}`);
    console.log(`  evidence=${c.evidenceKind}`);
    console.log(`  expectedRole=${c.expectedRole ?? "-"}`);

    const found = await prisma.discoveryItem.findFirst({
      where: { sourceUrl: c.candidateUrl },
    });

    if (found) {
      existing++;
      console.log(`  -> EXISTS status=${found.status}`);
      continue;
    }

    if (!APPLY) {
      console.log("  -> WOULD CREATE");
      continue;
    }

    await prisma.discoveryItem.create({
      data: {
        sourceType: SourceType.OFFICIAL,
        sourceName: c.discoverySource || "External Search Discovery",
        sourceUrl: c.candidateUrl,
        title: null,
        merchantName: c.merchantName,
        status: DiscoveryStatus.QUEUED,
        possibleOfficialUrl: c.candidateUrl,
        fingerprint: fp(expectedDomain, c.candidateUrl),
        notes: JSON.stringify({
          pipeline: "search-assisted-discovery",
          merchantDomain: expectedDomain,
          evidenceUrl: c.evidenceUrl,
          evidenceKind: c.evidenceKind,
          evidenceSummary: c.evidenceSummary,
          expectedRole: c.expectedRole ?? null,
        }),
      },
    });

    created++;
    console.log("  -> CREATED QUEUED");
  }

  console.log("");
  console.log("====================================");
  console.log(`Valid: ${valid}`);
  console.log(`Existing: ${existing}`);
  console.log(`Created: ${created}`);
  console.log(`Rejected: ${rejected}`);

  if (!APPLY) console.log("Dry run only. No database changes.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
