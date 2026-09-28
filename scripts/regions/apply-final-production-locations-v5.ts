import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");
type Row = any;

const HARD_HOLD = new Set([
  "Nextsystems","Treatwell","Winewalkers","for Stay in Greece",
  "Superstrom","Greenmall","Mercato",
]);

const BLOCK_MERCHANT_URL: Array<[RegExp, RegExp]> = [
  [/^Anastasiasstore$/i, /%cf%86%cf%8c%cf%81%ce%bc%ce%b1-%ce%b5%cf%80%ce%b9%cf%83%cf%84%cf%81%ce%bf%cf%86/i],
  [/^Djmania$/i, /mikra-hxeia|egkatastaseis/i],
  [/^Fan Pharmacy$/i, /product-category/i],
  [/^Kounelis$/i, /skaptika|frezes|katastrofeis/i],
];

const WEAK_PAGE_RE =
  /(blog|article|news|returns?|refund|policy|policies|shipping|terms|privacy|product-category)/i;

function norm(v:string) {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
function clean(v:string) {
  return (v || "").replace(/\s+/g," ").trim();
}
function postal(v:string) {
  const m = String(v || "").match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

const LOCALITIES:Array<[string[],string]> = [
  [["νεα σμυρνη","nea smyrni","nea smirni"],"Νέα Σμύρνη"],
  [["νεα ερυθραια","nea erythraia"],"Νέα Ερυθραία"],
  [["παλαιο φαληρο","palaio faliro"],"Παλαιό Φάληρο"],
  [["αγιος δημητριος","agios dimitrios"],"Άγιος Δημήτριος"],
  [["νεο ηρακλειο","neo irakleio"],"Νέο Ηράκλειο"],
  [["ελληνικο","elliniko"],"Ελληνικό"],
  [["κερκυρα","kerkyra","corfu"],"Κέρκυρα"],
  [["μυκονος","mykonos","mikonos"],"Μύκονος"],
  [["γλυφαδα","glyfada"],"Γλυφάδα"],
  [["μαρουσι","marousi"],"Μαρούσι"],
  [["χαλανδρι","chalandri"],"Χαλάνδρι"],
  [["περιστερι","peristeri"],"Περιστέρι"],
  [["νεα ιωνια","nea ionia"],"Νέα Ιωνία"],
  [["κορωπι","koropi"],"Κορωπί"],
  [["κηφισια","kifisia"],"Κηφισιά"],
  [["καλαμαρια","kalamaria"],"Καλαμαριά"],
  [["θερμη","thermi"],"Θέρμη"],
  [["ευοσμος","evosmos"],"Εύοσμος"],
  [["πειραιας","πειραια","piraeus"],"Πειραιάς"],
  [["θεσσαλονικη","thessaloniki"],"Θεσσαλονίκη"],
  [["χανια","chania"],"Χανιά"],
  [["ηρακλειο κρητης","heraklion","iraklio"],"Ηράκλειο"],
  [["πατρα","patra"],"Πάτρα"],
  [["ιωαννινα","ioannina"],"Ιωάννινα"],
  [["σερρες","serres"],"Σέρρες"],
  [["καρδιτσα","karditsa"],"Καρδίτσα"],
  [["κορινθος","corinth","korinth"],"Κόρινθος"],
  [["ναυπλιο","nafplio"],"Ναύπλιο"],
  [["σπαρτη","sparti"],"Σπάρτη"],
  [["καλαματα","kalamata"],"Καλαμάτα"],
  [["χιος","chios"],"Χίος"],
  [["αθηνα","athens"],"Αθήνα"],
];

function explicitLocality(address:string):string|null {
  const a = norm(address);
  const chiosAllowed = a.includes("chios") || a.includes("χιος") || a.includes("82100");
  for (const [aliases,city] of LOCALITIES) {
    if (city === "Χίος" && !chiosAllowed) continue;
    if (aliases.some(x => a.includes(norm(x)))) return city;
  }
  return null;
}

function resolveCity(address:string,current:string|null):string|null {
  return explicitLocality(address) || current || null;
}

function sourceRank(row:Row) {
  let score = row.sourceType === "MAP_LINK" ? 300 : row.sourceType === "PAGE_TEXT" ? 200 : 100;
  const u = String(row.sourceUrl || "");
  if (/(stores?|storelocator|store-locator|katast|contact|epikoin|επικοινων)/i.test(u)) score += 40;
  if (WEAK_PAGE_RE.test(u)) score -= 100;
  if (clean(row.addressLine || "").length < 180) score += 10;
  return score;
}

function streetNumberNearPostal(address:string) {
  const a = clean(address);
  const pm = a.match(/\b\d{3}\s?\d{2}\b/);

  const target = pm ? a.slice(Math.max(0, (pm.index || 0) - 90), pm.index) : a.slice(0,140);
  const nums = [...target.matchAll(/\b(\d{1,3}[A-Za-zΑ-Ωα-ω]?)\b/g)]
    .map(m => m[1])
    .filter(x => {
      const n = parseInt(x,10);
      return n > 0 && n < 500;
    });

  return nums.length ? nums[nums.length - 1] : "";
}

function collapsed(row:Row) {
  const a = clean(row.addressLine || "");
  if (row.merchant === "Alouette" &&
      /Ηρώων Πολυτεχνείου 58/i.test(a) &&
      /Ηρώων Πολυτεχνείου 35/i.test(a)) return true;

  const ps = [...new Set((a.match(/\b\d{3}\s?\d{2}\b/g)||[]).map(x=>x.replace(/\s/g,"")))];
  return ps.length >= 2;
}

function holdReason(row:Row):string|null {
  if (HARD_HOLD.has(row.merchant)) return "Known ambiguous merchant";

  for (const [m,u] of BLOCK_MERCHANT_URL)
    if (m.test(String(row.merchant || "")) && u.test(String(row.sourceUrl || "")))
      return "Known weak/non-location source URL";

  if (row.sourceType === "PAGE_TEXT" && WEAK_PAGE_RE.test(String(row.sourceUrl || "")))
    return "Weak PAGE_TEXT source";

  if (collapsed(row)) return "Collapsed multiple physical addresses";
  if (!row._resolvedCity) return "Could not resolve city safely";

  if (row.merchant === "Thebabycity" && !/\b551\s?33\b/.test(String(row.addressLine || "")))
    return "TheBabyCity row lacks actual street address";

  if (row.merchant === "Tacticalstore" && !/Μεσολογγίου|Mesologgi/i.test(String(row.addressLine || "")))
    return "Tacticalstore duplicate without street address";

  return null;
}

function exactPointKey(row:Row) {
  const a = clean(row.addressLine || "");
  return [
    row.merchantId,
    norm(row._resolvedCity),
    postal(a),
    norm(streetNumberNearPostal(a))
  ].join("|");
}

function tokens(address:string) {
  return new Set(norm(address)
    .replace(/\d+/g," ")
    .split(/[^\p{L}]+/u)
    .filter(x => x.length >= 4)
    .slice(0,40));
}

function overlap(a:string,b:string) {
  const A=tokens(a), B=tokens(b);
  if (!A.size || !B.size) return 0;
  let hit=0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / Math.min(A.size,B.size);
}

function normalizedKey(row:Row) {
  return norm(`${row._resolvedCity}|${clean(row.addressLine || "")}`)
    .replace(/[^\p{L}\p{N}]+/gu,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"");
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const report = JSON.parse(await fs.readFile(
    path.resolve(process.cwd(),"reports","regions","merchant-location-production-gate-v1.json"),
    "utf8"
  ));

  const input:Row[] = (report.productionSafe || []).map((r:Row)=>({
    ...r,
    _resolvedCity: resolveCity(String(r.addressLine || ""), r.city || null),
  }));

  const held:any[] = [];
  const candidates:Row[] = [];

  for (const row of input) {
    const why=holdReason(row);
    if (why) held.push({...row,holdReason:why});
    else candidates.push(row);
  }

  // Pass 1: exact physical point.
  const p1=new Map<string,Row>();
  for (const row of candidates) {
    const k=exactPointKey(row);
    const prev=p1.get(k);
    if (!prev || sourceRank(row)>sourceRank(prev)) p1.set(k,row);
  }

  // Pass 2: same merchant/city/postal with highly overlapping address text.
  const final:Row[]=[];
  for (const row of p1.values()) {
    const a=clean(row.addressLine || "");
    const p=postal(a);

    const idx=final.findIndex(x =>
      x.merchantId===row.merchantId &&
      norm(x._resolvedCity)===norm(row._resolvedCity) &&
      postal(clean(x.addressLine||""))===p &&
      p !== "" &&
      overlap(clean(x.addressLine||""),a) >= 0.45
    );

    if (idx<0) final.push(row);
    else if (sourceRank(row)>sourceRank(final[idx])) final[idx]=row;
  }

  console.log("=== FINAL PRODUCTION LOCATION APPLY v5 ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Input PRODUCTION_SAFE rows: ${input.length}`);
  console.log(`Held back: ${held.length}`);
  console.log(`After final dedupe: ${final.length}`);

  console.log("\n=== HELD BACK ===");
  console.table(held.map(r=>({
    merchant:r.merchant,
    city:r.city,
    resolvedCity:r._resolvedCity,
    reason:r.holdReason
  })));

  console.log("\n=== FINAL WRITE PREVIEW ===");
  console.table(final.map(r=>({
    merchant:r.merchant,
    city:r._resolvedCity,
    sourceType:r.sourceType,
    address:clean(r.addressLine||"")
  })));

  if (!APPLY) {
    console.log("\nDRY RUN ONLY — database unchanged.");
    await prisma.$disconnect();
    return;
  }

  let applied=0;
  for (const row of final) {
    const addressLine=clean(row.addressLine||"");
    const nk=normalizedKey(row);

    await prisma.merchantLocation.upsert({
      where:{
        merchantId_normalizedKey:{
          merchantId:row.merchantId,
          normalizedKey:nk
        }
      },
      create:{
        merchantId:row.merchantId,
        label:row.label ?? null,
        countryCode:"GR",
        administrativeArea:row.administrativeArea ?? null,
        city:row._resolvedCity,
        area:row.area ?? null,
        addressLine,
        postalCode:row.postalCode || postal(addressLine) || null,
        latitude:row.latitude ?? null,
        longitude:row.longitude ?? null,
        normalizedKey:nk,
        sourceUrl:row.sourceUrl,
        sourceExcerpt:row.sourceExcerpt ?? null,
        active:true,
        verificationStatus:"VERIFIED",
        lastVerifiedAt:new Date(),
      },
      update:{
        label:row.label ?? null,
        administrativeArea:row.administrativeArea ?? null,
        city:row._resolvedCity,
        area:row.area ?? null,
        addressLine,
        postalCode:row.postalCode || postal(addressLine) || null,
        latitude:row.latitude ?? null,
        longitude:row.longitude ?? null,
        sourceUrl:row.sourceUrl,
        sourceExcerpt:row.sourceExcerpt ?? null,
        active:true,
        verificationStatus:"VERIFIED",
        lastVerifiedAt:new Date(),
      }
    });

    applied++;
  }

  console.log(`\nAPPLIED VERIFIED LOCATION ROWS: ${applied}`);
  console.log(`HELD BACK / NOT WRITTEN: ${held.length}`);
  await prisma.$disconnect();
}

main().catch(err=>{
  console.error(err);
  process.exitCode=1;
});
