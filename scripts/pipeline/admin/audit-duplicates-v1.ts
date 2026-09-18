import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, DiscoveryStatus } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = process.cwd();
const OUT = path.join(
  ROOT,
  "data",
  "discovery",
  "duplicate-audit-v1.csv",
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

function rootish(domain: string) {
  return domain
    .replace(/^www\./, "")
    .replace(/\.(com\.gr|gr|com|eu|net|org|co\.uk|it|de|fr|es|nl|cy)$/i, "");
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const min = Math.min(a.length, b.length);
    const max = Math.max(a.length, b.length);
    return min / max;
  }

  const aa = new Set(a.split(" ").filter(Boolean));
  const bb = new Set(b.split(" ").filter(Boolean));
  const inter = [...aa].filter((x) => bb.has(x)).length;
  const union = new Set([...aa, ...bb]).size || 1;
  return inter / union;
}

async function main() {
  console.log("Dorokartes Duplicate Audit v1");
  console.log("=============================");
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
    },
    orderBy: { createdAt: "asc" },
  });

  const production = await prisma.merchant.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      giftCards: {
        select: {
          id: true,
          title: true,
          officialUrl: true,
        },
      },
    },
  });

  const rows: Record<string, unknown>[] = [];

  // 1) Exact duplicates inside Discovery by domain
  const byDomain = new Map<string, typeof discovery>();
  for (const d of discovery) {
    const domain =
      domainFromUrl(d.possibleOfficialUrl) ||
      domainFromUrl(d.sourceUrl);
    if (!domain) continue;
    const arr = byDomain.get(domain) ?? [];
    arr.push(d);
    byDomain.set(domain, arr);
  }

  for (const [domain, items] of byDomain) {
    if (items.length < 2) continue;
    for (let i = 1; i < items.length; i++) {
      rows.push({
        type: "DISCOVERY_EXACT_DOMAIN",
        confidence: 100,
        left_id: items[0].id,
        left_name: items[0].merchantName,
        left_domain: domain,
        right_id: items[i].id,
        right_name: items[i].merchantName,
        right_domain: domain,
        reason: "Same normalized domain in DiscoveryItems",
      });
    }
  }

  // 2) Exact duplicates inside Discovery by normalized merchant name
  const byName = new Map<string, typeof discovery>();
  for (const d of discovery) {
    const n = normalizeName(d.merchantName);
    if (!n) continue;
    const arr = byName.get(n) ?? [];
    arr.push(d);
    byName.set(n, arr);
  }

  for (const [name, items] of byName) {
    if (items.length < 2) continue;
    for (let i = 1; i < items.length; i++) {
      rows.push({
        type: "DISCOVERY_EXACT_NAME",
        confidence: 95,
        left_id: items[0].id,
        left_name: items[0].merchantName,
        left_domain:
          domainFromUrl(items[0].possibleOfficialUrl) ||
          domainFromUrl(items[0].sourceUrl),
        right_id: items[i].id,
        right_name: items[i].merchantName,
        right_domain:
          domainFromUrl(items[i].possibleOfficialUrl) ||
          domainFromUrl(items[i].sourceUrl),
        reason: `Same normalized merchant name: ${name}`,
      });
    }
  }

  // 3) Discovery already represented in Production
  for (const d of discovery) {
    const dName = normalizeName(d.merchantName);
    const dDomain =
      domainFromUrl(d.possibleOfficialUrl) ||
      domainFromUrl(d.sourceUrl);
    const dRoot = rootish(dDomain);

    for (const m of production) {
      const pName = normalizeName(m.name);
      const domains = new Set<string>();

      if (m.websiteUrl) domains.add(domainFromUrl(m.websiteUrl));
      for (const g of m.giftCards) {
        if (g.officialUrl) domains.add(domainFromUrl(g.officialUrl));
      }

      const exactDomain = dDomain && domains.has(dDomain);
      const rootDomain =
        dRoot &&
        [...domains].some((x) => rootish(x) === dRoot);
      const exactName = dName && pName && dName === pName;
      const nameSim = similarity(dName, pName);

      if (exactDomain || rootDomain || exactName || nameSim >= 0.92) {
        rows.push({
          type: "DISCOVERY_VS_PRODUCTION",
          confidence: exactDomain ? 100 : rootDomain ? 98 : exactName ? 97 : 92,
          left_id: d.id,
          left_name: d.merchantName,
          left_domain: dDomain,
          right_id: m.id,
          right_name: m.name,
          right_domain: [...domains][0] || "",
          reason: exactDomain
            ? "Exact domain already exists in production"
            : rootDomain
              ? "Same root domain already exists in production"
              : exactName
                ? "Exact normalized merchant name already exists in production"
                : "Very high merchant-name similarity",
        });
      }
    }
  }

  // Deduplicate report pairs
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = [
      r.type,
      r.left_id,
      r.right_id,
      r.reason,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) =>
    Number(b.confidence) - Number(a.confidence) ||
    String(a.left_name).localeCompare(String(b.left_name)),
  );

  const exactDomainCount = unique.filter((x) => x.type === "DISCOVERY_EXACT_DOMAIN").length;
  const exactNameCount = unique.filter((x) => x.type === "DISCOVERY_EXACT_NAME").length;
  const prodCount = unique.filter((x) => x.type === "DISCOVERY_VS_PRODUCTION").length;

  console.log(`Discovery items scanned: ${discovery.length}`);
  console.log(`Production merchants scanned: ${production.length}`);
  console.log(`Duplicate pairs found: ${unique.length}`);
  console.log(`- Discovery exact domain: ${exactDomainCount}`);
  console.log(`- Discovery exact name: ${exactNameCount}`);
  console.log(`- Discovery vs production: ${prodCount}`);
  console.log("");

  console.log("TOP DUPLICATES:");
  for (const r of unique.slice(0, 80)) {
    console.log(
      `- [${r.confidence}] ${r.left_name} (${r.left_domain || "-"}) <=> ${r.right_name} (${r.right_domain || "-"}) | ${r.reason}`,
    );
  }

  writeCsv(OUT, unique, [
    "type",
    "confidence",
    "left_id",
    "left_name",
    "left_domain",
    "right_id",
    "right_name",
    "right_domain",
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
