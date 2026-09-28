import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");
type Row = any;

const HARD_HOLD = new Set([
  "Nextsystems",
  "Treatwell",
  "Winewalkers",
  "for Stay in Greece",
  "Superstrom",
  "Greenmall",
  "Mercato",
]);

const BLOCK_MERCHANT_URL: Array<[RegExp, RegExp]> = [
  [/^Anastasiasstore$/i, /%cf%86%cf%8c%cf%81%ce%bc%ce%b1-%ce%b5%cf%80%ce%b9%cf%83%cf%84%cf%81%ce%bf%cf%86/i],
  [/^Djmania$/i, /mikra-hxeia|egkatastaseis/i],
  [/^Fan Pharmacy$/i, /product-category/i],
  [/^Kounelis$/i, /skaptika|frezes|katastrofeis/i],
];

const WEAK_PAGE_RE =
  /(blog|article|news|returns?|refund|policy|policies|shipping|terms|privacy|product-category)/i;

function norm(v: string) {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function clean(v: string) {
  return (v || "").replace(/\s+/g, " ").trim();
}
function postal(v: string) {
  const m = String(v || "").match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

function inferCity(address: string, current: string | null): string | null {
  const a = norm(address);

  // Prefer explicit locality phrases, never street-name-only hints.
  const rules: Array<[RegExp, string]> = [
    [/\bνεα σμυρν[ηης]*\b|\bnea smyrni\b|\bnea smirni\b/i, "Νέα Σμύρνη"],
    [/\bνεα ερυθρ[α-ω]*\b|\bnea erythraia\b/i, "Νέα Ερυθραία"],
    [/\bκερκυρ[α-ω]*\b|\bkerkyra\b|\bcorfu\b/i, "Κέρκυρα"],
    [/\bchios\b|\bχι(?:ος|ου)\b(?=.*\b821\s?00\b)/i, "Χίος"],
    [/\bμυκονο[α-ω]*\b|\bmykonos\b|\bmikonos\b/i, "Μύκονος"],
    [/\bγλυφαδ[α-ω]*\b|\bglyfada\b/i, "Γλυφάδα"],
    [/\bμαρουσι\b|\bmarousi\b/i, "Μαρούσι"],
    [/\bχαλανδρι\b|\bchalandri\b/i, "Χαλάνδρι"],
    [/\bπεριστερ[α-ω]*\b|\bperisteri\b/i, "Περιστέρι"],
    [/\bνεα ιωνια\b|\bnea ionia\b/i, "Νέα Ιωνία"],
    [/\bκορωπ[ιίου]*\b|\bkoropi\b/i, "Κορωπί"],
    [/\bκηφισι[α-ω]*\b|\bkifisia\b/i, "Κηφισιά"],
    [/\bκαλαμαρι[α-ω]*\b|\bkalamaria\b/i, "Καλαμαριά"],
    [/\bθερμη\b|\bthermi\b/i, "Θέρμη"],
    [/\bευοσμ[α-ω]*\b|\bevosmos\b/i, "Εύοσμος"],
    [/\bπειραι[α-ω]*\b|\bpiraeus\b/i, "Πειραιάς"],
    [/\bθεσσαλονικ[α-ω]*\b|\bthessaloniki\b/i, "Θεσσαλονίκη"],
    [/\bχανια\b|\bchania\b/i, "Χανιά"],
    [/\bηρακλειο κρητ[α-ω]*\b|\bheraklion\b|\biraklio\b/i, "Ηράκλειο"],
    [/\bπατρα\b|\bpatra\b/i, "Πάτρα"],
    [/\bιωαννινα\b|\bioannina\b/i, "Ιωάννινα"],
    [/\bσερρ[α-ω]*\b|\bserres\b/i, "Σέρρες"],
    [/\bκαρδιτσ[α-ω]*\b|\bkarditsa\b/i, "Καρδίτσα"],
    [/\bκορινθ[α-ω]*\b|\bcorinth\b|\bkorinth\b/i, "Κόρινθος"],
    [/\bναυπλ[α-ω]*\b|\bnafplio\b/i, "Ναύπλιο"],
    [/\bσπαρτ[α-ω]*\b|\bsparti\b/i, "Σπάρτη"],
    [/\bκαλαματα\b|\bkalamata\b/i, "Καλαμάτα"],
    [/\bαθηνα\b|\bathens\b/i, "Αθήνα"],
  ];

  // Keep current when it is already a specific, plausible locality.
  if (current && !/^(Αθήνα|Athens)$/i.test(current)) {
    if (current === "Χίος" && /\b121\s?33\b/.test(a)) return "Περιστέρι";
    return current;
  }

  for (const [re, city] of rules) if (re.test(a)) return city;
  return current || null;
}

function addressSignature(address: string) {
  const a = norm(clean(address))
    .replace(/τηλεφωνο:?[^,]*/g, " ")
    .replace(/email:?[^,]*/g, " ")
    .replace(/πληροφοριες χαρτης/g, " ")
    .replace(/εμφανιση χαρτη google/g, " ")
    .replace(/οδηγιες προσβασης/g, " ")
    .replace(/get directions?/g, " ")
    .replace(/showroom|καταστημα|shop|store|outlet/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // core around first number + next tokens
  const m = a.match(/([\p{L}.Ά-ώA-Za-z\s]{2,45}\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b.{0,35})/u);
  return (m ? m[1] : a)
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 80);
}

function sourceRank(row: Row) {
  let score = row.sourceType === "MAP_LINK" ? 300 : row.sourceType === "PAGE_TEXT" ? 200 : 100;
  if (/(stores?|storelocator|store-locator|katast|contact|epikoin|επικοινων)/i.test(String(row.sourceUrl || ""))) score += 40;
  if (WEAK_PAGE_RE.test(String(row.sourceUrl || ""))) score -= 100;
  if (clean(row.addressLine || "").length < 180) score += 10;
  return score;
}

function holdReason(row: Row): string | null {
  if (HARD_HOLD.has(row.merchant)) return "Known ambiguous merchant";

  for (const [m, u] of BLOCK_MERCHANT_URL) {
    if (m.test(String(row.merchant || "")) && u.test(String(row.sourceUrl || "")))
      return "Known weak/non-location source URL";
  }

  if (row.sourceType === "PAGE_TEXT" && WEAK_PAGE_RE.test(String(row.sourceUrl || "")))
    return "Weak PAGE_TEXT source";

  if (!row._resolvedCity) return "Could not resolve city safely";

  if (row.merchant === "Thebabycity" && !/\b551\s?33\b/.test(String(row.addressLine || "")))
    return "TheBabyCity row lacks actual street address";

  if (row.merchant === "Tacticalstore" && !/Μεσολογγίου|Mesologgi/i.test(String(row.addressLine || "")))
    return "Tacticalstore duplicate without street address";

  return null;
}

function normalizedKey(row: Row) {
  return norm(`${row._resolvedCity}|${clean(row.addressLine || "")}`)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const report = JSON.parse(await fs.readFile(
    path.resolve(process.cwd(), "reports", "regions", "merchant-location-production-gate-v1.json"),
    "utf8"
  ));

  const input: Row[] = (report.productionSafe || []).map((r: Row) => ({
    ...r,
    _resolvedCity: inferCity(String(r.addressLine || ""), r.city || null),
  }));

  const held: any[] = [];
  const candidates: Row[] = [];

  for (const row of input) {
    const why = holdReason(row);
    if (why) held.push({ ...row, holdReason: why });
    else candidates.push(row);
  }

  // Strong dedupe: merchant + resolved city + postal + normalized street signature.
  const dedup = new Map<string, Row>();

  for (const row of candidates) {
    const a = clean(row.addressLine || "");
    const key = [
      row.merchantId,
      norm(row._resolvedCity),
      postal(a),
      addressSignature(a),
    ].join("|");

    const prev = dedup.get(key);
    if (!prev || sourceRank(row) > sourceRank(prev)) dedup.set(key, row);
  }

  // Extra same-postal consolidation for same merchant/city.
  const finalMap = new Map<string, Row>();
  for (const row of dedup.values()) {
    const a = clean(row.addressLine || "");
    const p = postal(a);
    const key = `${row.merchantId}|${norm(row._resolvedCity)}|${p}|${addressSignature(a).slice(0, 35)}`;
    const prev = finalMap.get(key);
    if (!prev || sourceRank(row) > sourceRank(prev)) finalMap.set(key, row);
  }

  const finalRows = [...finalMap.values()];

  console.log("=== FINAL PRODUCTION LOCATION APPLY v3 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Input PRODUCTION_SAFE rows: ${input.length}`);
  console.log(`Held back: ${held.length}`);
  console.log(`After final dedupe: ${finalRows.length}`);

  console.log("");
  console.log("=== HELD BACK ===");
  console.table(held.map(r => ({
    merchant: r.merchant,
    city: r.city,
    resolvedCity: r._resolvedCity,
    reason: r.holdReason,
  })));

  console.log("");
  console.log("=== FINAL WRITE PREVIEW ===");
  console.table(finalRows.map(r => ({
    merchant: r.merchant,
    city: r._resolvedCity,
    sourceType: r.sourceType,
    address: clean(r.addressLine || ""),
  })));

  if (!APPLY) {
    console.log("");
    console.log("DRY RUN ONLY — database unchanged.");
    await prisma.$disconnect();
    return;
  }

  let applied = 0;
  for (const row of finalRows) {
    const addressLine = clean(row.addressLine || "");
    const nk = normalizedKey(row);

    await prisma.merchantLocation.upsert({
      where: {
        merchantId_normalizedKey: {
          merchantId: row.merchantId,
          normalizedKey: nk,
        },
      },
      create: {
        merchantId: row.merchantId,
        label: row.label ?? null,
        countryCode: "GR",
        administrativeArea: row.administrativeArea ?? null,
        city: row._resolvedCity,
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || postal(addressLine) || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        normalizedKey: nk,
        sourceUrl: row.sourceUrl,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
      update: {
        label: row.label ?? null,
        administrativeArea: row.administrativeArea ?? null,
        city: row._resolvedCity,
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || postal(addressLine) || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        sourceUrl: row.sourceUrl,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
    });

    applied++;
  }

  console.log(`APPLIED VERIFIED LOCATION ROWS: ${applied}`);
  console.log(`HELD BACK / NOT WRITTEN: ${held.length}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
