import fs from "node:fs/promises";
import path from "node:path";

type Row = any;
type Verdict = "PRODUCTION_SAFE" | "REVIEW" | "REJECT";

const HARD_REVIEW = new Set([
  "Adventure Junkies",
  "Drive at Serres Racing Circuit",
  "Londonboutique",
  "Pezzetta",
  "Nextsystems",
  "Treatwell",
  "Winewalkers",
  "for Stay in Greece",
  "Uba",
  "Superstrom",
  "Greenmall",
  "Mamagalia",
  "Muststore",
]);

const POLICY_URL_RE =
  /(return|returns|refund|policy|policies|epistrof|επιστροφ|terms|privacy|shipping|product-category|blog|article|news)/i;

const STORE_URL_RE =
  /(stores?|store-locator|storelocator|katast|katasth|καταστ|our-stores?|locations?|showroom|boutique|to-katastima|sitemap\/katastima)/i;

const CONTACT_URL_RE =
  /(contact|epikoin|επικοινων)/i;

const NON_STORE_TEXT_RE =
  /(headquarters?|registered office|warehouse|factory|distribution center|returns?|billing|αποθήκη|εργοστάσιο|βιοτεχνικ[οό]\s+πάρκο|βιο\.?πα\.?|έδρα\s*:)/i;

function norm(v: string) {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function specificMismatch(city: string | null, address: string) {
  const c = norm(city || "");
  const a = norm(address || "");

  if ((c.includes("ηλιουπο") || c.includes("ilioup")) &&
      /(παγκρατι|pagrati|11632)/i.test(a)) return true;

  if ((c.includes("θεσσαλον") || c.includes("thessalon")) &&
      /(serres|σερρ|621\s?\d{2})/i.test(a) &&
      !/(θεσσαλονικη|thessaloniki).*(546|55\d|56\d|57\d)/i.test(a)) return true;

  return false;
}

function collapsedRow(address: string) {
  const a = address || "";
  const postals = [...new Set((a.match(/\b\d{3}\s?\d{2}\b/g) || []).map(x => x.replace(/\s/g, "")))];
  const phoneCount = (a.match(/\b(?:2\d{9}|69\d{8})\b/g) || []).length;
  return postals.length >= 2 || phoneCount >= 3;
}

function classify(r: Row): { verdict: Verdict; reasons: string[] } {
  const url = String(r.sourceUrl || "");
  const address = String(r.addressLine || "");
  const blob = `${address} ${r.sourceExcerpt || ""}`;

  if (HARD_REVIEW.has(r.merchant))
    return { verdict: "REVIEW", reasons: ["Known ambiguous merchant/evidence pattern"] };

  if (specificMismatch(r.city, address))
    return { verdict: "REVIEW", reasons: ["Known false city inference pattern"] };

  if (POLICY_URL_RE.test(url))
    return { verdict: "REVIEW", reasons: ["Policy/returns/blog/product page is not strong store evidence"] };

  if (NON_STORE_TEXT_RE.test(blob))
    return { verdict: "REVIEW", reasons: ["HQ/warehouse/factory/non-store signal"] };

  if (collapsedRow(address))
    return { verdict: "REVIEW", reasons: ["Collapsed/multiple address signals"] };

  if (r.sourceType === "JSON_LD") {
    // Homepage/business JSON-LD is often registered-office data.
    // Only accept when backed by an explicit store/location source URL.
    if (!STORE_URL_RE.test(url))
      return { verdict: "REVIEW", reasons: ["Homepage JSON-LD not proven customer-facing store"] };
  }

  if (r.sourceType === "PAGE_TEXT") {
    if (!(STORE_URL_RE.test(url) || CONTACT_URL_RE.test(url)))
      return { verdict: "REVIEW", reasons: ["Page-text source is not a store/contact page"] };

    const customerSignal =
      /(κατάστημα|καταστημα|store|shop|showroom|boutique|visit us|ωράριο|opening hours|χάρτης|map|διεύθυνση καταστήματος)/i.test(blob);

    if (!customerSignal)
      return { verdict: "REVIEW", reasons: ["No explicit customer-facing location signal"] };
  }

  if (r.sourceType === "MAP_LINK") {
    if (!(STORE_URL_RE.test(url) || CONTACT_URL_RE.test(url) || /\/$/.test(new URL(url).pathname)))
      return { verdict: "REVIEW", reasons: ["Map evidence comes from weak/non-location page"] };
  }

  return { verdict: "PRODUCTION_SAFE", reasons: ["Passed production location gate"] };
}

async function main() {
  const p = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-discovery-v3-quality-v2.json"
  );

  const report = JSON.parse(await fs.readFile(p, "utf8"));
  const input: Row[] = report.finalSafe || [];

  const rows = input.map(r => {
    const c = classify(r);
    return { ...r, productionVerdict: c.verdict, productionReasons: c.reasons };
  });

  const safe = rows.filter(r => r.productionVerdict === "PRODUCTION_SAFE");
  const review = rows.filter(r => r.productionVerdict === "REVIEW");
  const reject = rows.filter(r => r.productionVerdict === "REJECT");

  const outPath = path.resolve(
    process.cwd(),
    "reports",
    "regions",
    "merchant-location-production-gate-v1.json"
  );

  await fs.writeFile(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceReport: "merchant-location-discovery-v3-quality-v2.json",
    inputFinalSafe: input.length,
    summary: {
      PRODUCTION_SAFE: safe.length,
      REVIEW: review.length,
      REJECT: reject.length,
      TOTAL: rows.length,
    },
    productionSafe: safe,
    review,
    reject,
  }, null, 2), "utf8");

  console.log("=== MERCHANT LOCATION PRODUCTION GATE v1 ===");
  console.log(`Input FINAL_SAFE rows: ${input.length}`);
  console.table({
    PRODUCTION_SAFE: safe.length,
    REVIEW: review.length,
    REJECT: reject.length,
    TOTAL: rows.length,
  });
  console.log(`Report: reports\\regions\\merchant-location-production-gate-v1.json`);
  console.log("READ ONLY — database unchanged.");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
