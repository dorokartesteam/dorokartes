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

function host(url?: string | null) {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function sameDomain(a?: string | null, b?: string | null) {
  const x = host(a), y = host(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

function postals(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b(\d{3})\s?(\d{2})\b/g)].map(m => `${m[1]}${m[2]}`)
  )];
}

function numbers(v?: string | null) {
  return [...new Set(
    [...norm(v).matchAll(/\b\d{1,4}(?:-\d{1,4})?\b/g)].map(m => m[0])
  )];
}

function hasStreetHint(v?: string | null) {
  const t = norm(v);
  const hints = [
    "street","str."," str ","avenue","ave.","road","rd.","square",
    "οδος","οδ.","λεωφ","λεωφορος","πλατ","διευθυνση","address",
    "tsimiski","ermou","stadiou","mitropoleos","patreos","karaiskou",
    "komninon","kolokotroni","syggrou","vouliagmenis","solonos",
    "papandreou","makariou","ethnikis amynis","agias sofias"
  ];
  return hints.some(h => t.includes(norm(h)));
}

function sourceIntent(url?: string | null) {
  const t = norm(url);
  return /contact|store|stores|storelocator|location|locations|katast|epikoin|showroom|boutique|find-us|where-we-are/.test(t);
}

function foreignSignal(v?: string | null) {
  const t = norm(v);
  const signals = [
    "berlin","germany","deutschland","united states"," usa","georgia 306",
    "athens georgia","united kingdom","london uk","cyprus","nicosia",
    "limassol","lefkosia","strovolos","στρόβολος","λευκωσια","λευκωσία",
    "paris france","milan italy","roma italy","rome italy","sofia bulgaria"
  ];
  return signals.find(x => t.includes(norm(x))) || null;
}

function narrativeSignal(v?: string | null) {
  const t = norm(v);
  const signals = [
    "began construction","history","historical","hometown","born in",
    "years of experience","we are","we have","our story","about us",
    "welcome to","located minutes from","major gateway","cities of",
    "can satisfy","award winning","leading","celebrating","discover",
    "experience","journey","travel","city is not simply our address"
  ];
  return signals.find(x => t.includes(norm(x))) || null;
}

function explicitAddressMarker(v?: string | null) {
  const t = norm(v);
  return [
    "address:","address ","διευθυνση","διεύθυνση","location:",
    "τοποθεσια","τοποθεσία","visit us","find us","εδρα","έδρα",
    "physical address","shop ","store "
  ].some(x => t.includes(norm(x)));
}

function multipleAddresses(v?: string | null) {
  const text = v || "";
  const pcs = postals(text);
  if (pcs.length >= 2) return true;

  const t = norm(text);
  const markerCount =
    (t.match(/\baddress\b/g) || []).length +
    (t.match(/\bshop\b/g) || []).length +
    (t.match(/\bstore\b/g) || []).length +
    (t.match(/\bδιευθυνση\b/g) || []).length;

  return markerCount >= 2 && numbers(text).length >= 2 && text.length > 140;
}

function cityLooksEmbedded(row: Row) {
  if (!row.city) return false;
  const c = norm(row.city);
  const text = norm(`${row.addressLine || ""} ${row.sourceExcerpt || ""}`);
  return !!c && text.includes(c);
}

function strongPhysicalAddress(row: Row) {
  const text = row.addressLine || "";
  const pc = postals(text).length > 0;
  const num = numbers(text).length > 0;
  const hint = hasStreetHint(text);
  const marker = explicitAddressMarker(text);

  return (pc && num) || (pc && hint) || (num && hint) || (pc && marker);
}

function suspiciousJsonLd(row: Row) {
  const text = norm(row.addressLine);
  if (text.includes("[object object]")) return true;
  return false;
}

function rowScore(row: Row) {
  let s = 0;
  if (row.sourceType === "JSON_LD") s += 6;
  if (row.sourceType === "MAP_LINK") s += 5;
  if (row.sourceType === "PAGE_TEXT") s += 2;
  if (sourceIntent(row.sourceUrl)) s += 5;
  if (postals(row.addressLine).length) s += 3;
  if (numbers(row.addressLine).length) s += 2;
  if (hasStreetHint(row.addressLine)) s += 2;
  if (explicitAddressMarker(row.addressLine)) s += 2;
  if (row.latitude != null && row.longitude != null) s += 2;
  return s;
}

function tokenSet(v?: string | null) {
  const stop = new Set([
    "athens","thessaloniki","chania","piraeus","greece","mykonos","santorini",
    "street","str","avenue","road","address","contact","store","stores","location",
    "αθηνα","θεσσαλονικη","χανια","πειραιας","μυκονος","σαντορινη"
  ]);
  return new Set(
    norm(v)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(x => x.length >= 3 && !stop.has(x) && !/^\d+$/.test(x))
  );
}

function similarity(a?: string | null, b?: string | null) {
  const A = tokenSet(a), B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  const i = [...A].filter(x => B.has(x)).length;
  return i / Math.min(A.size, B.size);
}

function duplicate(a: Row, b: Row) {
  if (a.merchantId !== b.merchantId) return false;
  if (norm(a.city) !== norm(b.city)) return false;

  const pa = postals(a.addressLine), pb = postals(b.addressLine);
  const samePostal = pa.some(x => pb.includes(x));

  const na = numbers(a.addressLine), nb = numbers(b.addressLine);
  const sameNum = na.some(x => nb.includes(x));

  const sim = similarity(a.addressLine, b.addressLine);

  return (samePostal && sim >= .2) || (samePostal && sameNum) || (sameNum && sim >= .5);
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v2-discovery.json",
  );

  const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as { rows: Row[] };
  const source = input.rows.filter(r => r.reviewDecision === "SAFE");

  const rows = source.map(row => {
    const reasons: string[] = [];
    const evidence = `${row.addressLine || ""} ${row.sourceExcerpt || ""}`;

    if (!row.sourceUrl || !row.addressLine || !row.city) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Missing source/address/city"] };
    }

    if (!sameDomain(row.sourceUrl, row.websiteUrl)) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: ["Source is outside official merchant domain"] };
    }

    const foreign = foreignSignal(evidence);
    if (foreign) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: [`Foreign-location signal: ${foreign}`] };
    }

    if (multipleAddresses(row.addressLine)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Multiple physical addresses collapsed into one row"] };
    }

    if (row.sourceType === "JSON_LD") {
      if (suspiciousJsonLd(row)) {
        return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Malformed JSON-LD address"] };
      }

      if (!strongPhysicalAddress(row)) {
        return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["JSON-LD address is incomplete"] };
      }

      return { ...row, reviewDecision: "SAFE" as Decision, reasons };
    }

    if (row.sourceType === "MAP_LINK") {
      if (!strongPhysicalAddress(row)) {
        return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Map-link evidence is incomplete"] };
      }
      return { ...row, reviewDecision: "SAFE" as Decision, reasons };
    }

    // PAGE_TEXT: be deliberately stricter.
    const narrative = narrativeSignal(evidence);
    if (narrative && !explicitAddressMarker(row.addressLine) && !sourceIntent(row.sourceUrl)) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: [`Narrative/non-address text: ${narrative}`] };
    }

    if (!strongPhysicalAddress(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Page-text address is incomplete"] };
    }

    if (!sourceIntent(row.sourceUrl) && !explicitAddressMarker(row.addressLine)) {
      // Homepage/about-page extraction is allowed only with very strong structure.
      const hasPc = postals(row.addressLine).length > 0;
      const hasNum = numbers(row.addressLine).length > 0;
      const hasHint = hasStreetHint(row.addressLine);

      if (!(hasPc && hasNum && hasHint)) {
        return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Page is not location-intent and evidence is not strong enough"] };
      }
    }

    // Avoid city-name mentions from prose where city was inferred from unrelated text.
    if (!cityLooksEmbedded(row) && row.sourceType === "PAGE_TEXT" && !sourceIntent(row.sourceUrl)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["City is not explicit in address evidence"] };
    }

    return { ...row, reviewDecision: "SAFE" as Decision, reasons };
  });

  // Deduplicate final SAFE rows.
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].reviewDecision !== "SAFE") continue;

    const group = [i];

    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].reviewDecision !== "SAFE") continue;
      if (duplicate(rows[i], rows[j])) group.push(j);
    }

    if (group.length <= 1) continue;

    group.sort((a, b) => rowScore(rows[b]) - rowScore(rows[a]));
    const keep = group[0];

    for (const idx of group.slice(1)) {
      rows[idx].reviewDecision = "REJECT";
      rows[idx].reasons = [
        `Duplicate location; stronger candidate kept from ${rows[keep].sourceUrl}`,
      ];
    }
  }

  const summary = rows.reduce<Record<Decision, number>>(
    (acc, row) => {
      acc[row.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    version: "3-strict",
    inputV2SafeRows: source.length,
    summary,
    rows,
  };

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v3-strict.json",
  );

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v3 STRICT ===");
  console.log(`Input v2 SAFE rows: ${source.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
