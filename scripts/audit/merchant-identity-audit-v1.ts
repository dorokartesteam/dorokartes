import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function host(value?: string | null) {
  if (!value) return "";
  try {
    const raw = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function looksSuspicious(name: string) {
  const n = normalize(name);
  if (!n || n.length < 2) return true;
  if (/^\d+$/.test(n)) return true;
  if (/\b(?:gift ?card|gift ?voucher|voucher|δωροκαρτ|δωροεπιταγ)\b/i.test(name)) return true;
  if (/https?:\/\/|www\.|\.gr\b|\.com\b/i.test(name)) return true;
  if (/[|]{1,}|::/.test(name)) return true;
  return false;
}

function looksGeneric(name: string) {
  const n = normalize(name);
  return new Set([
    "gift", "gift card", "gift cards", "gift voucher", "voucher", "vouchers",
    "δωροκαρτα", "δωροκαρτες", "δωροεπιταγη", "δωροεπιταγες",
    "shop", "store", "eshop", "e shop", "online shop",
  ]).has(n);
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const merchants = await prisma.merchant.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    include: {
      giftCards: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          verificationStatus: true,
          officialUrl: true,
          sources: {
            where: { active: true },
            select: { sourceType: true, sourceName: true, sourceUrl: true, rawTitle: true },
          },
        },
      },
      sources: {
        where: { active: true },
        select: { sourceType: true, sourceName: true, sourceUrl: true, rawTitle: true },
      },
    },
  });

  const byNormalized = new Map<string, typeof merchants>();
  for (const merchant of merchants) {
    const key = normalize(merchant.name);
    if (!key) continue;
    const list = byNormalized.get(key) || [];
    list.push(merchant);
    byNormalized.set(key, list);
  }

  const duplicates = [...byNormalized.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([normalizedName, list]) => ({ normalizedName, merchants: list }));

  const suspicious = merchants.filter((m) => looksSuspicious(m.name));
  const generic = merchants.filter((m) => looksGeneric(m.name));
  const affectedIds = new Set([
    ...suspicious.map((m) => m.id),
    ...generic.map((m) => m.id),
    ...duplicates.flatMap((d) => d.merchants.map((m) => m.id)),
  ]);
  const affected = merchants.filter((m) => affectedIds.has(m.id));

  const rows = affected.map((m) => {
    const cardHosts = [...new Set(m.giftCards.map((c) => host(c.officialUrl)).filter(Boolean))];
    const sourceNames = [...new Set([
      ...m.sources.map((s) => s.sourceName).filter(Boolean),
      ...m.giftCards.flatMap((c) => c.sources.map((s) => s.sourceName).filter(Boolean)),
    ])];
    const sourceHosts = [...new Set([
      ...m.sources.map((s) => host(s.sourceUrl)).filter(Boolean),
      ...m.giftCards.flatMap((c) => c.sources.map((s) => host(s.sourceUrl)).filter(Boolean)),
    ])];
    const activeCards = m.giftCards.filter((c) => c.status === "ACTIVE");

    return {
      id: m.id,
      name: m.name,
      slug: m.slug,
      status: m.status,
      websiteUrl: m.websiteUrl || "",
      websiteHost: host(m.websiteUrl),
      logoUrl: m.logoUrl || "",
      suspicious: looksSuspicious(m.name),
      generic: looksGeneric(m.name),
      duplicateNormalizedName: (byNormalized.get(normalize(m.name))?.length || 0) > 1,
      duplicateCount: byNormalized.get(normalize(m.name))?.length || 1,
      activeGiftCards: activeCards.length,
      giftCards: m.giftCards.map((c) => `${c.id} :: ${c.title} :: ${c.status} :: ${c.officialUrl || "-"}`),
      cardHosts,
      sourceNames,
      sourceHosts,
    };
  });

  const outDir = path.resolve(process.cwd(), "reports", "merchant-identity-audit");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `merchant-identity-audit-v1-${stamp}.json`);
  const mdPath = path.join(outDir, `merchant-identity-audit-v1-${stamp}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary: {
      totalMerchants: merchants.length,
      suspiciousMerchants: suspicious.length,
      genericMerchants: generic.length,
      duplicateGroups: duplicates.length,
      duplicateMerchantRows: duplicates.reduce((n, d) => n + d.merchants.length, 0),
      uniqueAffectedMerchants: affected.length,
    },
    duplicates: duplicates.map((d) => ({
      normalizedName: d.normalizedName,
      merchants: d.merchants.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        status: m.status,
        websiteUrl: m.websiteUrl,
        giftCards: m.giftCards.map((c) => ({ id: c.id, title: c.title, status: c.status, officialUrl: c.officialUrl })),
      })),
    })),
    affected: rows,
  }, null, 2), "utf8");

  const md: string[] = [];
  md.push("# Dorokartes Merchant Identity Audit v1", "");
  md.push(`Generated: ${new Date().toISOString()}`, "");
  md.push("> READ ONLY: no database writes and no network requests.", "");
  md.push("## Summary", "");
  md.push(`- Total merchants: ${merchants.length}`);
  md.push(`- Suspicious merchant names: ${suspicious.length}`);
  md.push(`- Generic merchant names: ${generic.length}`);
  md.push(`- Duplicate normalized-name groups: ${duplicates.length}`);
  md.push(`- Merchant rows inside duplicate groups: ${duplicates.reduce((n, d) => n + d.merchants.length, 0)}`);
  md.push(`- Unique affected merchants: ${affected.length}`, "");

  md.push("## Duplicate groups", "");
  for (const d of duplicates) {
    md.push(`### ${d.normalizedName || "(empty)"}`, "");
    md.push("| ID | Name | Slug | Status | Website | Active cards |", "|---|---|---|---|---|---:|");
    for (const m of d.merchants) {
      md.push(`| ${esc(m.id)} | ${esc(m.name)} | ${esc(m.slug)} | ${esc(m.status)} | ${esc(m.websiteUrl)} | ${m.giftCards.filter((c) => c.status === "ACTIVE").length} |`);
    }
    md.push("");
  }

  md.push("## Suspicious / generic / duplicate merchants", "");
  md.push("| ID | Merchant | Flags | Website host | Active cards | Card hosts | Source names | Source hosts |", "|---|---|---|---|---:|---|---|---|");
  for (const r of rows) {
    const flags = [
      r.suspicious ? "SUSPICIOUS" : "",
      r.generic ? "GENERIC" : "",
      r.duplicateNormalizedName ? `DUPLICATE×${r.duplicateCount}` : "",
    ].filter(Boolean).join(", ");
    md.push(`| ${esc(r.id)} | ${esc(r.name)} | ${esc(flags)} | ${esc(r.websiteHost)} | ${r.activeGiftCards} | ${esc(r.cardHosts.join(", "))} | ${esc(r.sourceNames.join(", "))} | ${esc(r.sourceHosts.join(", "))} |`);
  }

  md.push("", "## Gift-card evidence for affected merchants", "");
  for (const r of rows) {
    md.push(`### ${r.name} — ${r.id}`, "");
    if (!r.giftCards.length) {
      md.push("- No gift cards.", "");
      continue;
    }
    for (const card of r.giftCards) md.push(`- ${card}`);
    md.push("");
  }

  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  console.log("Merchant identity audit complete (READ ONLY).");
  console.log(`Affected merchants: ${affected.length}`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Markdown: ${mdPath}`);
  console.log(`JSON: ${jsonPath}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
