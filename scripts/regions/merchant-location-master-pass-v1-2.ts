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

const KNOWN_BAD = new Set([
  "Gymbeam",
  "Crudeshop",
]);

const KNOWN_REVIEW = new Set([
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
  "Fmsstores",
  "Big Shoes",
  "Bmwpap",
  "Capristores",
  "Decolight",
  "Ebru",
  "Fifth Element",
  "Koroneos",
  "Lav Perfumes",
  "Londonboutique",
  "Lookshop",
  "Lovelykids",
  "Lucejewelry",
  "Wellbee Cosmetics",
]);

const URL_STRONG =
  /(store|stores|store-locator|storelocator|katast|katasth|καταστ|locations?|find-us|our-store|showroom|pointofsale|point-of-sale|contact|epikoin|επικοινων)/i;

const CUSTOMER_SIGNAL =
  /(κατάστημα|καταστημα|store|shop|showroom|boutique|ιατρείο|οδοντιατρείο|clinic|spa|restaurant|cafe|hotel|resort|studio|γυμναστήριο|fitness|visit us|find us|πού θα μας βρείτε|πως θα μας βρείτε|τοποθεσία|location|retail park|γήπεδο|venue|ωράριο|opening hours|directions)/i;

const LEGAL_SIGNAL =
  /(έδρα|registered office|company address|trade name|vat number|αφμ|γ\.?ε\.?μ\.?η|γεμη|head ?office|κεντρικ(ή|η) διοίκηση|warehouse|αποθήκη|returns?|billing|τιμολόγ|νομικ)/i;

const BAD_FOREIGN =
  /\b(berlin|germany|deutschland|london|united kingdom|uk\b|united states|usa\b|new york|cyprus|nicosia|limassol)\b/i;

const BAD_PLACEHOLDER =
  /(\[object Object\]|no name|example|dummy|placeholder|\bA1\b)/i;

const POSTAL = /\b\d{3}\s?\d{2}\b/;

const STREET_NUMBER =
  /(?:^|[\s,])\d{1,4}[A-Za-zΑ-Ωα-ω]?(?:\b|[\s,])|(?:χλμ|km)\.?\s*\d+/i;

const ADDRESS_WORD =
  /(οδός|λεωφ|λεωφόρ|street|str\.?|road|rd\.?|avenue|ave\.?|πλατεία|πάροδος|parodos|χιλιόμετρο|χλμ|εθνική οδός|ε\.ο\.|αγίου|αγίας|δημοκρατίας|μητροπόλεως|πατησίων|ερμού|σόλωνος|πανεπιστημίου|κηφισίας|πειραιώς|βασιλίσσης|βασ\.|μαΐου|μαρτίου|οκτωβρίου|νοεμβρίου|knossou|lagoumitzi|poulaki|venizelou|plastira|tsim|kolokotroni|mitropoleos|papandreou|vouli|valtesiou|monemvasias|koumoundourou|dek(e|a)leias)/i;

const CITY_ONLY =
  /^\s*[A-Za-zΑ-Ωα-ωΆ-ώ.\- ]*\d{3}\s?\d{2}[A-Za-zΑ-Ωα-ωΆ-ώ.\- ]*\s*$/;

function norm(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function key(v: string) {
  return norm(v)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function clean(v: string) {
  return v
    .replace(/External link to google maps/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferPostal(v: string) {
  const m = v.match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

function multiPostal(v: string) {
  const ms = v.match(/\b\d{3}\s?\d{2}\b/g) || [];
  return new Set(ms.map(x => x.replace(/\s/g, ""))).size > 1;
}

function classify(c: Candidate): Classified {
  const address = clean(c.addressLine || "");
  const excerpt = clean(c.sourceExcerpt || "");
  const url = c.sourceUrl || "";
  const blob = `${address} ${excerpt}`;

  if (!c.city || !address || !url) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Missing city/address/source"] };
  }

  if (KNOWN_BAD.has(c.merchant)) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Known bad candidate"] };
  }

  if (BAD_PLACEHOLDER.test(address)) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Malformed/placeholder address"] };
  }

  if (BAD_FOREIGN.test(blob) && !/\b(greece|greek|ελλάδα|ellada)\b/i.test(blob)) {
    return { ...c, addressLine: address, decision: "REJECT", reasons: ["Foreign location"] };
  }

  if (KNOWN_REVIEW.has(c.merchant)) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["Known ambiguous candidate"] };
  }

  if (multiPostal(address)) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["Multiple postal codes in one candidate"] };
  }

  const hasPostal = POSTAL.test(address);
  const hasNumber = STREET_NUMBER.test(address);
  const hasAddressWord = ADDRESS_WORD.test(address);
  const strongUrl = URL_STRONG.test(url);
  const customer = CUSTOMER_SIGNAL.test(blob);
  const legal = LEGAL_SIGNAL.test(blob);

  if (CITY_ONLY.test(address) && !hasAddressWord) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["City/postal only"] };
  }

  if (legal && !customer) {
    return { ...c, addressLine: address, decision: "REVIEW", reasons: ["Legal/HQ-only evidence"] };
  }

  // MAP_LINK: strong enough when complete and source page has location intent.
  if (
    c.sourceType === "MAP_LINK" &&
    hasPostal &&
    hasNumber &&
    strongUrl &&
    !legal
  ) {
    return { ...c, addressLine: address, decision: "SAFE", reasons: ["Official map/location evidence"] };
  }

  // PAGE_TEXT: safe when source page is clearly store/contact/location and address is complete.
  if (
    c.sourceType === "PAGE_TEXT" &&
    hasPostal &&
    hasNumber &&
    strongUrl &&
    (customer || hasAddressWord) &&
    !legal
  ) {
    return { ...c, addressLine: address, decision: "SAFE", reasons: ["Complete address on official store/contact/location page"] };
  }

  // JSON-LD: complete structured address. We no longer require a street keyword;
  // many valid street names are proper nouns and were being lost by v1.1.
  if (
    c.sourceType === "JSON_LD" &&
    hasPostal &&
    hasNumber &&
    !legal &&
    !BAD_PLACEHOLDER.test(address)
  ) {
    return { ...c, addressLine: address, decision: "SAFE", reasons: ["Complete official JSON-LD address"] };
  }

  // Explicit store/shop language can compensate for missing postal on official store/contact page.
  if (
    c.sourceType === "PAGE_TEXT" &&
    hasNumber &&
    strongUrl &&
    customer &&
    !legal
  ) {
    return { ...c, addressLine: address, decision: "SAFE", reasons: ["Explicit customer-facing store address"] };
  }

  return { ...c, addressLine: address, decision: "REVIEW", reasons: ["Not strong enough for automatic apply"] };
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
  };

  const all: Classified[] = [];

  for (const item of raw.queue || []) {
    for (const c of item.candidates || []) all.push(classify(c));
  }

  const dedup = new Map<string, Classified>();

  for (const row of all) {
    const k = `${row.merchantId}|${norm(row.city || "")}|${key(row.addressLine || "")}`;
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

  const reportPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-master-pass-v1.2.json",
  );

  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: APPLY_SAFE ? "APPLY_SAFE" : "DRY_RUN",
        merchantsInQueue: new Set((raw.queue || []).map(x => x.merchantId)).size,
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

  console.log("=== MERCHANT LOCATION MASTER PASS v1.2 ===");
  console.log(APPLY_SAFE ? "MODE: APPLY SAFE" : "MODE: DRY RUN");
  console.log(`Merchants in queue: ${new Set((raw.queue || []).map(x => x.merchantId)).size}`);
  console.log(`SAFE:   ${safe.length}`);
  console.log(`REVIEW: ${review.length}`);
  console.log(`REJECT: ${reject.length}`);
  console.log(`TOTAL:  ${rows.length}`);
  console.log(`Report: reports\\regions\\merchant-location-master-pass-v1.2.json`);

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
    const addressLine = clean(row.addressLine || "");
    const normalizedKey = key(`${row.city}|${addressLine}`);

    await prisma.merchantLocation.upsert({
      where: {
        merchantId_normalizedKey: {
          merchantId: row.merchantId,
          normalizedKey,
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
        normalizedKey,
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
