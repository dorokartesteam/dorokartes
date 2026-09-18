import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");

function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function amounts(s: string) {
  const out = new Set<number>();
  const x = s.replace(/,/g, ".");
  for (const p of [
    /(?:€|eur(?:o)?s?|euro)\s*(\d+(?:\.\d{1,2})?)/gi,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|eur(?:o)?s?|euro)/gi,
  ]) {
    for (const m of x.matchAll(p)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 10000) out.add(n);
    }
  }
  return [...out].sort((a,b)=>a-b);
}

function removeMoney(s: string) {
  return s
    .replace(/(?:€|eur(?:o)?s?|euro)\s*\d+(?:[.,]\d{1,2})?/gi, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:€|eur(?:o)?s?|euro)/gi, " ")
    .replace(/[|–—]+/g, " ")
    .replace(/^\s*[-/]+\s*/g, "")
    .replace(/\s*[-/]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeGiftGenericEdges(s: string) {
  return s
    .replace(/^\s*(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\s*/gi, "")
    .replace(/\s*(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)\s*$/gi, "")
    .replace(/^\s*(?:αξίας|αξιας)\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMerchant(name: string) {
  return removeGiftGenericEdges(removeMoney(name));
}

function merchantLooksPolluted(name: string) {
  return amounts(name).length > 0 ||
    /(?:gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτα|δωροκαρτα|δωροεπιταγή)/i.test(name);
}

function cleanLooksSafe(s: string) {
  const n = norm(s);
  if (n.length < 3) return false;
  if (/^\d/.test(n)) return false;
  if (["gift","gift card","gift voucher","voucher","δωροκαρτα","δωροεπιταγη"].includes(n)) return false;
  if (/\b(?:αξιας|απο|други)\b/i.test(n)) return false;
  return true;
}

function titleSupportsBrand(title: string, brand: string) {
  const t = norm(title);
  const b = norm(brand);
  if (!b || b.length < 3) return false;
  return t.includes(b);
}

function generalGiftDirectoryCandidate(raw?: string | null) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    const parts = u.pathname.split("/").filter(Boolean);

    for (let i = parts.length - 2; i >= 0; i--) {
      if (/(gift[-_ ]?(?:card|cards|voucher|vouchers)|voucher|δωρο|dwro)/i.test(parts[i])) {
        const c = new URL(u.toString());
        c.pathname = "/" + parts.slice(0, i + 1).join("/") + "/";
        return c.toString();
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function validateGiftDirectory(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DorokartesCleanup/1.0; +https://dorokartes.gr)",
        accept: "text/html,application/xhtml+xml"
      }
    });
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html")) return null;
    const html = (await r.text()).toLowerCase();
    const links = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
      .map(m=>m[1])
      .filter(x=>/gift|voucher|δωρο|dwro/i.test(x));
    const hasGift = /gift\s*card|giftcard|gift\s*voucher|voucher|δωροκάρτ|δωροκαρτ|δωροεπιταγ/.test(html);
    if (!hasGift || links.length < 3) return null;
    return r.url;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const cards = await prisma.giftCard.findMany({
    where: { status: { in: ["ACTIVE","DRAFT","HIDDEN"] } },
    orderBy: [{ merchant: { name: "asc" } }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      officialUrl: true,
      merchant: { select: { id: true, name: true } }
    }
  });

  let autoSafe = 0, review = 0, merchantUpdates = 0, titleUpdates = 0, urlUpdates = 0;

  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  console.log(`Cards scanned: ${cards.length}\n`);

  for (const card of cards) {
    const joinedAmounts = amounts(`${card.merchant.name} ${card.title}`);
    if (!joinedAmounts.length) continue;

    const currentMerchant = card.merchant.name;

    // v6 is intentionally strict:
    // auto-fix ONLY when the MERCHANT NAME ITSELF is polluted by denomination/gift-card text.
    if (!merchantLooksPolluted(currentMerchant)) {
      console.log(`REVIEW | ${currentMerchant} | ${card.title} | reason=merchant-name-clean`);
      review++;
      continue;
    }

    const proposedMerchant = cleanMerchant(currentMerchant);

    if (!cleanLooksSafe(proposedMerchant) || !titleSupportsBrand(card.title, proposedMerchant)) {
      console.log(`REVIEW | ${currentMerchant} | ${card.title} | proposed=${proposedMerchant || "—"} | reason=unsafe-brand-recovery`);
      review++;
      continue;
    }

    const proposedTitle = `${proposedMerchant} Gift Card`;

    let proposedUrl: string | null = null;
    const candidate = generalGiftDirectoryCandidate(card.officialUrl);
    if (candidate) {
      proposedUrl = await validateGiftDirectory(candidate);
    }

    console.log(`SAFE | ${currentMerchant} -> ${proposedMerchant}`);
    console.log(`     CARD: ${card.title} -> ${proposedTitle}`);
    console.log(`     VALUES: ${joinedAmounts.map(v=>`€${v}`).join(", ")}`);
    if (proposedUrl) console.log(`     URL: ${card.officialUrl || "—"} -> ${proposedUrl}`);

    autoSafe++;

    if (!APPLY) continue;

    if (proposedMerchant !== currentMerchant) {
      await prisma.merchant.update({
        where: { id: card.merchant.id },
        data: { name: proposedMerchant }
      });
      merchantUpdates++;
    }

    const data: any = {};
    if (card.title !== proposedTitle) data.title = proposedTitle;
    if (proposedUrl && proposedUrl !== card.officialUrl) data.officialUrl = proposedUrl;

    if (Object.keys(data).length) {
      await prisma.giftCard.update({ where: { id: card.id }, data });
      if (data.title) titleUpdates++;
      if (data.officialUrl) urlUpdates++;
    }
  }

  console.log("\nSummary");
  console.log(`Auto-safe: ${autoSafe}`);
  console.log(`Manual review: ${review}`);

  if (APPLY) {
    console.log(`Merchant names updated: ${merchantUpdates}`);
    console.log(`Gift-card titles updated: ${titleUpdates}`);
    console.log(`Official URLs updated: ${urlUpdates}`);
  } else {
    console.log("PREVIEW ONLY — database unchanged.");
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
