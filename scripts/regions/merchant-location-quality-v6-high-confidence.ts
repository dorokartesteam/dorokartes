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

function postals(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b(\d{3})\s?(\d{2})\b/g)].map(m => `${m[1]}${m[2]}`)
  )];
}

function streetNumbers(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b\d{1,4}(?:-\d{1,4})?[α-ωa-z]?\b/g)].map(m => m[0])
  )];
}

function sourceIntent(url?: string | null) {
  return /contact|store|stores|storelocator|location|locations|katast|epikoin|showroom|boutique|find-us|where-we-are|our-store/i.test(url || "");
}

function streetHint(v?: string | null) {
  const t = norm(v);
  const hints = [
    "street","str","avenue","ave","road","rd","square","leof","leoforos",
    "οδος","οδ","λεωφ","λεωφορος","πλατ","ermou","tsimiski","stadiou",
    "mitropoleos","patreos","karaiskou","papandreou","solonos","venizelou",
    "makariou","kolokotroni","papanastasiou","lampraki","kifisias",
    "vouliagmenis","syggrou","monastiriou","agias","aghiou","agion"
  ];
  return hints.some(h => t.includes(h));
}

function explicitStoreMarker(v?: string | null) {
  const t = norm(v);
  return [
    "καταστημα","κατάστημα","store","shop","showroom","boutique",
    "visit us","find us","physical address","διευθυνση καταστηματος",
    "διεύθυνση καταστήματος"
  ].some(x => t.includes(norm(x)));
}

function placeholderSignal(v?: string | null) {
  const t = norm(v);
  return [
    "οδος παραδειγμα","οδός παράδειγμα","example street","no name",
    "210 0000000","2100000000","test address","dummy"
  ].some(x => t.includes(norm(x)));
}

function legalOnlySignal(v?: string | null) {
  const t = norm(v);
  return [
    "φορολογικη εδρα","φορολογική έδρα","registered office",
    "registered address","ατομικης επιχειρησης","ατομικής επιχείρησης",
    "vat number","trade number","γεμη","γ.ε.μη"
  ].some(x => t.includes(norm(x)));
}

function multiAddress(v?: string | null) {
  const raw = v || "";
  if (postals(raw).length >= 2) return true;

  const t = norm(raw);
  const markers =
    (t.match(/\baddress\b/g) || []).length +
    (t.match(/\bstreet\b/g) || []).length +
    (t.match(/\bstore\b/g) || []).length +
    (t.match(/\bshop\b/g) || []).length +
    (t.match(/\bδιευθυνση\b/g) || []).length;

  return markers >= 2 && streetNumbers(raw).length >= 2 && raw.length > 120;
}

function weak(v?: string | null) {
  const raw = v || "";
  const pcs = postals(raw);
  const nums = streetNumbers(raw);
  const hint = streetHint(raw);

  if (pcs.length !== 1) return true;
  if (!nums.length) return true;
  if (!hint && !explicitStoreMarker(raw)) return true;

  return false;
}

function sourceAllowed(row: Row) {
  if (row.sourceType === "MAP_LINK") return true;
  if (sourceIntent(row.sourceUrl)) return true;

  // JSON-LD from homepage is accepted only when it looks like a precise physical address.
  if (row.sourceType === "JSON_LD") {
    return postals(row.addressLine).length === 1 &&
      streetNumbers(row.addressLine).length > 0 &&
      streetHint(row.addressLine);
  }

  return false;
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v5-structural.json",
  );

  const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as { rows: Row[] };
  const source = input.rows.filter(r => r.reviewDecision === "SAFE");

  const rows = source.map(row => {
    if (!row.addressLine || !row.city || !row.sourceUrl) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Missing city/address/source"] };
    }

    if (placeholderSignal(row.addressLine)) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Placeholder/dummy address signal"] };
    }

    if (multiAddress(row.addressLine)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Multiple addresses collapsed into one row"] };
    }

    if (legalOnlySignal(row.addressLine) && !explicitStoreMarker(row.addressLine)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Legal/HQ address without customer-facing store evidence"] };
    }

    if (weak(row.addressLine)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Address is not strong enough for high-confidence apply"] };
    }

    if (!sourceAllowed(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Source page is not sufficiently location-oriented"] };
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
    version: "6-high-confidence",
    inputV5SafeRows: source.length,
    summary,
    rows,
  };

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v6-high-confidence.json",
  );

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v6 HIGH CONFIDENCE ===");
  console.log(`Input v5 SAFE rows: ${source.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
