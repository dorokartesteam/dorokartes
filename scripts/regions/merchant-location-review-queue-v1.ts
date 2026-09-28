import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Row = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  sourceType: "JSON_LD" | "PAGE_TEXT" | "MAP_LINK" | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision?: string;
  reviewDecision?: string;
  reasons?: string[];
};

function norm(v?: string | null) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceIntent(url?: string | null) {
  return /contact|store|stores|storelocator|location|locations|katast|epikoin|showroom|boutique|find-us|where-we-are|our-store/i.test(url || "");
}

function postal(v?: string | null) {
  const m = norm(v).match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

function score(r: Row) {
  let s = 0;

  if (r.sourceType === "JSON_LD") s += 30;
  if (r.sourceType === "MAP_LINK") s += 25;
  if (r.sourceType === "PAGE_TEXT") s += 10;

  if (sourceIntent(r.sourceUrl)) s += 20;
  if (postal(r.addressLine)) s += 10;
  if (r.latitude != null && r.longitude != null) s += 10;

  const t = norm(`${r.addressLine || ""} ${r.sourceExcerpt || ""}`);

  if (/καταστημα|κατάστημα|store|shop|showroom|boutique|visit us|find us/.test(t)) s += 15;
  if (/φορολογικη εδρα|φορολογική έδρα|registered office|returns|επιστροφ/.test(t)) s -= 40;
  if (/no name|παραδειγμα|example street|dummy/.test(t)) s -= 100;

  return s;
}

function dedupeKey(r: Row) {
  return [
    r.merchantId,
    norm(r.city),
    postal(r.addressLine) || "",
    norm(r.addressLine).slice(0, 120),
  ].join("|");
}

async function readRows(file: string) {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(raw.rows) ? raw.rows as Row[] : [];
  } catch {
    return [];
  }
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const base = path.resolve(process.cwd(), "reports", "regions");

  const files = [
    "merchant-location-quality-v2-discovery.json",
    "merchant-location-quality-v3-strict.json",
    "merchant-location-quality-v4-consistency.json",
    "merchant-location-quality-v5-structural.json",
    "merchant-location-quality-v6-high-confidence.json",
    "merchant-location-quality-v7-final-safe.json",
  ].map(f => path.join(base, f));

  const all = (await Promise.all(files.map(readRows))).flat();

  const merchantIdsStillMissing = new Set(
    (await prisma.merchant.findMany({
      where: {
        status: "ACTIVE",
        giftCards: {
          some: {
            status: "ACTIVE",
            verificationStatus: "VERIFIED",
          },
        },
        locations: {
          none: {
            active: true,
            verificationStatus: "VERIFIED",
          },
        },
      },
      select: { id: true },
    })).map(x => x.id),
  );

  const unresolved = all.filter(r => {
    if (!merchantIdsStillMissing.has(r.merchantId)) return false;
    if (!r.sourceUrl || !r.addressLine) return false;

    const d = r.reviewDecision || r.decision || "";
    return d === "REVIEW" || d === "SAFE_CANDIDATE" || d === "SAFE";
  });

  const unique = new Map<string, Row>();

  for (const r of unresolved) {
    const k = dedupeKey(r);
    const prev = unique.get(k);
    if (!prev || score(r) > score(prev)) unique.set(k, r);
  }

  const candidates = [...unique.values()]
    .map(r => ({ ...r, reviewScore: score(r) }))
    .sort((a, b) => b.reviewScore - a.reviewScore);

  const grouped = new Map<string, typeof candidates>();

  for (const r of candidates) {
    const arr = grouped.get(r.merchantId) || [];
    arr.push(r);
    grouped.set(r.merchantId, arr);
  }

  const queue = [...grouped.values()]
    .map(rows => ({
      merchantId: rows[0].merchantId,
      merchant: rows[0].merchant,
      merchantSlug: rows[0].merchantSlug,
      websiteUrl: rows[0].websiteUrl,
      candidateCount: rows.length,
      bestScore: Math.max(...rows.map(r => r.reviewScore)),
      candidates: rows.slice(0, 5),
    }))
    .sort((a, b) => b.bestScore - a.bestScore || a.merchant.localeCompare(b.merchant));

  const output = {
    generatedAt: new Date().toISOString(),
    version: "1",
    merchantsStillMissingVerifiedLocation: merchantIdsStillMissing.size,
    merchantsWithReviewCandidates: queue.length,
    totalCandidateRows: candidates.length,
    queue,
  };

  const outPath = path.join(base, "merchant-location-review-queue-v1.json");
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== MERCHANT LOCATION REVIEW QUEUE v1 ===");
  console.log(`Merchants still missing verified location: ${merchantIdsStillMissing.size}`);
  console.log(`Merchants with review candidates: ${queue.length}`);
  console.log(`Unique review candidate rows: ${candidates.length}`);
  console.log(`Report: ${path.relative(process.cwd(), outPath)}`);
  console.log("");
  console.log("=== TOP 50 MERCHANTS TO REVIEW ===");

  console.table(
    queue.slice(0, 50).map(q => ({
      merchant: q.merchant,
      candidates: q.candidateCount,
      bestScore: q.bestScore,
      sourceType: q.candidates[0]?.sourceType,
      city: q.candidates[0]?.city,
      sourceUrl: q.candidates[0]?.sourceUrl,
      address: q.candidates[0]?.addressLine?.slice(0, 90),
    })),
  );

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
