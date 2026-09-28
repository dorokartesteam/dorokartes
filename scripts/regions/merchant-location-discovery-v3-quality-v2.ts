import fs from "node:fs/promises";
import path from "node:path";

type Row = any;
type Verdict = "FINAL_SAFE" | "REVIEW" | "REJECT";

const FOREIGN_COUNTRY_RE =
  /(?:,\s*(?:DE|US|CZ|SK|UK|CY|IT|FR|ES|NL)\b)|\b(?:germany|deutschland|united states|usa|oakland|california|praha|prague|snina|slovakia|czech|herzogenaurach|berlin|meuspath|austin|texas|nicosia|limassol|cyprus)\b/i;

const BAD_POSTAL_RE =
  /\b(?:069\s?01|91074|94610|160\s?00|78702|53520)\b/;

const NON_STORE_RE =
  /\b(parking|headquarters?|registered office|warehouse|factory|distribution center|returns?|billing|p\.?\s*o\.?\s*box|post office box|κεντρικ[ήη]\s+διοίκηση|αποθήκη|εργοστάσιο|παραγωγή)\b/i;

const PLACEHOLDER_RE =
  /(\[object Object\]|no name|example|dummy|placeholder|οδός παράδειγμα|210\s*0000000|\bA1\b)/i;

const POSTAL_RE = /\b\d{3}\s?\d{2}\b/g;

function norm(v: string) {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function postals(v: string) {
  return [...new Set((v.match(POSTAL_RE) || []).map(x => x.replace(/\s/g, "")))];
}

const LOCALITY_RULES: Array<[string[], string[]]> = [
  [["ηρακλειο","heraklion","iraklio"], ["ηρακλειο","heraklion","iraklio"]],
  [["θεσσαλονικη","thessaloniki"], ["θεσσαλονικη","thessaloniki"]],
  [["πειραιας","piraeus"], ["πειραι","piraeus"]],
  [["πατρα","patra"], ["πατρα","patra"]],
  [["ροδος","rhodes","rodos"], ["ροδο","rhodes","rodos"]],
  [["χαλκιδα","chalkida"], ["χαλκιδ","chalkida"]],
  [["χανια","chania"], ["χανια","chania"]],
  [["ιωαννινα","ioannina"], ["ιωαννινα","ioannina"]],
  [["καβαλα","kavala"], ["καβαλα","kavala"]],
  [["λαρισα","larisa"], ["λαρισ","larisa"]],
  [["σερρες","serres"], ["σερρ","serres"]],
  [["καρδιτσα","karditsa"], ["καρδιτσ","karditsa"]],
  [["κορινθος","corinth","korinth"], ["κορινθ","corinth","korinth"]],
  [["ναυπλιο","nafplio"], ["ναυπλιο","nafplio"]],
  [["γλυφαδα","glyfada"], ["γλυφαδ","glyfada"]],
  [["μαρουσι","marousi"], ["μαρουσι","marousi"]],
  [["χαλανδρι","chalandri","xalandri"], ["χαλανδρι","chalandri","xalandri"]],
  [["περιστερι","peristeri"], ["περιστερ","peristeri"]],
  [["καλλιθεα","kallithea"], ["καλλιθεα","kallithea"]],
  [["νεα ιωνια","nea ionia"], ["νεα ιωνια","nea ionia"]],
  [["ευοσμος","evosmos"], ["ευοσμο","evosmos"]],
  [["θερμη","thermi"], ["θερμη","thermi"]],
  [["κηφισια","kifisia"], ["κηφισ","kifisia"]],
  [["σπαρτη","sparti"], ["σπαρτη","sparti"]],
  [["μυκονος","mykonos","mikonos"], ["μυκονο","mykonos","mikonos"]],
  [["σαντορινη","santorini"], ["σαντοριν","santorini"]],
];

function cityAddressMismatch(city: string | null, address: string) {
  if (!city) return false;
  const c = norm(city);
  const a = norm(address);

  // Athens is allowed as umbrella for Attica suburbs.
  if (c.includes("αθηνα") || c.includes("athens")) return false;

  // Special catch: "Ηράκλειο" often falsely inferred from "Λεωφόρος Ηρακλείου" / Νέο Ηράκλειο.
  if ((c.includes("ηρακλειο") || c.includes("heraklion")) &&
      /(νεα ιωνια|neo irakleio|νεο ηρακλειο|αττικ|1412\d|1423\d)/i.test(a) &&
      !/(κρητ|crete|712\d\d|713\d\d|714\d\d|715\d\d)/i.test(a)) {
    return true;
  }

  // Special catch: Rhodes false inference on Chios.
  if ((c.includes("ροδο") || c.includes("rhodes")) &&
      /(χιος|chios|82100|821\s?00)/i.test(a)) {
    return true;
  }

  for (const [cityAliases, addrAliases] of LOCALITY_RULES) {
    if (cityAliases.some(x => c.includes(norm(x)))) {
      const hasAnyKnownPlace = LOCALITY_RULES.some(([, aliases]) =>
        aliases.some(x => a.includes(norm(x)))
      );
      if (!hasAnyKnownPlace) return false;
      return !addrAliases.some(x => a.includes(norm(x)));
    }
  }

  return false;
}

function collapsedMultiAddress(address: string) {
  const ps = postals(address);
  if (ps.length >= 2) return true;

  const phoneCount = (address.match(/(?:\+?30\s*)?\b2\d{9}\b/g) || []).length;
  if (phoneCount >= 3) return true;

  const repeatedStoreWords =
    (norm(address).match(/(?:mothercare|regalinas|alouette shop|store|καταστημα)/g) || []).length;
  return repeatedStoreWords >= 3;
}

function classify(r: Row): { verdict: Verdict; reasons: string[] } {
  const address = String(r.addressLine || "");
  const blob = `${address} ${r.sourceExcerpt || ""}`;

  if (!address || !r.sourceUrl) return { verdict: "REJECT", reasons: ["Missing address/source"] };
  if (PLACEHOLDER_RE.test(blob)) return { verdict: "REJECT", reasons: ["Placeholder/malformed"] };
  if (FOREIGN_COUNTRY_RE.test(blob) || BAD_POSTAL_RE.test(blob))
    return { verdict: "REJECT", reasons: ["Foreign location/country evidence"] };
  if (NON_STORE_RE.test(blob))
    return { verdict: "REVIEW", reasons: ["Non-store/HQ/warehouse/parking signal"] };
  if (collapsedMultiAddress(address))
    return { verdict: "REVIEW", reasons: ["Collapsed/multiple physical addresses"] };
  if (cityAddressMismatch(r.city, address))
    return { verdict: "REVIEW", reasons: ["City/address locality mismatch"] };

  // malformed Greek postal: six digits like 701202
  if (/\b\d{6}\b/.test(address))
    return { verdict: "REVIEW", reasons: ["Malformed postal code"] };

  // JSON-LD must explicitly look Greek.
  if (r.sourceType === "JSON_LD") {
    const greekSignal =
      /\b(GR|Greece|Ελλάδα|Attica|Αττική|Crete|Κρήτη|Thessaloniki|Athens)\b/i.test(blob) ||
      /[\u0370-\u03FF]/.test(address);
    if (!greekSignal)
      return { verdict: "REVIEW", reasons: ["JSON-LD has no explicit Greek-country signal"] };
  }

  return { verdict: "FINAL_SAFE", reasons: ["Passed strict country/locality/structure checks"] };
}

async function main() {
  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v3-quality-v1.json"
  );

  const report = JSON.parse(await fs.readFile(p, "utf8"));
  const input: Row[] = report.strictSafe || [];

  const rows = input.map(r => {
    const c = classify(r);
    return { ...r, finalVerdict: c.verdict, finalReasons: c.reasons };
  });

  const safe = rows.filter(r => r.finalVerdict === "FINAL_SAFE");
  const review = rows.filter(r => r.finalVerdict === "REVIEW");
  const reject = rows.filter(r => r.finalVerdict === "REJECT");

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v3-quality-v2.json"
  );

  await fs.writeFile(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceReport: "merchant-location-discovery-v3-quality-v1.json",
    inputStrictSafe: input.length,
    summary: {
      FINAL_SAFE: safe.length,
      REVIEW: review.length,
      REJECT: reject.length,
      TOTAL: rows.length
    },
    finalSafe: safe,
    review,
    reject
  }, null, 2), "utf8");

  console.log("=== DISCOVERY v3 STRICT QUALITY v2 ===");
  console.log(`Input STRICT_SAFE rows: ${input.length}`);
  console.table({
    FINAL_SAFE: safe.length,
    REVIEW: review.length,
    REJECT: reject.length,
    TOTAL: rows.length
  });
  console.log(`Report: reports\\regions\\merchant-location-discovery-v3-quality-v2.json`);
  console.log("READ ONLY — database unchanged.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
