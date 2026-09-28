import fs from "node:fs/promises";
import path from "node:path";

type Decision = "SAFE" | "REVIEW" | "REJECT";

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
  reviewDecision: Decision;
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

function postalCodes(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b(\d{3})\s?(\d{2})\b/g)].map(m => `${m[1]}${m[2]}`)
  )];
}

function streetNumbers(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b\d{1,4}(?:-\d{1,4})?[α-ωa-z]?\b/g)].map(m => m[0])
  )];
}

function hasStreetHint(v?: string | null) {
  const t = norm(v);
  const hints = [
    "street","str","avenue","ave","road","rd","square","leof","leoforos",
    "οδος","οδ","λεωφ","λεωφορος","πλατ","agias","agios","ermou","tsimiski",
    "stadiou","mitropoleos","patreos","karaiskou","papandreou","solonos",
    "venizelou","makariou","koumoundourou","kolokotroni","papanastasiou",
    "lampraki","kifisias","vouliagmenis","syggrou","monastiriou"
  ];
  return hints.some(h => t.includes(h));
}

function explicitLocationMarker(v?: string | null) {
  const t = norm(v);
  return [
    "address","διευθυνση","διεύθυνση","physical address","store","shop",
    "καταστημα","κατάστημα","εδρα","έδρα","visit us","find us","τοποθεσια","τοποθεσία"
  ].some(x => t.includes(norm(x)));
}

function genericOnly(v?: string | null) {
  const t = norm(v);
  if (!t) return true;

  const pcs = postalCodes(v);
  const nums = streetNumbers(v);

  // "26442 Patra", "Athens 11745", "Mykonos 84600", etc.
  if (pcs.length === 1 && nums.length <= 1 && !hasStreetHint(v) && !explicitLocationMarker(v)) {
    return true;
  }

  return false;
}

function multiStoreBlob(v?: string | null) {
  const raw = v || "";
  const t = norm(raw);

  if (postalCodes(raw).length >= 2) return true;

  const knownSignals = [
    "factory outlet", "smart park", "the mall athens", "marewest",
    "mediterranean cosmos", "designer outlet", "one salonica",
    "store locator", "καταστηματα", "καταστήματα"
  ];

  let signalCount = 0;
  for (const s of knownSignals) if (t.includes(norm(s))) signalCount++;

  const cityMentions = [
    "athens","piraeus","thessaloniki","patra","larisa","volos","serres","kavala",
    "ioannina","kalamata","rhodes","chania","heraklion","rethymno","mykonos","santorini",
    "αθηνα","πειραιας","θεσσαλονικη","πατρα","λαρισα","βολος","σερρες","καβαλα",
    "ιωαννινα","καλαματα","ροδος","χανια","ηρακλειο","ρεθυμνο","μυκονος","σαντορινη"
  ];
  let cityCount = 0;
  for (const c of cityMentions) if (t.includes(norm(c))) cityCount++;

  const numberCount = streetNumbers(raw).length;

  if (signalCount >= 2 && numberCount >= 2) return true;
  if (cityCount >= 2 && numberCount >= 2 && raw.length > 120) return true;
  if (numberCount >= 4 && raw.length > 150) return true;

  return false;
}

function likelyNarrative(v?: string | null) {
  const t = norm(v);
  const signals = [
    "welcome to","our story","history","experience","located in the heart",
    "we are","we have","journey","discover","since ","years of","started in",
    "ξεκινησε","ξεκίνησε","ιστορια","ιστορία","βρισκεται στο κεντρο","βρίσκεται στο κέντρο"
  ];
  return signals.some(x => t.includes(norm(x)));
}

function structuredEnough(row: Row) {
  const addr = row.addressLine || "";
  const pc = postalCodes(addr).length > 0;
  const nums = streetNumbers(addr).length > 0;
  const street = hasStreetHint(addr);
  const marker = explicitLocationMarker(addr);

  if (row.sourceType === "JSON_LD") {
    return (pc && nums) || (nums && street) || (pc && street);
  }

  if (row.sourceType === "MAP_LINK") {
    return (pc && nums) || (nums && street) || (pc && street);
  }

  // PAGE_TEXT must be stronger.
  return (pc && nums && street) || (pc && nums && marker);
}

function suspiciousCityLabel(row: Row) {
  const c = norm(row.city);
  if (!c) return true;

  const bad = [
    "attiki","attica","greece","crete","peloponnese","thessaly","epirus",
    "αττικη","αττική","κρητη","κρήτη","ελλαδα","ελλάδα"
  ];

  return bad.includes(c);
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v4-consistency.json",
  );

  const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as { rows: Row[] };
  const source = input.rows.filter(r => r.reviewDecision === "SAFE");

  const rows = source.map(row => {
    if (!row.addressLine || !row.city) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Missing city/address"] };
    }

    if (suspiciousCityLabel(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["City field is a region/country label, not a locality"] };
    }

    if (multiStoreBlob(row.addressLine)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Multiple store/address records collapsed into one row"] };
    }

    if (genericOnly(row.addressLine)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Only city/postal evidence; no real street address"] };
    }

    if (likelyNarrative(row.addressLine) && !explicitLocationMarker(row.addressLine)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Narrative text rather than a clean address"] };
    }

    if (!structuredEnough(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Address structure is not strong enough for automatic verification"] };
    }

    return { ...row, reviewDecision: "SAFE" as Decision, reasons: [] as string[] };
  });

  const summary = rows.reduce<Record<Decision, number>>(
    (acc, row) => {
      acc[row.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    version: "5-structural",
    inputV4SafeRows: source.length,
    summary,
    rows,
  };

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v5-structural.json",
  );

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v5 STRUCTURAL ===");
  console.log(`Input v4 SAFE rows: ${source.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
