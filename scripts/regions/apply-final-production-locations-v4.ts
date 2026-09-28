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

const LOCALITIES: Array<[string[], string]> = [
  [["νεα σμυρνη","nea smyrni","nea smirni"], "Νέα Σμύρνη"],
  [["νεα ερυθραια","nea erythraia"], "Νέα Ερυθραία"],
  [["παλαιο φαληρο","palaio faliro"], "Παλαιό Φάληρο"],
  [["αγιος δημητριος","agios dimitrios"], "Άγιος Δημήτριος"],
  [["νεο ηρακλειο","neo irakleio"], "Νέο Ηράκλειο"],
  [["κερκυρα","kerkyra","corfu"], "Κέρκυρα"],
  [["μυκονος","mykonos","mikonos"], "Μύκονος"],
  [["γλυφαδα","glyfada"], "Γλυφάδα"],
  [["μαρουσι","marousi"], "Μαρούσι"],
  [["χαλανδρι","chalandri"], "Χαλάνδρι"],
  [["περιστερι","peristeri"], "Περιστέρι"],
  [["νεα ιωνια","nea ionia"], "Νέα Ιωνία"],
  [["κορωπι","koropi"], "Κορωπί"],
  [["κηφισια","kifisia"], "Κηφισιά"],
  [["καλαμαρια","kalamaria"], "Καλαμαριά"],
  [["θερμη","thermi"], "Θέρμη"],
  [["ευοσμος","evosmos"], "Εύοσμος"],
  [["πειραιας","πειραια","piraeus"], "Πειραιάς"],
  [["θεσσαλονικη","thessaloniki"], "Θεσσαλονίκη"],
  [["χανια","chania"], "Χανιά"],
  [["ηρακλειο κρητης","heraklion","iraklio"], "Ηράκλειο"],
  [["πατρα","patra"], "Πάτρα"],
  [["ιωαννινα","ioannina"], "Ιωάννινα"],
  [["σερρες","serres"], "Σέρρες"],
  [["καρδιτσα","karditsa"], "Καρδίτσα"],
  [["κορινθος","corinth","korinth"], "Κόρινθος"],
  [["ναυπλιο","nafplio"], "Ναύπλιο"],
  [["σπαρτη","sparti"], "Σπάρτη"],
  [["καλαματα","kalamata"], "Καλαμάτα"],
  [["χιος","chios"], "Χίος"],
  [["αθηνα","athens"], "Αθήνα"],
];

function explicitLocality(address: string): string | null {
  const a = norm(address);

  // Never infer Chios from street "Χίου".
  const chiosAllowed =
    a.includes("chios") ||
    a.includes("χιου 821") ||
    a.includes("χιος") ||
    a.includes("82100");

  for (const [aliases, city] of LOCALITIES) {
    if (city === "Χίος" && !chiosAllowed) continue;
    if (aliases.some(x => a.includes(norm(x)))) return city;
  }

  return null;
}

function resolveCity(address: string, current: string | null): string | null {
  const explicit = explicitLocality(address);

  // Explicit locality from the address wins over coarse discovery labels.
  if (explicit) return explicit;

  // Correct one known street-name trap.
  if (current === "Χίος" && /\b121\s?33\b/.test(norm(address))) return "Περιστέρι";

  return current || null;
}

function sourceRank(row: Row) {
  let score = row.sourceType === "MAP_LINK" ? 300 : row.sourceType === "PAGE_TEXT" ? 200 : 100;
  const url = String(row.sourceUrl || "");
  if (/(stores?|storelocator|store-locator|katast|contact|epikoin|επικοινων)/i.test(url)) score += 40;
  if (WEAK_PAGE_RE.test(url)) score -= 100;
  if (clean(row.addressLine || "").length < 180) score += 10;
  return score;
}

function streetNumber(address: string) {
  const a = clean(address);
  const matches = [...a.matchAll(/\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/g)];
  if (!matches.length) return "";
  // Prefer a plausible street number, not postal code / phone number.
  for (const m of matches) {
    const n = parseInt(m[0], 10);
    if (n > 0 && n < 1000) return m[0];
  }
  return matches[0][0];
}

function containsTwoDistinctAddresses(row: Row) {
  const a = clean(row.addressLine || "");
  const ps = [...new Set((a.match(/\b\d{3}\s?\d{2}\b/g) || []).map(x => x.replace(/\s/g, "")))];

  if (row.merchant === "Alouette" && /Ηρώων Πολυτεχνείου 58/i.test(a) && /Ηρώων Πολυτεχνείου 35/i.test(a))
    return true;

  if (ps.length >= 2) return true;
  return false;
}

function holdReason(row: Row): string | null {
  if (HARD_HOLD.has(row.merchant)) return "Known ambiguous merchant";

  for (const [m, u] of BLOCK_MERCHANT_URL) {
    if (m.test(String(row.merchant || "")) && u.test(String(row.sourceUrl || "")))
      return "Known weak/non-location source URL";
  }

  if (row.sourceType === "PAGE_TEXT" && WEAK_PAGE_RE.test(String(row.sourceUrl || "")))
    return "Weak PAGE_TEXT source";

  if (containsTwoDistinctAddresses(row))
    return "Collapsed multiple physical addresses";

  if (!row._resolvedCity)
    return "Could not resolve city safely";

  if (row.merchant === "Thebabycity" && !/\b551\s?33\b/.test(String(row.addressLine || "")))
    return "TheBabyCity row lacks actual street address";

  if (row.merchant === "Tacticalstore" && !/Μεσολογγίου|Mesologgi/i.test(String(row.addressLine || "")))
    return "Tacticalstore duplicate without street address";

  return null;
}

function dedupeKey(row: Row) {
  const a = clean(row.addressLine || "");
  const p = postal(a) || String(row.postalCode || "").replace(/\s/g, "");
  const num = streetNumber(a);
  return `${row.merchantId}|${norm(row._resolvedCity)}|${p}|${norm(num)}`;
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
    _resolvedCity: resolveCity(String(r.addressLine || ""), r.city || null),
  }));

  const held: any[] = [];
  const candidates: Row[] = [];

  for (const row of input) {
    const why = holdReason(row);
    if (why) held.push({ ...row, holdReason: why });
    else candidates.push(row);
  }

  // Conservative dedupe: same merchant + city + postal + street number.
  // Stronger source wins; MAP_LINK preferred over PAGE_TEXT over JSON_LD.
  const dedup = new Map<string, Row>();

  for (const row of candidates) {
    const key = dedupeKey(row);
    const prev = dedup.get(key);

    if (!prev || sourceRank(row) > sourceRank(prev)) {
      dedup.set(key, row);
    }
  }

  const finalRows = [...dedup.values()];

  console.log("=== FINAL PRODUCTION LOCATION APPLY v4 ===");
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

  console.log("");
  console.log(`APPLIED VERIFIED LOCATION ROWS: ${applied}`);
  console.log(`HELD BACK / NOT WRITTEN: ${held.length}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
