import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, DiscoveryStatus } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

const OUT = path.join(process.cwd(), "data", "discovery", "pending-cleanup-v1.csv");

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, rows: Record<string, unknown>[], headers: string[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(file, "\uFEFF" + lines.join("\n") + "\n", "utf8");
}

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getConfidence(notes?: string | null) {
  if (!notes) return null;
  const patterns = [
    /\b(?:confidence|score)\s*[:=]\s*(\d{1,3})\b/i,
    /\b(\d{2,3})\s*\/\s*100\b/,
  ];
  for (const p of patterns) {
    const m = notes.match(p);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    }
  }
  return null;
}

async function main() {
  console.log("Dorokartes Pending Cleanup v1");
  console.log("=============================");
  console.log("READ ONLY: yes");
  console.log("");

  const items = await prisma.discoveryItem.findMany({
    where: {
      status: {
        in: [DiscoveryStatus.QUEUED, DiscoveryStatus.DISCOVERED],
      },
    },
    select: {
      id: true,
      merchantName: true,
      title: true,
      sourceType: true,
      sourceName: true,
      sourceUrl: true,
      possibleOfficialUrl: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [
      { status: "asc" },
      { updatedAt: "desc" },
    ],
  });

  const rows = items.map((item) => {
    const possibleDomain = domainFromUrl(item.possibleOfficialUrl);
    const sourceDomain = domainFromUrl(item.sourceUrl);
    const confidence = getConfidence(item.notes);

    let recommendedAction = "MANUAL_REVIEW";

    if (item.status === DiscoveryStatus.QUEUED && !possibleDomain) {
      recommendedAction = "FIND_OFFICIAL_URL";
    } else if (
      item.status === DiscoveryStatus.DISCOVERED &&
      confidence !== null &&
      confidence >= 90 &&
      possibleDomain
    ) {
      recommendedAction = "LIKELY_ACCEPT";
    } else if (
      item.status === DiscoveryStatus.DISCOVERED &&
      possibleDomain
    ) {
      recommendedAction = "REVIEW_THEN_ACCEPT";
    }

    return {
      id: item.id,
      status: item.status,
      merchant_name: item.merchantName ?? "",
      title: item.title ?? "",
      source_type: item.sourceType,
      source_name: item.sourceName,
      source_url: item.sourceUrl,
      source_domain: sourceDomain,
      possible_official_url: item.possibleOfficialUrl ?? "",
      possible_official_domain: possibleDomain,
      confidence: confidence ?? "",
      recommended_action: recommendedAction,
      notes: item.notes ?? "",
    };
  });

  const queued = rows.filter((x) => x.status === DiscoveryStatus.QUEUED);
  const discovered = rows.filter((x) => x.status === DiscoveryStatus.DISCOVERED);

  console.log(`Pending total: ${rows.length}`);
  console.log(`- QUEUED: ${queued.length}`);
  console.log(`- DISCOVERED: ${discovered.length}`);
  console.log("");

  console.log("QUEUED needing official URL:");
  for (const row of queued) {
    console.log(
      `- ${row.merchant_name || "(no merchant)"} | source=${row.source_name} | ${row.source_url}`
    );
  }

  console.log("");
  console.log("DISCOVERED candidates:");
  for (const row of discovered) {
    console.log(
      `- ${row.merchant_name || "(no merchant)"} | score=${row.confidence || "-"} | official=${row.possible_official_url || "-"} | action=${row.recommended_action}`
    );
  }

  writeCsv(OUT, rows, [
    "id",
    "status",
    "merchant_name",
    "title",
    "source_type",
    "source_name",
    "source_url",
    "source_domain",
    "possible_official_url",
    "possible_official_domain",
    "confidence",
    "recommended_action",
    "notes",
  ]);

  console.log("");
  console.log(`CSV: ${OUT}`);
  console.log("No database changes were made.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
