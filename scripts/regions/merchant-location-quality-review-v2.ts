import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type ReviewDecision = "SAFE" | "REVIEW" | "REJECT";

type InputRow = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  websiteUrl: string | null;
  sourceUrl: string | null;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceExcerpt: string | null;
  decision: string;
};

type CityDef = {
  canonical: string;
  administrativeArea: string;
  aliases: string[];
};

const CITY_DEFS: CityDef[] = [
  { canonical: "Αθήνα", administrativeArea: "Αττική", aliases: ["athens", "athina", "αθηνα", "αθήνα"] },
  { canonical: "Πειραιάς", administrativeArea: "Αττική", aliases: ["piraeus", "pireas", "πειραιας", "πειραιάς"] },
  { canonical: "Θεσσαλονίκη", administrativeArea: "Κεντρική Μακεδονία", aliases: ["thessaloniki", "salonica", "θεσσαλονικη", "θεσσαλονίκη"] },
  { canonical: "Πάτρα", administrativeArea: "Δυτική Ελλάδα", aliases: ["patra", "patras", "πατρα", "πάτρα"] },
  { canonical: "Ηράκλειο", administrativeArea: "Κρήτη", aliases: ["heraklion", "iraklio", "ηρακλειο", "ηράκλειο"] },
  { canonical: "Χανιά", administrativeArea: "Κρήτη", aliases: ["chania", "hania", "χανια", "χανιά"] },
  { canonical: "Ρέθυμνο", administrativeArea: "Κρήτη", aliases: ["rethymno", "rethimno", "ρεθυμνο", "ρέθυμνο"] },
  { canonical: "Λάρισα", administrativeArea: "Θεσσαλία", aliases: ["larissa", "larisa", "λαρισα", "λάρισα"] },
  { canonical: "Βόλος", administrativeArea: "Θεσσαλία", aliases: ["volos", "βολος", "βόλος"] },
  { canonical: "Ιωάννινα", administrativeArea: "Ήπειρος", aliases: ["ioannina", "yiannina", "ιωαννινα", "ιωάννινα"] },
  { canonical: "Καλαμάτα", administrativeArea: "Πελοπόννησος", aliases: ["kalamata", "καλαματα", "καλαμάτα"] },
  { canonical: "Κόρινθος", administrativeArea: "Πελοπόννησος", aliases: ["corinth", "korinthos", "κορινθος", "κόρινθος"] },
  { canonical: "Χαλκίδα", administrativeArea: "Στερεά Ελλάδα", aliases: ["chalkida", "halkida", "χαλκιδα", "χαλκίδα"] },
  { canonical: "Σέρρες", administrativeArea: "Κεντρική Μακεδονία", aliases: ["serres", "serrai", "σερρες", "σέρρες"] },
  { canonical: "Καβάλα", administrativeArea: "Ανατολική Μακεδονία και Θράκη", aliases: ["kavala", "καβαλα", "καβάλα"] },
  { canonical: "Αλεξανδρούπολη", administrativeArea: "Ανατολική Μακεδονία και Θράκη", aliases: ["alexandroupoli", "alexandroupolis", "αλεξανδρουπολη", "αλεξανδρούπολη"] },
  { canonical: "Κέρκυρα", administrativeArea: "Ιόνια Νησιά", aliases: ["corfu", "kerkyra", "κερκυρα", "κέρκυρα"] },
  { canonical: "Ρόδος", administrativeArea: "Νότιο Αιγαίο", aliases: ["rhodes", "rodos", "ροδος", "ρόδος"] },
  { canonical: "Μύκονος", administrativeArea: "Νότιο Αιγαίο", aliases: ["mykonos", "myconos", "μυκονος", "μύκονος"] },
  { canonical: "Σαντορίνη", administrativeArea: "Νότιο Αιγαίο", aliases: ["santorini", "thira", "thera", "σαντορινη", "σαντορίνη", "θηρα", "θήρα"] },
  { canonical: "Λιτόχωρο", administrativeArea: "Κεντρική Μακεδονία", aliases: ["litochoro", "litohoro", "λιτοχωρο", "λιτόχωρο"] },
];

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function host(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function sameDomain(a?: string | null, b?: string | null) {
  const ah = host(a);
  const bh = host(b);
  if (!ah || !bh) return false;
  return ah === bh || ah.endsWith(`.${bh}`) || bh.endsWith(`.${ah}`);
}

function detectCities(text: string) {
  const normalized = normalize(text);
  const found: CityDef[] = [];

  for (const def of CITY_DEFS) {
    if (def.aliases.some((alias) => normalized.includes(normalize(alias)))) {
      found.push(def);
    }
  }

  return found;
}

function cityMatches(text: string, canonicalCity?: string | null) {
  if (!canonicalCity) return false;
  const def = CITY_DEFS.find((item) => item.canonical === canonicalCity);
  if (!def) return normalize(text).includes(normalize(canonicalCity));
  const normalized = normalize(text);
  return def.aliases.some((alias) => normalized.includes(normalize(alias)));
}

function inferBestCity(text: string, currentCity?: string | null) {
  if (currentCity && cityMatches(text, currentCity)) {
    return CITY_DEFS.find((item) => item.canonical === currentCity) || null;
  }

  const found = detectCities(text);
  return found.length === 1 ? found[0] : null;
}

function looksLikeGreekPostalCode(text: string) {
  const matches = normalize(text).match(/\b\d{3}\s?\d{2}\b/g) || [];
  return matches.length > 0;
}

function hasStreetAddressShape(text: string) {
  const t = normalize(text);
  const hasNumber = /\b\d{1,4}\b/.test(t);
  const hasPostal = looksLikeGreekPostalCode(t);

  const streetHints = [
    "street", "str.", " str ", "avenue", "ave.", "road", "rd.",
    "οδ", "λεωφ", "πλατ", "square",
    "tsimiski", "ermou", "stadiou", "mitropoleos", "patreos",
    "karaiskou", "komninon", "kolokotroni",
  ];

  return (hasNumber && streetHints.some((hint) => t.includes(hint))) || hasPostal;
}

function obviousNonGreekLocation(text: string) {
  const t = normalize(text);

  const foreignSignals = [
    "athens, georgia",
    "athens georgia",
    "ga 306",
    "united states",
    " usa",
    "new york",
    "london, uk",
  ];

  return foreignSignals.some((signal) => t.includes(signal));
}

function bankFalsePositive(text: string, city: string | null) {
  const t = normalize(text);
  if (city === "Πειραιάς" && t.includes("piraeus bank")) {
    const withoutBank = t.replace(/piraeus bank/g, "");
    return !cityMatches(withoutBank, city);
  }
  return false;
}

function returnOnlyAddress(text: string) {
  const t = normalize(text);
  return (
    t.includes("returns address") ||
    t.includes("return address") ||
    t.includes("please post all returns") ||
    t.includes("διευθυνση επιστροφ")
  );
}

function weakLocation(text: string) {
  const t = normalize(text);

  // Postal code + city only is not enough proof of a physical merchant point.
  const stripped = t
    .replace(/\b\d{3}\s?\d{2}\b/g, "")
    .replace(/\b(greece|gr)\b/g, "")
    .trim();

  return stripped.split(/\s+/).length <= 3;
}

function dedupeKey(row: InputRow, city: string) {
  return normalize(`${row.merchantId}|${city}|${row.addressLine}`);
}

function reviewRow(row: InputRow) {
  const reasons: string[] = [];
  const address = row.addressLine || "";
  const excerpt = row.sourceExcerpt || "";
  const evidenceText = `${address} ${excerpt}`;

  if (!row.city || !row.addressLine || !row.sourceUrl) {
    return {
      ...row,
      normalizedCity: row.city,
      normalizedAdministrativeArea: row.administrativeArea,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Missing city/address/sourceUrl"],
    };
  }

  if (!/^https?:\/\//i.test(row.sourceUrl)) {
    return {
      ...row,
      normalizedCity: row.city,
      normalizedAdministrativeArea: row.administrativeArea,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Invalid source URL"],
    };
  }

  if (row.websiteUrl && !sameDomain(row.sourceUrl, row.websiteUrl)) {
    return {
      ...row,
      normalizedCity: row.city,
      normalizedAdministrativeArea: row.administrativeArea,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Source URL is not on merchant official domain"],
    };
  }

  if (obviousNonGreekLocation(evidenceText)) {
    return {
      ...row,
      normalizedCity: row.city,
      normalizedAdministrativeArea: row.administrativeArea,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Address is outside Greece"],
    };
  }

  if (returnOnlyAddress(evidenceText)) {
    return {
      ...row,
      normalizedCity: row.city,
      normalizedAdministrativeArea: row.administrativeArea,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["Returns-only address is not proof of a customer-facing merchant location"],
    };
  }

  if (bankFalsePositive(evidenceText, row.city)) {
    return {
      ...row,
      normalizedCity: row.city,
      normalizedAdministrativeArea: row.administrativeArea,
      reviewDecision: "REJECT" as ReviewDecision,
      reasons: ["City appears only inside a bank name"],
    };
  }

  const inferred = inferBestCity(evidenceText, row.city);
  const normalizedCity = inferred?.canonical || row.city;
  const normalizedAdministrativeArea =
    inferred?.administrativeArea || row.administrativeArea;

  if (!cityMatches(evidenceText, normalizedCity)) {
    reasons.push("City cannot be confirmed from official address/excerpt");
  }

  if (!hasStreetAddressShape(address)) {
    reasons.push("Address does not contain enough street/postal structure");
  }

  if (weakLocation(address)) {
    reasons.push("Address is too weak/incomplete for automatic verification");
  }

  const postal = row.postalCode?.replace(/\s+/g, "");
  if (postal && !/^\d{5}$/.test(postal)) {
    reasons.push("Postal code format is not 5 digits");
  }

  const detected = detectCities(evidenceText);
  const distinctCities = [...new Set(detected.map((item) => item.canonical))];

  // More than one city in one candidate often means a combined store list,
  // not one physical location row.
  if (
    distinctCities.length > 1 &&
    !distinctCities.every((city) => city === normalizedCity)
  ) {
    reasons.push(`Multiple cities appear in one candidate: ${distinctCities.join(", ")}`);
  }

  const decision: ReviewDecision =
    reasons.length === 0
      ? "SAFE"
      : reasons.some((reason) =>
          reason.includes("Multiple cities") ||
          reason.includes("too weak/incomplete"),
        )
        ? "REVIEW"
        : reasons.length >= 2
          ? "REJECT"
          : "REVIEW";

  return {
    ...row,
    normalizedCity,
    normalizedAdministrativeArea,
    reviewDecision: decision,
    reasons,
  };
}

async function main() {
  const inputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v1-dry-run.json",
  );

  const raw = JSON.parse(await fs.readFile(inputPath, "utf8")) as {
    rows: InputRow[];
  };

  const candidates = raw.rows.filter((row) => row.decision === "SAFE_TO_APPLY");
  const initiallyReviewed = candidates.map(reviewRow);

  const seen = new Map<string, number>();
  const reviewed = initiallyReviewed.map((row) => {
    if (row.reviewDecision !== "SAFE") return row;

    const key = dedupeKey(row, row.normalizedCity || row.city || "");
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);

    if (count > 0) {
      return {
        ...row,
        reviewDecision: "REJECT" as ReviewDecision,
        reasons: ["Duplicate merchant/location candidate"],
      };
    }

    return row;
  });

  const summary = reviewed.reduce<Record<ReviewDecision, number>>(
    (acc, row) => {
      acc[row.reviewDecision]++;
      return acc;
    },
    { SAFE: 0, REVIEW: 0, REJECT: 0 },
  );

  const output = {
    generatedAt: new Date().toISOString(),
    version: "2",
    sourceReport: "merchant-location-discovery-v1-dry-run.json",
    inputSafeToApplyRows: candidates.length,
    summary,
    rows: reviewed,
  };

  const outputPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-quality-review-v2.json",
  );

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("=== DOROKARTES LOCATION QUALITY REVIEW v2 ===");
  console.log(`Input candidates: ${candidates.length}`);
  console.table(summary);
  console.log(`Report: ${path.relative(process.cwd(), outputPath)}`);

  console.log("");
  console.log("=== SAFE LOCATIONS ===");
  console.table(
    reviewed
      .filter((row) => row.reviewDecision === "SAFE")
      .map((row) => ({
        merchant: row.merchant,
        city: row.normalizedCity,
        address: row.addressLine,
        source: row.sourceUrl,
      })),
  );

  console.log("");
  console.log("=== REVIEW / REJECT ===");
  console.table(
    reviewed
      .filter((row) => row.reviewDecision !== "SAFE")
      .map((row) => ({
        merchant: row.merchant,
        city: row.normalizedCity,
        decision: row.reviewDecision,
        reason: row.reasons.join(" | "),
      })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
