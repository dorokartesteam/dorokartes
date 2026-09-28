import fs from "node:fs/promises";
import path from "node:path";

type Row = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string;
  sourceUrl: string;
  sourceType: "JSON_LD" | "MAP_LINK" | "PAGE_TEXT";
  label: string | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision: string;
  reasons: string[];
  confidence: number;
};

type Verdict = "STRICT_SAFE" | "REVIEW" | "REJECT";
type OutRow = Row & { qualityVerdict: Verdict; qualityReasons: string[]; qualityScore: number };

const FOREIGN_RE =
  /\b(berlin|germany|deutschland|london|united kingdom|uk\b|united states|usa\b|austin\b|texas\b|new york|cyprus|nicosia|limassol|meuspath|rudolf-diesel|italy|france|spain|netherlands)\b/i;

const NON_STORE_RE =
  /\b(parking|headquarters?|registered office|warehouse|factory|distribution center|returns?|billing|p\.?\s*o\.?\s*box|post office box|κεντρικ[ήη]\s+διοίκηση|αποθήκη|εργοστάσιο|παραγωγή)\b/i;

const PLACEHOLDER_RE =
  /(\[object Object\]|no name|example|dummy|placeholder|οδός παράδειγμα|210\s*0000000|\bA1\b)/i;

const COORD_ONLY_RE =
  /^(?:directions?|get directions?)?\s*-?\d{1,2}\.\d{3,}\s*[, ]\s*-?\d{1,3}\.\d{3,}\s*$/i;

const URL_IN_ADDRESS_RE = /https?:\/\/|maps\.app\.goo\.gl|google\.com\/maps/i;
const POSTAL_RE = /\b(\d{3})\s?(\d{2})\b/g;

const STRONG_SOURCE_RE =
  /(store|stores|store-locator|storelocator|katast|katasth|καταστ|locations?|find-us|our-store|showroom|boutique|contact|epikoin|επικοινων|sitemap\/katastima|to-katastima)/i;

const CUSTOMER_RE =
  /(κατάστημα|καταστημα|store|shop|showroom|boutique|clinic|spa|restaurant|cafe|hotel|resort|studio|γυμναστήριο|fitness|visit us|find us|ωράριο|opening hours|retail park|σημείο πώλησης|point of sale|venue|outlet|flagship)/i;

const CITY_ALIASES: Array<[string, string[]]> = [
  ["Αθήνα", ["athens","αθηνα"]],
  ["Πειραιάς", ["piraeus","πειραι"]],
  ["Θεσσαλονίκη", ["thessaloniki","θεσσαλον"]],
  ["Πάτρα", ["patra","πατρα"]],
  ["Ηράκλειο", ["heraklion","iraklio","ηρακλει"]],
  ["Χανιά", ["chania","χανια"]],
  ["Ρέθυμνο", ["rethymno","ρεθυμνο"]],
  ["Λάρισα", ["larisa","λαρισ"]],
  ["Βόλος", ["volos","βολο"]],
  ["Ιωάννινα", ["ioannina","ιωαννινα"]],
  ["Καλαμάτα", ["kalamata","καλαματα"]],
  ["Σέρρες", ["serres","σερρ"]],
  ["Καβάλα", ["kavala","καβαλα"]],
  ["Αλεξανδρούπολη", ["alexandroupoli","αλεξανδρουπο"]],
  ["Ρόδος", ["rhodes","rodos","ροδο"]],
  ["Μύκονος", ["mykonos","mikonos","μυκονο"]],
  ["Σαντορίνη", ["santorini","θηρα","σαντοριν"]],
  ["Χαλκίδα", ["chalkida","χαλκιδ"]],
  ["Σπάρτη", ["sparti","σπαρτη"]],
  ["Καρδίτσα", ["karditsa","καρδιτσ"]],
  ["Ναύπλιο", ["nafplio","ναυπλιο"]],
  ["Κόρινθος", ["corinth","korinth","κορινθ"]],
  ["Φλώρινα", ["florina","φλωριν"]],
  ["Μαρούσι", ["marousi","μαρουσι"]],
  ["Χαλάνδρι", ["chalandri","xalandri","χαλανδρι"]],
  ["Καλλιθέα", ["kallithea","καλλιθεα"]],
  ["Περιστέρι", ["peristeri","περιστερ"]],
  ["Νέα Ιωνία", ["nea ionia","νεα ιωνια"]],
  ["Ηλιούπολη", ["ilioupoli","ηλιουπο"]],
  ["Γλυφάδα", ["glyfada","γλυφαδ"]],
  ["Κηφισιά", ["kifisia","κηφισ"]],
  ["Ελευσίνα", ["elefsina","eleusina","ελευσιν"]],
  ["Σπάτα", ["spata","σπατα"]],
  ["Κορωπί", ["koropi","κορωπ"]],
  ["Καλαμαριά", ["kalamaria","καλαμαρια"]],
  ["Εύοσμος", ["evosmos","ευοσμο"]],
  ["Θέρμη", ["thermi","θερμη"]],
  ["Ερμούπολη", ["ermoupoli","ερμουπο"]],
  ["Χίος", ["chios","χιο"]],
  ["Κέρκυρα", ["corfu","kerkyra","κερκυρα"]],
  ["Νέα Σμύρνη", ["nea smyrni","nea smirni","νεα σμυρν"]],
  ["Ελληνικό", ["elliniko","ελληνικο"]],
  ["Νέα Ερυθραία", ["nea erythraia","νεα ερυθρ"]],
];

function norm(v: string) {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function clean(v: string) {
  return (v || "").replace(/\s+/g, " ").trim();
}
function postals(v: string) {
  return [...new Set((v.match(POSTAL_RE) || []).map(x => x.replace(/\s/g, "")))];
}
function localitySignals(v: string) {
  const n = norm(v);
  const out: string[] = [];
  for (const [canonical, aliases] of CITY_ALIASES) {
    if (aliases.some(a => n.includes(norm(a)))) out.push(canonical);
  }
  return [...new Set(out)];
}
function obviousCityMismatch(city: string | null, address: string) {
  if (!city) return false;
  const c = norm(city);
  const signals = localitySignals(address).map(norm);
  if (!signals.length) return false;
  if (signals.some(s => c.includes(s) || s.includes(c))) return false;

  // Athens is an umbrella label for many Attica suburbs; do not reject those.
  if (c.includes("αθηνα") || c.includes("athens")) {
    const attica = ["μαρουσι","χαλανδρι","καλλιθεα","περιστερ","νεα ιωνια","ηλιουπο","γλυφαδ","κηφισ","σπατα","κορωπ","νεα σμυρν","ελληνικο","νεα ερυθρ","πειραι"];
    if (signals.some(s => attica.some(a => s.includes(a)))) return false;
  }
  return true;
}
function manyNumbers(v: string) {
  const nums = v.match(/\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/g) || [];
  return nums.length >= 8;
}
function collapsed(v: string) {
  return postals(v).length >= 2 || manyNumbers(v);
}
function sourceRank(t: Row["sourceType"]) {
  return t === "MAP_LINK" ? 3 : t === "JSON_LD" ? 2 : 1;
}
function coreKey(r: Row) {
  const p = postals(r.addressLine)[0] || r.postalCode || "";
  const firstNum = (r.addressLine.match(/\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/) || [""])[0];
  const loc = localitySignals(r.addressLine)[0] || r.city || "";
  return `${r.merchantId}|${norm(loc)}|${p}|${norm(firstNum)}`;
}

function classify(r: Row): OutRow {
  const reasons: string[] = [];
  const address = clean(r.addressLine);
  const blob = `${address} ${r.sourceExcerpt || ""}`;
  let score = r.confidence || 0;

  if (!address || !r.sourceUrl) {
    return { ...r, qualityVerdict: "REJECT", qualityReasons: ["Missing address/source"], qualityScore: 0 };
  }
  if (PLACEHOLDER_RE.test(blob)) {
    return { ...r, qualityVerdict: "REJECT", qualityReasons: ["Placeholder/malformed evidence"], qualityScore: 0 };
  }
  if (COORD_ONLY_RE.test(address)) {
    return { ...r, qualityVerdict: "REJECT", qualityReasons: ["Coordinates only; no postal address"], qualityScore: 0 };
  }
  if (FOREIGN_RE.test(blob) && !/\b(greece|greek|ελλάδα|ellada|crete|attica|thessaloniki|athens)\b/i.test(blob)) {
    return { ...r, qualityVerdict: "REJECT", qualityReasons: ["Foreign address contamination"], qualityScore: 0 };
  }
  if (NON_STORE_RE.test(blob)) {
    return { ...r, qualityVerdict: "REVIEW", qualityReasons: ["Parking/HQ/warehouse/PO-box/non-store signal"], qualityScore: 25 };
  }
  if (collapsed(address)) {
    return { ...r, qualityVerdict: "REVIEW", qualityReasons: ["Collapsed/multiple address signals"], qualityScore: 35 };
  }
  if (obviousCityMismatch(r.city, address)) {
    return { ...r, qualityVerdict: "REVIEW", qualityReasons: ["City/address locality mismatch"], qualityScore: 30 };
  }

  const ps = postals(address);
  const hasPostal = ps.length === 1 || !!r.postalCode;
  const hasNumber = /\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b/.test(address) || /(χλμ|km)\s*\d+/i.test(address);
  const sourceStrong = STRONG_SOURCE_RE.test(r.sourceUrl);
  const customer = CUSTOMER_RE.test(blob);
  const hasLocality = localitySignals(address).length > 0 || !!r.city;

  if (URL_IN_ADDRESS_RE.test(address)) {
    score -= 10;
    reasons.push("Address contains embedded map URL");
  }
  if (!hasPostal) {
    score -= 15;
    reasons.push("Postal code missing");
  }
  if (!hasNumber) {
    score -= 15;
    reasons.push("Street/building number missing");
  }
  if (!hasLocality) {
    score -= 15;
    reasons.push("Locality missing");
  }

  if (r.sourceType === "MAP_LINK" && sourceStrong && hasNumber && hasLocality && !URL_IN_ADDRESS_RE.test(address)) {
    return { ...r, qualityVerdict: "STRICT_SAFE", qualityReasons: ["Clean official map/store/contact evidence"], qualityScore: Math.max(score, 92) };
  }

  if (r.sourceType === "MAP_LINK" && sourceStrong && hasPostal && hasNumber && hasLocality) {
    return { ...r, qualityVerdict: "STRICT_SAFE", qualityReasons: ["Official map evidence with complete physical address"], qualityScore: Math.max(score, 90) };
  }

  if (r.sourceType === "JSON_LD" && hasPostal && hasNumber && hasLocality && !NON_STORE_RE.test(blob)) {
    return { ...r, qualityVerdict: "STRICT_SAFE", qualityReasons: ["Complete structured physical address"], qualityScore: Math.max(score, 88) };
  }

  if (r.sourceType === "PAGE_TEXT" && sourceStrong && customer && hasPostal && hasNumber && hasLocality) {
    return { ...r, qualityVerdict: "STRICT_SAFE", qualityReasons: ["Complete customer-facing address on official page"], qualityScore: Math.max(score, 86) };
  }

  return { ...r, qualityVerdict: "REVIEW", qualityReasons: reasons.length ? reasons : ["Not strong enough for strict automatic apply"], qualityScore: score };
}

async function main() {
  const p = path.resolve(process.cwd(), "reports", "regions", "merchant-location-discovery-v3-dry-run.json");
  const report = JSON.parse(await fs.readFile(p, "utf8"));

  const input: Row[] = [];
  for (const result of report.results || []) {
    for (const c of result.candidates || []) {
      if (c.decision === "SAFE_CANDIDATE") input.push(c);
    }
  }

  const classified = input.map(classify);

  // Deduplicate likely same physical point per merchant. Keep strongest evidence.
  const dedup = new Map<string, OutRow>();
  for (const r of classified) {
    const k = coreKey(r);
    const prev = dedup.get(k);
    if (!prev) {
      dedup.set(k, r);
      continue;
    }
    const verdictRank = { STRICT_SAFE: 3, REVIEW: 2, REJECT: 1 };
    const better =
      verdictRank[r.qualityVerdict] > verdictRank[prev.qualityVerdict] ||
      (verdictRank[r.qualityVerdict] === verdictRank[prev.qualityVerdict] &&
       (r.qualityScore > prev.qualityScore ||
        (r.qualityScore === prev.qualityScore && sourceRank(r.sourceType) > sourceRank(prev.sourceType))));
    if (better) dedup.set(k, r);
  }

  const rows = [...dedup.values()];
  const safe = rows.filter(r => r.qualityVerdict === "STRICT_SAFE");
  const review = rows.filter(r => r.qualityVerdict === "REVIEW");
  const reject = rows.filter(r => r.qualityVerdict === "REJECT");

  const outPath = path.resolve(process.cwd(), "reports", "regions", "merchant-location-discovery-v3-quality-v1.json");
  await fs.writeFile(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceReport: "merchant-location-discovery-v3-dry-run.json",
    inputSafeCandidates: input.length,
    dedupedCandidates: rows.length,
    summary: {
      STRICT_SAFE: safe.length,
      REVIEW: review.length,
      REJECT: reject.length,
      TOTAL: rows.length,
    },
    strictSafe: safe,
    review,
    reject,
  }, null, 2), "utf8");

  console.log("=== DISCOVERY v3 STRICT QUALITY v1 ===");
  console.log(`Input SAFE_CANDIDATE rows: ${input.length}`);
  console.log(`After dedupe: ${rows.length}`);
  console.table({
    STRICT_SAFE: safe.length,
    REVIEW: review.length,
    REJECT: reject.length,
    TOTAL: rows.length,
  });
  console.log(`Report: reports\\regions\\merchant-location-discovery-v3-quality-v1.json`);
  console.log("READ ONLY — database unchanged.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
