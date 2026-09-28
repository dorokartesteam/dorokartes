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
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

  const rules: Array<[RegExp, string]> = [
    [/(νεα σμυρν|nea smyrni|nea smirni)/i, "Νέα Σμύρνη"],
    [/(νεα ερυθρ|nea erythraia)/i, "Νέα Ερυθραία"],
    [/(κερκυρ|kerkyra|corfu)/i, "Κέρκυρα"],
    [/(χιο|chios)/i, "Χίος"],
    [/(μυκονο|mykonos|mikonos)/i, "Μύκονος"],
    [/(γλυφαδ|glyfada)/i, "Γλυφάδα"],
    [/(μαρουσι|marousi)/i, "Μαρούσι"],
    [/(χαλανδρι|chalandri)/i, "Χαλάνδρι"],
    [/(περιστερ|peristeri)/i, "Περιστέρι"],
    [/(νεα ιωνια|nea ionia)/i, "Νέα Ιωνία"],
    [/(κορωπ|koropi)/i, "Κορωπί"],
    [/(κηφισ|kifisia)/i, "Κηφισιά"],
    [/(καλαμαρι|kalamaria)/i, "Καλαμαριά"],
    [/(θερμη|thermi)/i, "Θέρμη"],
    [/(ευοσμ|evosmos)/i, "Εύοσμος"],
    [/(πειραι|piraeus)/i, "Πειραιάς"],
    [/(θεσσαλον|thessaloniki)/i, "Θεσσαλονίκη"],
    [/(χανια|chania)/i, "Χανιά"],
    [/(ηρακλειο κρητ|heraklion|iraklio 7)/i, "Ηράκλειο"],
    [/(πατρα|patra)/i, "Πάτρα"],
    [/(ιωαννινα|ioannina)/i, "Ιωάννινα"],
    [/(σερρ|serres)/i, "Σέρρες"],
    [/(καρδιτσ|karditsa)/i, "Καρδίτσα"],
    [/(κορινθ|corinth|korinth)/i, "Κόρινθος"],
    [/(ναυπλ|nafplio)/i, "Ναύπλιο"],
    [/(σπαρτ|sparti)/i, "Σπάρτη"],
    [/(καλαματα|kalamata)/i, "Καλαμάτα"],
    [/(αθηνα|athens)/i, "Αθήνα"],
  ];

  for (const [re, city] of rules) {
    if (re.test(a)) return city;
  }

  return current || null;
}

function meaningfulAddress(row: Row) {
  const a = clean(row.addressLine || "");
  if (a.length < 10) return false;

  const hasStreetNumber = /\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/.test(a);
  const hasPostal = !!postal(a);
  const mapAddress = row.sourceType === "MAP_LINK" && hasStreetNumber;

  return (hasStreetNumber && hasPostal) || mapAddress;
}

function canonicalStreetFragment(address: string) {
  let a = norm(clean(address));
  a = a
    .replace(/τηλεφωνο:?[^,]*/g, " ")
    .replace(/email:?[^,]*/g, " ")
    .replace(/πληροφοριες χαρτης/g, " ")
    .replace(/εμφανιση χαρτη google/g, " ")
    .replace(/ανοιγμα στον χαρτη/g, " ")
    .replace(/οδηγιες προσβασης/g, " ")
    .replace(/get directions?/g, " ")
    .replace(/showroom|καταστημα|shop|store|outlet/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // keep compact prefix around the first street number
  const m = a.match(/(.{0,55}\b\d{1,4}[a-zα-ω]?\b.{0,55})/i);
  return (m ? m[1] : a).replace(/[^\p{L}\p{N}]+/gu, "");
}

function physicalKey(row: Row) {
  const address = clean(row.addressLine || "");
  const city = norm(row._resolvedCity || row.city || "");
  const p = postal(address) || String(row.postalCode || "").replace(/\s/g, "");
  const frag = canonicalStreetFragment(address);

  return `${row.merchantId}|${city}|${p}|${frag.slice(0, 90)}`;
}

function sourceRank(row: Row) {
  let rank = row.sourceType === "MAP_LINK" ? 300 : row.sourceType === "PAGE_TEXT" ? 200 : 100;

  const url = String(row.sourceUrl || "");
  if (/(stores?|storelocator|store-locator|katast|contact|epikoin|επικοινων)/i.test(url)) rank += 40;
  if (WEAK_PAGE_RE.test(url)) rank -= 100;

  const len = clean(row.addressLine || "").length;
  if (len > 300) rank -= 20;
  if (len < 180) rank += 10;

  return rank;
}

function shouldHold(row: Row): string | null {
  if (HARD_HOLD.has(row.merchant)) return "Known ambiguous merchant";

  for (const [merchantRe, urlRe] of BLOCK_MERCHANT_URL) {
    if (merchantRe.test(String(row.merchant || "")) && urlRe.test(String(row.sourceUrl || ""))) {
      return "Known weak/non-location source URL";
    }
  }

  if (!meaningfulAddress(row)) return "Address is incomplete / lacks physical-location structure";

  if (row.sourceType === "PAGE_TEXT" && WEAK_PAGE_RE.test(String(row.sourceUrl || ""))) {
    return "PAGE_TEXT came from policy/blog/product-type URL";
  }

  // Known preview-only weak rows.
  if (row.merchant === "Thebabycity" && !/\b551\s?33\b/.test(String(row.addressLine || ""))) {
    return "TheBabyCity row has no actual street address";
  }

  if (row.merchant === "Tacticalstore" && !/Μεσολογγίου|Mesologgi/i.test(String(row.addressLine || ""))) {
    return "Tacticalstore duplicate row lacks street address";
  }

  return null;
}

function normalizedKey(row: Row) {
  return norm(`${row._resolvedCity || row.city || ""}|${clean(row.addressLine || "")}`)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-production-gate-v1.json"
  );

  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const input: Row[] = (report.productionSafe || []).map((r: Row) => ({
    ...r,
    _resolvedCity: inferCity(String(r.addressLine || ""), r.city || null),
  }));

  const held: Array<Row & { holdReason: string }> = [];
  const candidates: Row[] = [];

  for (const row of input) {
    const reason = shouldHold(row);

    if (!row._resolvedCity) {
      held.push({ ...row, holdReason: "Could not resolve city safely" });
      continue;
    }

    if (reason) {
      held.push({ ...row, holdReason: reason });
      continue;
    }

    candidates.push(row);
  }

  // First pass exact-ish physical key.
  const dedup1 = new Map<string, Row>();
  for (const row of candidates) {
    const k = physicalKey(row);
    const prev = dedup1.get(k);
    if (!prev || sourceRank(row) > sourceRank(prev)) dedup1.set(k, row);
  }

  // Second pass merchant + city + postal.
  // If same physical postal point appears via MAP and PAGE_TEXT, keep stronger row.
  const dedup2 = new Map<string, Row>();
  for (const row of dedup1.values()) {
    const a = clean(row.addressLine || "");
    const p = postal(a) || String(row.postalCode || "").replace(/\s/g, "");
    const k = `${row.merchantId}|${norm(row._resolvedCity)}|${p}|${canonicalStreetFragment(a).slice(0, 35)}`;

    const prev = dedup2.get(k);
    if (!prev || sourceRank(row) > sourceRank(prev)) dedup2.set(k, row);
  }

  const finalRows = [...dedup2.values()];

  console.log("=== FINAL PRODUCTION LOCATION APPLY v2 ===");
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
    sourceUrl: r.sourceUrl,
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
    const city = row._resolvedCity;
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
        city,
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
        city,
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

  console.log("");
  console.log(`APPLIED VERIFIED LOCATION ROWS: ${applied}`);
  console.log(`HELD BACK / NOT WRITTEN: ${held.length}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
