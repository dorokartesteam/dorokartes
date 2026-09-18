import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  PrismaClient,
  DiscoveryStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = process.cwd();
const OUT = path.join(
  ROOT,
  "data",
  "discovery",
  "duplicate-clusters-v2.csv",
);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

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

function normalizeName(input?: string | null) {
  return (input || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(greece|hellas|official|eshop|e-shop|shop|store|online)\b/g, " ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainFromUrl(raw?: string | null) {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getDomain(item: {
  possibleOfficialUrl: string | null;
  sourceUrl: string;
}) {
  return (
    domainFromUrl(item.possibleOfficialUrl) ||
    domainFromUrl(item.sourceUrl)
  );
}

async function main() {
  console.log("Dorokartes Duplicate Cluster Audit v2");
  console.log("=====================================");
  console.log("READ ONLY: yes");
  console.log("");

  const discovery = await prisma.discoveryItem.findMany({
    where: {
      status: {
        in: [
          DiscoveryStatus.DISCOVERED,
          DiscoveryStatus.QUEUED,
          DiscoveryStatus.VERIFIED,
        ],
      },
    },
    select: {
      id: true,
      merchantName: true,
      possibleOfficialUrl: true,
      sourceUrl: true,
      sourceName: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const production = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      giftCards: {
        select: { officialUrl: true },
      },
    },
  });

  const byDomain = new Map<string, typeof discovery>();
  const byName = new Map<string, typeof discovery>();

  for (const item of discovery) {
    const domain = getDomain(item);
    if (domain) {
      const arr = byDomain.get(domain) ?? [];
      arr.push(item);
      byDomain.set(domain, arr);
    }

    const name = normalizeName(item.merchantName);
    if (name) {
      const arr = byName.get(name) ?? [];
      arr.push(item);
      byName.set(name, arr);
    }
  }

  const prodDomains = new Map<string, { id: string; name: string }>();
  const prodNames = new Map<string, { id: string; name: string }>();

  for (const m of production) {
    const name = normalizeName(m.name);
    if (name) prodNames.set(name, { id: m.id, name: m.name });

    if (m.websiteUrl) {
      const d = domainFromUrl(m.websiteUrl);
      if (d) prodDomains.set(d, { id: m.id, name: m.name });
    }

    for (const g of m.giftCards) {
      if (!g.officialUrl) continue;
      const d = domainFromUrl(g.officialUrl);
      if (d) prodDomains.set(d, { id: m.id, name: m.name });
    }
  }

  const rows: Record<string, unknown>[] = [];

  // Exact-domain clusters
  for (const [domain, items] of byDomain) {
    if (items.length < 2) continue;

    const prod = prodDomains.get(domain);
    rows.push({
      cluster_type: "EXACT_DOMAIN",
      key: domain,
      discovery_count: items.length,
      duplicate_excess: items.length - 1,
      production_match: prod ? "YES" : "NO",
      production_name: prod?.name ?? "",
      production_id: prod?.id ?? "",
      keep_candidate_id: items[0].id,
      merchant_names: [...new Set(items.map((x) => x.merchantName || ""))].join(" | "),
      source_names: [...new Set(items.map((x) => x.sourceName))].join(" | "),
      discovery_ids: items.map((x) => x.id).join(" | "),
      statuses: [...new Set(items.map((x) => x.status))].join(" | "),
      reason: prod
        ? "Multiple DiscoveryItems share the same domain and merchant already exists in production"
        : "Multiple DiscoveryItems share the same normalized domain",
    });
  }

  // Exact-name clusters only when they are not already represented by an exact-domain cluster
  for (const [name, items] of byName) {
    if (items.length < 2) continue;

    const domains = [...new Set(items.map(getDomain).filter(Boolean))];
    const allSameDomain = domains.length === 1 && domains[0] && (byDomain.get(domains[0])?.length ?? 0) >= 2;

    if (allSameDomain) continue;

    const prod = prodNames.get(name);
    rows.push({
      cluster_type: "EXACT_NAME",
      key: name,
      discovery_count: items.length,
      duplicate_excess: items.length - 1,
      production_match: prod ? "YES" : "NO",
      production_name: prod?.name ?? "",
      production_id: prod?.id ?? "",
      keep_candidate_id: items[0].id,
      merchant_names: [...new Set(items.map((x) => x.merchantName || ""))].join(" | "),
      source_names: [...new Set(items.map((x) => x.sourceName))].join(" | "),
      discovery_ids: items.map((x) => x.id).join(" | "),
      statuses: [...new Set(items.map((x) => x.status))].join(" | "),
      reason: prod
        ? "Multiple DiscoveryItems share the same normalized name and merchant already exists in production"
        : "Multiple DiscoveryItems share the same normalized merchant name",
    });
  }

  // Single discovery item already in production
  for (const item of discovery) {
    const domain = getDomain(item);
    const name = normalizeName(item.merchantName);

    const prodByDomain = domain ? prodDomains.get(domain) : undefined;
    const prodByName = name ? prodNames.get(name) : undefined;
    const prod = prodByDomain ?? prodByName;
    if (!prod) continue;

    const domainCluster = domain && (byDomain.get(domain)?.length ?? 0) >= 2;
    const nameCluster = name && (byName.get(name)?.length ?? 0) >= 2;
    if (domainCluster || nameCluster) continue;

    rows.push({
      cluster_type: "SINGLE_VS_PRODUCTION",
      key: domain || name,
      discovery_count: 1,
      duplicate_excess: 1,
      production_match: "YES",
      production_name: prod.name,
      production_id: prod.id,
      keep_candidate_id: "",
      merchant_names: item.merchantName || "",
      source_names: item.sourceName,
      discovery_ids: item.id,
      statuses: item.status,
      reason: prodByDomain
        ? "DiscoveryItem domain already exists in production"
        : "DiscoveryItem normalized merchant name already exists in production",
    });
  }

  rows.sort((a, b) =>
    Number(b.duplicate_excess) - Number(a.duplicate_excess) ||
    Number(b.discovery_count) - Number(a.discovery_count) ||
    String(a.key).localeCompare(String(b.key)),
  );

  const exactDomainClusters = rows.filter((x) => x.cluster_type === "EXACT_DOMAIN");
  const exactNameClusters = rows.filter((x) => x.cluster_type === "EXACT_NAME");
  const prodSingles = rows.filter((x) => x.cluster_type === "SINGLE_VS_PRODUCTION");

  const totalExcess = rows.reduce((sum, x) => sum + Number(x.duplicate_excess || 0), 0);
  const productionMatchedClusters = rows.filter((x) => x.production_match === "YES").length;

  console.log(`Discovery items scanned: ${discovery.length}`);
  console.log(`Production merchants scanned: ${production.length}`);
  console.log(`Unique duplicate clusters: ${rows.length}`);
  console.log(`- Exact-domain clusters: ${exactDomainClusters.length}`);
  console.log(`- Exact-name clusters: ${exactNameClusters.length}`);
  console.log(`- Single discovery vs production: ${prodSingles.length}`);
  console.log(`Production-matched clusters/items: ${productionMatchedClusters}`);
  console.log(`Estimated excess DiscoveryItems: ${totalExcess}`);
  console.log("");

  console.log("TOP DUPLICATE CLUSTERS:");
  for (const r of rows.slice(0, 60)) {
    console.log(
      `- ${r.cluster_type} | ${r.key} | items=${r.discovery_count} | excess=${r.duplicate_excess}` +
        `${r.production_match === "YES" ? ` | PROD=${r.production_name}` : ""}`
    );
  }

  writeCsv(OUT, rows, [
    "cluster_type",
    "key",
    "discovery_count",
    "duplicate_excess",
    "production_match",
    "production_name",
    "production_id",
    "keep_candidate_id",
    "merchant_names",
    "source_names",
    "discovery_ids",
    "statuses",
    "reason",
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
