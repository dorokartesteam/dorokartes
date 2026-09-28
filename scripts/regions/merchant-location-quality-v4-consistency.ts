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

function postal(v?: string | null) {
  const m = norm(v).match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

function sourceIntent(url?: string | null) {
  return /contact|store|stores|storelocator|location|locations|katast|epikoin|showroom|boutique|find-us|where-we-are/i.test(url || "");
}

function explicitAddress(v?: string | null) {
  const t = norm(v);
  return [
    "address", "διευθυνση", "διεύθυνση", "τοποθεσια", "τοποθεσία",
    "physical address", "visit us", "find us", "καταστημα", "κατάστημα",
    "εδρα", "έδρα"
  ].some(x => t.includes(norm(x)));
}

const CITY_ALIASES: Record<string, string[]> = {
  "Αθήνα": ["athens","athina","αθηνα","αθήνα"],
  "Πειραιάς": ["piraeus","pireas","πειραιας","πειραιάς"],
  "Θεσσαλονίκη": ["thessaloniki","θεσσαλονικη","θεσσαλονίκη"],
  "Πάτρα": ["patra","patras","πατρα","πάτρα"],
  "Ηράκλειο": ["heraklion","iraklio","ηρακλειο","ηράκλειο"],
  "Χανιά": ["chania","χανια","χανιά"],
  "Ρέθυμνο": ["rethymno","ρεθυμνο","ρέθυμνο"],
  "Λάρισα": ["larissa","larisa","λαρισα","λάρισα"],
  "Βόλος": ["volos","βολος","βόλος"],
  "Ιωάννινα": ["ioannina","ιωαννινα","ιωάννινα"],
  "Καλαμάτα": ["kalamata","καλαματα","καλαμάτα"],
  "Κόρινθος": ["corinth","korinthos","κορινθος","κόρινθος"],
  "Χαλκίδα": ["chalkida","halkida","χαλκιδα","χαλκίδα"],
  "Σέρρες": ["serres","serrai","σερρες","σέρρες"],
  "Καβάλα": ["kavala","καβαλα","καβάλα"],
  "Αλεξανδρούπολη": ["alexandroupoli","alexandroupolis","αλεξανδρουπολη","αλεξανδρούπολη"],
  "Κέρκυρα": ["corfu","kerkyra","κερκυρα","κέρκυρα"],
  "Ρόδος": ["rhodes","rodos","ροδος","ρόδος"],
  "Μύκονος": ["mykonos","myconos","μυκονος","μύκονος"],
  "Σαντορίνη": ["santorini","thira","thera","σαντορινη","σαντορίνη","θηρα","θήρα"],
};

const CONFLICT_LOCALITIES: Record<string, string[]> = {
  "Αθήνα": [
    "nea ionia","nea smyrni","marousi","glyfada","chalandri","peristeri","aigaleo",
    "kifissia","alimos","galatsi","koropi","metamorfosi","korydallos","argyroupoli",
    "νεα ιωνια","νεα σμυρνη","μαρουσι","γλυφαδα","χαλανδρι","περιστερι","αιγαλεω",
    "κηφισια","αλιμος","γαλατσι","κορωπι","μεταμορφωση","κορυδαλλος","αργυρουπολη"
  ],
  "Θεσσαλονίκη": ["kalamaria","pylaia","evosmos","sykies","thermi","καλαμαρια","πυλαια","ευοσμος","συκιες","θερμη"],
};

const FOREIGN = [
  "berlin","germany","cyprus","nicosia","limassol","strovolos","λευκωσια","λευκωσία","στρόβολος",
  "united states","usa","georgia 306","athens georgia","london","united kingdom"
];

function cityAliasPresent(row: Row) {
  const text = norm(`${row.addressLine || ""} ${row.sourceExcerpt || ""}`);
  const aliases = CITY_ALIASES[row.city || ""] || [norm(row.city)];
  return aliases.some(a => a && text.includes(norm(a)));
}

function contradictoryCity(row: Row) {
  const text = norm(`${row.addressLine || ""} ${row.sourceExcerpt || ""}`);

  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if (city === row.city) continue;
    if (aliases.some(a => text.includes(norm(a)))) {
      return city;
    }
  }

  return null;
}

function foreignSignal(row: Row) {
  const text = norm(`${row.addressLine || ""} ${row.sourceExcerpt || ""}`);
  return FOREIGN.find(x => text.includes(norm(x))) || null;
}

function obviouslyWrongPostal(row: Row) {
  const pc = postal(row.addressLine) || (row.postalCode || "").replace(/\s+/g, "");
  if (!/^\d{5}$/.test(pc)) return null;

  const prefix = Number(pc.slice(0, 3));

  const expected: Record<string, Array<[number, number]>> = {
    "Αθήνα": [[100,199]],
    "Πειραιάς": [[180,189]],
    "Θεσσαλονίκη": [[540,575]],
    "Πάτρα": [[250,269]],
    "Ηράκλειο": [[700,715]],
    "Χανιά": [[730,739]],
    "Ρέθυμνο": [[740,749]],
    "Λάρισα": [[400,419]],
    "Βόλος": [[370,389]],
    "Ιωάννινα": [[450,459]],
    "Καλαμάτα": [[240,249]],
    "Κόρινθος": [[200,209]],
    "Χαλκίδα": [[340,349]],
    "Σέρρες": [[620,629]],
    "Καβάλα": [[650,659]],
    "Αλεξανδρούπολη": [[680,689]],
    "Κέρκυρα": [[490,499]],
    "Ρόδος": [[850,859]],
    "Μύκονος": [[840,849]],
    "Σαντορίνη": [[840,849]],
  };

  const ranges = expected[row.city || ""];
  if (!ranges) return null;

  const ok = ranges.some(([a,b]) => prefix >= a && prefix <= b);
  return ok ? null : pc;
}

function weakPageText(row: Row) {
  if (row.sourceType !== "PAGE_TEXT") return false;
  if (sourceIntent(row.sourceUrl)) return false;
  if (explicitAddress(row.addressLine)) return false;
  return true;
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v3-strict.json",
  );

  const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as { rows: Row[] };
  const source = input.rows.filter(r => r.reviewDecision === "SAFE");

  const rows = source.map(row => {
    const reasons: string[] = [];

    const foreign = foreignSignal(row);
    if (foreign) {
      return { ...row, reviewDecision: "REJECT" as Decision, reasons: [`Foreign location signal: ${foreign}`] };
    }

    const conflict = contradictoryCity(row);
    if (conflict) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: [`Address text also references another city: ${conflict}`] };
    }

    const badPostal = obviouslyWrongPostal(row);
    if (badPostal) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: [`Postal code ${badPostal} is inconsistent with ${row.city}`] };
    }

    if (!cityAliasPresent(row) && row.sourceType === "PAGE_TEXT") {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["Canonical city is not explicit in PAGE_TEXT evidence"] };
    }

    if (weakPageText(row)) {
      return { ...row, reviewDecision: "REVIEW" as Decision, reasons: ["PAGE_TEXT source is not location-intent and has no explicit address marker"] };
    }

    return { ...row, reviewDecision: "SAFE" as Decision, reasons };
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
    version: "4-consistency",
    inputV3SafeRows: source.length,
    summary,
    rows,
  };

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-v4-consistency.json",
  );

  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v4 CONSISTENCY ===");
  console.log(`Input v3 SAFE rows: ${source.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
