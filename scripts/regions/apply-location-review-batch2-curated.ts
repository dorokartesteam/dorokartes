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
  ["Explore Messinia", "Mpouloukou 26"],
  ["Hintsdeco", "Σειρήνων 31"],
  ["Kois Optics", "Θυμ. Σπερχειού 16"],
  ["L'Arte di Massaggio", "Λ. Αθηνών 336"],
  ["Led7", "ΑΦΑΙΑΣ 25"],
  ["Philatravel", "Dekeleias 83"],
  ["Proper Cretan Guide", "Agia Marina Main Street"],
  ["Quad & Buggy Safari Crete", "Cretan Camping"],
  ["Safe Travel", "Κουμουνδούρου 24"],
  ["Salero Restaurant", "51 Valtetsiou"],
  ["Tempiholidays", "Ερμού 64"],
  ["Tempiholidays", "Βελλή 6"],
  ["Toalfavitarisou", "Μεγάλου Αλεξάνδρου 103"],
  ["Toolman", "G. Aggelou & Nearxou 1"],

  ["Ullapopken", "Μακένζι Κίνγκ 4"],
  ["Ullapopken", "Πεντέλης 40-42"],

  ["Laloo", "Αγίας Θεοδώρας 5"],
  ["Laloo", "Λίνδου 51"],

  ["Paraphernalia", "15 Ioannou Paparrigopoulou"],
  ["Aetherjewelry", "17is Noemvriou 117"],
  ["Alkistijewelry", "Αχειροποιήτου 2"],
  ["Alpamayopro", "Χαριλάου Τρικούπη 6-10"],
  ["ANEMH clothing&fashion items", "Τσιμισκή 82"],
  ["Animusmassage", "Διαμαντή Ολυμπίου 14"],
  ["Animusmassage", "Τσιμισκή 33"],
  ["Anthemion Flowers", "Λ. Θηβών 499"],
  ["Babyllama", "Ορφέως 156"],
  ["Badila", "Monemvasias 60"],
  ["Barbopoulos", "Τσουδερών 1"],
  ["Batterypark", "Ηφαίστου 70"],
  ["Beautyandnails", "Πρασακάκη 8"],
  ["Boudoirspawellness", "Ελευθερίου Βενιζέλου 140"],
  ["Brigitteboutique", "Μητροπόλεως 79"],
  ["Bymeraki", "Τσαλοπούλου 15"],
  ["Cameoshatter", "Βουλής 16"],
  ["Candlejuice", "Athanasiou Diakoy 19"],
  ["Casagiacomo", "Λεβίδου 11"],
  ["Celestino", "Ploutonos 17"],
  ["Chaniapetworld", "Κυδωνίας 85"],
  ["Cherrybox", "Ρήγα Φεραίου 5"],
  ["Christines", "Ιασωνίδου 3"],
  ["Cicado Creative Studio", "Αγίας Παρασκευής 32"],
  ["Crusters", "Politechniou 33"],
  ["Culturalsociety", "Πλαστήρα 55"],
  ["Dimitriou Fashion", "28ης Οκτωβρίου 17"],
  ["Dioptra", "Σόλωνος 93-95"],
  ["Ekdoseis Papasotiriou", "Στουρνάρη 49Α"],
  ["Elegance", "Αιγαίου & Πόντου 29"],
  ["Elenabeautyhall", "3ης Σεπτεμβρίου 77"],
  ["Elforsam", "Σωκράτους 32"],
  ["Epidermislaser", "Γρηγορίου Λαμπράκη 208"],
  ["Ethereal Spa", "Apokoronou 2"],
  ["Eubiotica", "3 Koletti"],
  ["Fagotto Books", "Βαλτετσίου 15"],
  ["Feed Me", "Αδανων 31"],
  ["God Bless Women", "Ροστάν Εδμόνδου 9"],
  ["Grecotel", "Emmanouil Portaliou 23"],
  ["Groombox", "Ισαύρων 3"],
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
  const missing: Array<{merchant:string;contains:string}> = [];

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

  console.log("=== LOCATION REVIEW BATCH 2 — CURATED APPLY ===");
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
