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

const PICKS: Array<{
  merchant: string;
  contains: string;
  overrideCity?: string;
}> = [
  { merchant: "Patistascosmetics", contains: "Κλεισθένους 217" },
  { merchant: "Patistascosmetics", contains: "Αγίων Αναργύρων 24" },
  { merchant: "Patistascosmetics", contains: "Αγίας Γλυκερίας 8-10" },

  { merchant: "attica", contains: "ΠΑΝΕΠΙΣΤΗΜΙΟΥ 9" },
  { merchant: "attica", contains: "Λ. ΚΗΦΙΣΙΑΣ 37Α" },
  { merchant: "attica", contains: "ΤΣΙΜΙΣΚΗ 48 - 50" },
  { merchant: "attica", contains: "11ο χλμ. Ε.Ο. ΘΕΣΣΑΛΟΝΙΚΗΣ - ΜΟΥΔΑΝΙΩΝ" },

  { merchant: "Fuel", contains: "Ιπποκράτους 3 - Τ.Κ. 10679" },
  { merchant: "Profitstore", contains: "Ρουμπέση 41" },
  { merchant: "Andreoueshop", contains: "Γκλαβάνη 98" },
  { merchant: "Athanasiakaritsa", contains: "Μητρ. Ιωσήφ 22" },
  { merchant: "Business Travel", contains: "Καλαποθάκη 3" },
  { merchant: "Carrot Store", contains: "Pyrgos Kallistis" },

  { merchant: "Cigarsmoke", contains: "Μητροπόλεως 24" },
  { merchant: "Cigarsmoke", contains: "Βρύση, 846 00, Μύκονος" },

  { merchant: "Climber", contains: "Ηρακλείτου και Αντώνη Τρίτση 1" },
  { merchant: "Climber", contains: "Αλ. Παπαναστασίου 50" },

  { merchant: "Cocoonurbanspa", contains: "Σουλίου 9" },
  { merchant: "Cyclestore", contains: "Μαντζάρου 1" },
  { merchant: "Dazzeal", contains: "ΕΟ Θεσσαλονίκης-Καβάλας" },
  { merchant: "Dmcreations", contains: "Αυλώνος 152" },
  { merchant: "Fairytale", contains: "Λεωκορίου 16" },
  { merchant: "GreenArt", contains: "Πελασγίας 14Β" },
  { merchant: "Iridaspa", contains: "Ναιάδων 10" },
  { merchant: "Irisproject", contains: "Κενταύρων 28-30" },

  { merchant: "Justbrazilstore", contains: "Kalamiotou 17" },

  { merchant: "Kidscom", contains: "Λ. Κηφισίας 124" },
  { merchant: "Kidscom", contains: "Τιτάνων 16-18" },

  { merchant: "Luvnroll", contains: "Karaiskaki 14" },
  { merchant: "Luxusbags", contains: "Καρόλου Κουν 20" },
  { merchant: "Motovinios", contains: "Μιχαλακοπούλου 141" },
  { merchant: "Moustakisfc", contains: "Αγίας Βαρβάρας 79" },
  { merchant: "Musicpal", contains: "Σεβαστουπόλεως 2" },
  { merchant: "Mylittleland", contains: "Σουρή 12" },
  { merchant: "Myrtia", contains: "Λαρίσης 4" },

  { merchant: "PCP Clothing", contains: "Καραολή και Δημητρίου Των Κυπρίων 16" },
  { merchant: "PCP Clothing", contains: "Ξενοκράτους 25" },

  { merchant: "Polis Hammam", contains: "Αυλητών 6-8" },
  { merchant: "Polis Hammam", contains: "Φίλωνος 43" },
  { merchant: "Polis Hammam", contains: "Μοναστηρίου 16" },

  { merchant: "Project Soma", contains: "Θεοφάνους 19-21" },
  { merchant: "Sakkoulasbooks", contains: "Σόλωνος 86" },
  { merchant: "Skinreal", contains: "Μιαούλη 10" },

  { merchant: "Smarten", contains: "ΝΙΚΗΣ 12 & ΜΗΤΡΟΠΟΛΕΩΣ 6" },

  { merchant: "Tokopeli", contains: "Στρ. Τζανακάκη 17" },
  { merchant: "Vicious Cycles Athens", contains: "ΜΕΛΑΝΘΙΟΥ 8" },
  { merchant: "Xeiroplathi", contains: "Στυλιανού Γόνατα 4" },
  { merchant: "Zumbashop", contains: "Θεσσαλονίκης 170" },

  { merchant: "4 Elements Massage Kefalonia", contains: "Epar.Od. Keramion - Vlachatas" },
  { merchant: "Cakeshop", contains: "Στρατάρχου Αλεξάνδρου Παπάγου 80Α" },
];

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
  return v
    .replace(/External link to google maps/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const missing: typeof PICKS = [];

  for (const pick of PICKS) {
    const q = report.queue.find(x => x.merchant === pick.merchant);
    if (!q) {
      missing.push(pick);
      continue;
    }

    const c = q.candidates.find(x =>
      (x.addressLine || "").toLowerCase().includes(pick.contains.toLowerCase())
    );

    if (!c) {
      missing.push(pick);
      continue;
    }

    selected.push({
      ...c,
      city: pick.overrideCity || c.city,
      addressLine: cleanAddress(c.addressLine || ""),
      postalCode: c.postalCode || inferPostal(c.addressLine || ""),
    });
  }

  console.log("=== LOCATION REVIEW BATCH 1 — CURATED APPLY ===");
  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`Selected rows: ${selected.length}`);
  console.log(`Missing picks: ${missing.length}`);

  if (missing.length) {
    console.log("");
    console.log("=== MISSING PICKS ===");
    console.table(missing);
    console.log("");
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
