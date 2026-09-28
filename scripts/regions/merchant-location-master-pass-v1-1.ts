import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY_SAFE = process.argv.includes("--apply-safe");

type Candidate = {
  merchantId: string;
  merchant: string;
  merchantSlug?: string;
  city: string | null;
  area?: string | null;
  administrativeArea?: string | null;
  addressLine: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl: string | null;
  sourceExcerpt?: string | null;
  sourceType?: string | null;
  reviewScore?: number;
};

type QueueItem = {
  merchantId: string;
  merchant: string;
  website?: string | null;
  candidates: Candidate[];
};

type Decision = "SAFE" | "REVIEW" | "REJECT";

type Classified = Candidate & {
  decision: Decision;
  reasons: string[];
};

const HARD_REJECT_MERCHANTS = new Set([
  "Gymbeam",
  "Crudeshop",
]);

const HARD_REVIEW_MERCHANTS = new Set([
  "Antonella",
  "Bioaroma Crete",
  "Drive at Serres Racing Circuit",
  "Gruppobizzaro",
  "Kikocosmetics",
  "Medithea Eshop",
  "Regalinas",
  "XXXL Leo",
  "Mothercare Greece",
  "Smart Tap",
  "Vintageneedle",
  "Hobbywood",
  "Karfitsomenos Gatos",
  "Olive Era",
  "Somatherapy",
]);

const STORE_URL_RE =
  /(store|stores|store-locator|storelocator|katast|katasth|καταστ|location|locations|find-us|our-store|showroom|pointofsale|point-of-sale|shop|contact|epikoin|επικοινων)/i;

const CUSTOMER_FACING_RE =
  /(κατάστημα|καταστημα|store|shop|showroom|boutique|ιατρείο|οδοντιατρείο|clinic|spa|restaurant|cafe|hotel|resort|studio|γυμναστήριο|fitness|visit us|find us|πού θα μας βρείτε|πως θα μας βρείτε|τοποθεσία|location|retail park|γήπεδο|venue)/i;

const LEGAL_ONLY_RE =
  /(έδρα|registered office|company address|trade name|vat number|αφμ|γ\.?ε\.?μ\.?η|γεμη|head ?office|κεντρικ(ή|η) διοίκηση|warehouse|αποθήκη|returns?|billing|τιμολόγ|νομικ)/i;

const FOREIGN_RE =
  /\b(berlin|germany|deutschland|london|united kingdom|uk\b|united states|usa\b|new york|cyprus|nicosia|limassol|italy|france|spain|netherlands)\b/i;

const PLACEHOLDER_RE =
  /(\[object Object\]|no name|example|dummy|placeholder|\bA1\b)/i;

const GREEK_POSTAL_RE = /\b\d{3}\s?\d{2}\b/;
const STREET_NUMBER_RE =
  /(?:\b\d{1,4}[A-Za-zΑ-Ωα-ω]?\b|(?:χλμ|km)\.?\s*\d+|(?:\d+)(?:ο|ο\s+χλμ))/i;

const STREET_HINT_RE =
  /(οδός|οδου|λεωφ|λεωφόρ|street|str\.?|road|rd\.?|avenue|ave\.?|πλατεία|πλατ|πάροδος|parodos|χιλιόμετρο|χλμ|εθνική οδός|ε\.ο\.|αγίου|αγίας|δημοκρατίας|τσίμ|τσιμ|μητροπόλεως|πατησίων|ερμού|σόλωνος|πανεπιστημίου|κηφισίας|πειραιώς|βασιλίσσης|βασ\.|28ης|17ης|25ης|μαΐου|μαρτίου|οκτωβρίου|νοεμβρίου)/i;

const BAD_CITY_ONLY_RE =
  /^\s*(?:[A-Za-zΑ-Ωα-ωΆ-ώ.\- ]+)?\s*\d{3}\s?\d{2}\s*(?:[A-Za-zΑ-Ωα-ωΆ-ώ.\- ]+)?\s*$/;

const CITY_TOKENS = [
  "Αθήνα","Athens","Πειραιάς","Piraeus","Θεσσαλονίκη","Thessaloniki","Πάτρα","Patra",
  "Ηράκλειο","Heraklion","Χανιά","Chania","Ρέθυμνο","Rethymno","Λάρισα","Larisa",
  "Βόλος","Volos","Ιωάννινα","Ioannina","Καβάλα","Kavala","Σέρρες","Serres",
  "Ρόδος","Rhodes","Μύκονος","Mykonos","Σαντορίνη","Santorini","Καλαμάτα","Kalamata",
  "Κόρινθος","Corinth","Χαλκίδα","Chalkida","Φλώρινα","Florina","Αλεξανδρούπολη",
  "Alexandroupoli","Καλλιθέα","Kallithea","Χαλάνδρι","Chalandri","Περιστέρι",
  "Peristeri","Ελευσίνα","Eleusina","Μαρούσι","Marousi","Νέα Ιωνία","Nea Ionia",
  "Νέα Φιλαδέλφεια","Nea Filadelfia","Ηλιούπολη","Ilioupoli","Καλαμαριά","Kalamaria",
  "Κηφισιά","Kifisia","Εύοσμος","Evosmos","Γαλάτσι","Galatsi","Χαϊδάρι","Haidari",
  "Ερμούπολη","Ermoupoli","Καρδίτσα","Karditsa","Σπάρτη","Sparti","Ιστιαία","Istiaia",
  "Ελληνικό","Elliniko","Σπάτα","Spata","Κορωπί","Koropi","Ναύπλιο","Nafplio",
  "Σύρος","Syros","Κέρκυρα","Corfu","Θέρμη","Thermi"
];

function norm(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizedKey(v: string) {
  return norm(v)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferPostal(v: string) {
  const m = v.match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

function cleanAddress(v: string) {
  return v
    .replace(/External link to google maps/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function postalCount(v: string) {
  const all = v.match(/\b\d{3}\s?\d{2}\b/g) || [];
  return new Set(all.map(x => x.replace(/\s/g, ""))).size;
}

function citySignalCount(v: string) {
  const n = norm(v);
  const found = new Set<string>();
  for (const token of CITY_TOKENS) {
    if (n.includes(norm(token))) found.add(norm(token));
  }
  return found.size;
}

function classify(c: Candidate): Classified {
  const reasons: string[] = [];
  const address = cleanAddress(c.addressLine || "");
  const sourceUrl = c.sourceUrl || "";
  const excerpt = cleanAddress(c.sourceExcerpt || "");
  const haystack = `${address} ${excerpt} ${sourceUrl}`;

  if (!address || !sourceUrl || !c.city) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Missing address/source/city"] };
  }

  if (HARD_REJECT_MERCHANTS.has(c.merchant)) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Known bad candidate from prior review"] };
  }

  if (FOREIGN_RE.test(haystack) && !/\b(greece|greek|ελλάδα|ellada)\b/i.test(haystack)) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Foreign location signal"] };
  }

  if (PLACEHOLDER_RE.test(address)) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Malformed/placeholder address"] };
  }

  if (HARD_REVIEW_MERCHANTS.has(c.merchant)) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["Known ambiguous merchant/candidate"] };
  }

  const postals = postalCount(address);
  const cities = citySignalCount(address);

  if (postals >= 2 || cities >= 3) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["Multiple physical addresses/signals collapsed"] };
  }

  const hasPostal = GREEK_POSTAL_RE.test(address);
  const hasNumber = STREET_NUMBER_RE.test(address);
  const hasStreet = STREET_HINT_RE.test(address);
  const sourceIntent = STORE_URL_RE.test(sourceUrl);
  const customerFacing = CUSTOMER_FACING_RE.test(`${address} ${excerpt}`);
  const legalOnly = LEGAL_ONLY_RE.test(`${address} ${excerpt}`);

  if (BAD_CITY_ONLY_RE.test(address) && !hasStreet) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["City/postal only; street missing"] };
  }

  if (!hasPostal) reasons.push("Postal code missing");
  if (!hasNumber) reasons.push("Street/building number missing");
  if (!hasStreet) reasons.push("Street signal weak");

  if (legalOnly && !customerFacing) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["Legal/HQ evidence without customer-facing signal"] };
  }

  if (hasPostal && hasNumber && hasStreet && sourceIntent && customerFacing) {
    return { ...c, addressLine: address, decision: "SAFE", reasons: ["Full physical address + official customer-facing source"] };
  }

  if (
    c.sourceType === "MAP_LINK" &&
    hasPostal &&
    hasNumber &&
    sourceIntent &&
    !legalOnly
  ) {
    return { ...c, addressLine: address, decision: "SAFE", reasons: ["Official map link + full physical address"] };
  }

  if (
    c.sourceType === "JSON_LD" &&
    hasPostal &&
    hasNumber &&
    hasStreet &&
    !legalOnly &&
    !PLACEHOLDER_RE.test(address)
  ) {
    return { ...c, addressLine: address, decision: "SAFE", reasons: ["Complete structured JSON-LD physical address"] };
  }

  return {
    ...c,
    addressLine: address,
    decision: "REVIEW",
    reasons: reasons.length ? reasons : ["Evidence not strong enough for automatic apply"],
  };
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const queuePath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-review-queue-v1.json",
  );

  const raw = JSON.parse(await fs.readFile(queuePath, "utf8")) as {
    queue: QueueItem[];
    merchantsStillMissingVerifiedLocation?: number;
  };

  // v1.1: the queue itself is the source of truth.
  // merchant-location-review-queue-v1.ts already filters to merchants
  // that currently have no active VERIFIED MerchantLocation.
  const all: Classified[] = [];

  for (const item of raw.queue || []) {
    for (const c of item.candidates || []) {
      all.push(classify(c));
    }
  }

  const dedup = new Map<string, Classified>();

  for (const row of all) {
    const k = `${row.merchantId}|${norm(row.city || "")}|${normalizedKey(row.addressLine || "")}`;
    const prev = dedup.get(k);

    if (!prev) {
      dedup.set(k, row);
      continue;
    }

    const rank = { SAFE: 3, REVIEW: 2, REJECT: 1 };
    if (rank[row.decision] > rank[prev.decision]) dedup.set(k, row);
  }

  const rows = [...dedup.values()];
  const safe = rows.filter(x => x.decision === "SAFE");
  const review = rows.filter(x => x.decision === "REVIEW");
  const reject = rows.filter(x => x.decision === "REJECT");

  const merchantCount = new Set((raw.queue || []).map(x => x.merchantId)).size;

  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-master-pass-v1.1.json",
  );

  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: APPLY_SAFE ? "APPLY_SAFE" : "DRY_RUN",
        source: "merchant-location-review-queue-v1.json",
        merchantsWithReviewCandidates: merchantCount,
        summary: {
          SAFE: safe.length,
          REVIEW: review.length,
          REJECT: reject.length,
          TOTAL: rows.length,
        },
        safe,
        review,
        reject,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("=== MERCHANT LOCATION MASTER PASS v1.1 ===");
  console.log(APPLY_SAFE ? "MODE: APPLY SAFE" : "MODE: DRY RUN");
  console.log(`Merchants in refreshed review queue: ${merchantCount}`);
  console.log(`SAFE:   ${safe.length}`);
  console.log(`REVIEW: ${review.length}`);
  console.log(`REJECT: ${reject.length}`);
  console.log(`TOTAL:  ${rows.length}`);
  console.log(`Report: reports\\regions\\merchant-location-master-pass-v1.1.json`);

  console.log("");
  console.log("=== SAFE PREVIEW ===");

  console.table(
    safe.map(x => ({
      merchant: x.merchant,
      city: x.city,
      sourceType: x.sourceType,
      address: x.addressLine,
      sourceUrl: x.sourceUrl,
    })),
  );

  if (!APPLY_SAFE) {
    console.log("");
    console.log("DRY RUN ONLY — database unchanged.");
    await prisma.$disconnect();
    return;
  }

  let applied = 0;

  for (const row of safe) {
    const addressLine = cleanAddress(row.addressLine || "");
    const nkey = normalizedKey(`${row.city}|${addressLine}`);

    await prisma.merchantLocation.upsert({
      where: {
        merchantId_normalizedKey: {
          merchantId: row.merchantId,
          normalizedKey: nkey,
        },
      },
      create: {
        merchantId: row.merchantId,
        label: null,
        countryCode: "GR",
        administrativeArea: row.administrativeArea ?? null,
        city: row.city!,
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || inferPostal(addressLine),
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        normalizedKey: nkey,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
      update: {
        administrativeArea: row.administrativeArea ?? null,
        city: row.city!,
        area: row.area ?? null,
        addressLine,
        postalCode: row.postalCode || inferPostal(addressLine),
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt ?? null,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
    });

    applied++;
  }

  console.log("");
  console.log(`APPLIED SAFE ROWS: ${applied}`);
  console.log("REVIEW and REJECT rows were NOT written.");

  await prisma.$disconnect();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
