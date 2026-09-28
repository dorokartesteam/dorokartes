import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const APPLY = process.argv.includes("--apply");

type Candidate = {
  merchantId: string;
  merchant: string;
  merchantSlug: string;
  city: string | null;
  area: string | null;
  administrativeArea: string | null;
  addressLine: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string | null;
  sourceExcerpt: string | null;
  sourceType: string | null;
  reviewScore: number;
};

type QueueItem = {
  merchantId: string;
  merchant: string;
  candidates: Candidate[];
};

const PICKS = [
  ["Buzzsneakers", "Τάρπον Σπρίνγκς 33"],
  ["Buzzsneakers", "Λεωφόρος Ηρώων Πολυτεχνείου 51"],

  ["Harmonybeauty", "Αγίας Λαύρας 7"],
  ["Hobby", "Πραξιτέλους 31"],
  ["Hobbylobby Yarns", "Κολοκοτρώνη 33"],
  ["Janeiredale", "Γράμμου 71"],

  ["Kalousos", "Θερίσου 52"],
  ["Kidsloveplanet", "Έβρου 260"],
  ["Kikoo", "1o Χιλιόμετρο Αλεξανδρούπολης"],

  ["Konstantinidis Dental", "Μιχαλακοπούλου 84"],
  ["Kosmima24", "Πτολεμαίων 31"],
  ["Kouskoufashionproject", "Themeli 65"],

  ["Lidon", "Ίωνος Δραγούμη 37"],

  ["Lilidrogerie", "Αθηνών - Πειραιώς 86"],
  ["Lilidrogerie", "Πατησίων 138"],
  ["Lilidrogerie", "Δημοκρατίας 270"],
  ["Lilidrogerie", "Βασιλίσσης Όλγας 136"],
  ["Lilidrogerie", "Φιλλελήνων 4"],

  ["Love It", "Μορκεντάου 8"],
  ["LVK Premium Fitness", "Λ. Συγγρού 247"],
  ["MaaMonPapa", "Ασκληπιού 7"],
  ["Marketfix", "Πλαστήρα 5"],

  ["Mom & Me", "Κουγιουμτζόγλου 70"],
  ["Naloo Beauty Bar", "Σοφοκλέους 9"],

  ["Parousiafashion", "Dikeosinis 25"],
  ["Play-sports", "Πυλαρινού 54"],

  ["PNN Nightwear", "Σωτήρος 30"],
  ["PNN Nightwear", "Τρικούπη 10"],
  ["PNN Nightwear", "Ομονοίας 73α"],
  ["PNN Nightwear", "Μεταμορφώσεως 19"],

  ["Pret A Beaute", "Metamorfoseos 26B"],
  ["Puroshop", "Φωτομάρα 70"],
  ["Rococo", "Πατησίων 97Β"],

  ["Semiology", "Αδριανού 57"],
  ["Semiology", "Αιόλου 43"],
  ["Semiology", "Ανδρέα Παπανδρέου 39"],
  ["Semiology", "Βασιλέως Γεωργίου Α’ 13"],
  ["Semiology", "28ης Οκτωβρίου (Πατησίων) 129"],

  ["Senorclothing", "Μεγάλου Αλεξάνδρου 61"],
  ["Shoebox", "Αναγνωστόπουλου 5"],
  ["Simple City", "Komvos Mournies"],

  ["Neraw", "Frearion 18"],
  ["Paokfc", "Μικράς Ασίας Γήπεδο Τούμπας"],
] as const;

function key(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanAddress(v: string) {
  return v.replace(/\s+/g, " ").trim();
}

function inferPostal(v: string) {
  const m = v.match(/\b(\d{3})\s?(\d{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

async function main() {
  const { prisma } = await import("../../lib/prisma");

  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-review-queue-v1.json",
  );

  const report = JSON.parse(await fs.readFile(p, "utf8")) as {
    queue: QueueItem[];
  };

  const selected: Candidate[] = [];
  const missing: Array<{ merchant: string; contains: string }> = [];

  for (const [merchant, contains] of PICKS) {
    const q = report.queue.find(x => x.merchant === merchant);

    if (!q) {
      missing.push({ merchant, contains });
      continue;
    }

    const c = q.candidates.find(x =>
      (x.addressLine || "").toLowerCase().includes(contains.toLowerCase())
    );

    if (!c) {
      missing.push({ merchant, contains });
      continue;
    }

    selected.push({
      ...c,
      addressLine: cleanAddress(c.addressLine || ""),
      postalCode: c.postalCode || inferPostal(c.addressLine || ""),
    });
  }

  console.log("=== LOCATION REVIEW BATCH 3 — CURATED APPLY ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Selected rows: ${selected.length}`);
  console.log(`Missing picks: ${missing.length}`);

  if (missing.length) {
    console.table(missing);
    console.log("STOP — no database changes performed.");
    await prisma.$disconnect();
    process.exitCode = 2;
    return;
  }

  for (const row of selected) {
    console.log(`${row.merchant} — ${row.city} — ${row.addressLine}`);

    if (!APPLY) continue;

    const normalizedKey = key(`${row.city}|${row.addressLine}`);

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
        administrativeArea: row.administrativeArea,
        city: row.city!,
        area: row.area,
        addressLine: row.addressLine!,
        postalCode: row.postalCode,
        latitude: row.latitude,
        longitude: row.longitude,
        normalizedKey,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
      update: {
        administrativeArea: row.administrativeArea,
        city: row.city!,
        area: row.area,
        addressLine: row.addressLine!,
        postalCode: row.postalCode,
        latitude: row.latitude,
        longitude: row.longitude,
        sourceUrl: row.sourceUrl!,
        sourceExcerpt: row.sourceExcerpt,
        active: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: new Date(),
      },
    });
  }

  if (!APPLY) console.log("DRY RUN ONLY — database unchanged.");
  await prisma.$disconnect();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
