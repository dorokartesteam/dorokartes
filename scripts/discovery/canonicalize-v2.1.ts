import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");

type Row = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  merchantName: string | null;
  title: string | null;
  status: DiscoveryStatus;
  notes: string | null;
  discoveredAt: Date;
};

type Kind =
  | "CANONICAL"
  | "CHECKOUT"
  | "TERMS"
  | "PROMO"
  | "CONTENT"
  | "HOMEPAGE"
  | "OTHER";

type RankedRow = Row & {
  domain: string;
  kind: Kind;
  score: number;
  reasons: string[];
};

function norm(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(input: string) {
  try { return new URL(input); } catch { return null; }
}

function domainOf(input: string) {
  const u = safeUrl(input);
  if (!u) return input.toLowerCase();
  return getDomain(u.hostname, { allowPrivateDomains: true })
    ?? u.hostname.replace(/^www\./, "").toLowerCase();
}

const TERMS = [
  /\/terms?(\/|$)/i, /terms-and-conditions/i, /gift-terms/i,
  /oroi[-_/]?hrisis/i, /conditions/i, /legalframework/i,
  /marketingandcontestterms/i,
];

const CHECKOUT = [/checkout/i, /buy-now/i, /\/buy(\/|$)/i, /purchase-gift/i];

const PROMO = [
  /\/collection\//i, /\/promo/i, /promotion/i, /contest/i,
  /doroepitagi.*20/i, /20.*doroepitagi/i,
  /spring-gift/i, /holiday-gift/i, /xmas/i, /christmas/i, /black-friday/i,
];

const CONTENT = [
  /\/events?\//i, /\/blog\//i, /\/news\//i, /\/articles?\//i,
  /gift-guide/i, /gift-finder/i, /gift-wrapping/i, /packaging/i,
  /engraving/i, /\/product\/dora\//i,
];

const CANONICAL_HINTS = [
  "gift-card", "giftcard", "gift-cards", "e-gift", "egift",
  "gift-voucher", "gift-vouchers", "dorokarta", "dwrokarta",
  "doroepitagi", "doroepitage", "sky-gift", "send-gift-card",
];

function classify(row: Row): Kind {
  const u = safeUrl(row.sourceUrl);
  const path = (u?.pathname ?? row.sourceUrl).toLowerCase();

  if (TERMS.some(r => r.test(path))) return "TERMS";
  if (CHECKOUT.some(r => r.test(path))) return "CHECKOUT";
  if (PROMO.some(r => r.test(path))) return "PROMO";
  if (CONTENT.some(r => r.test(path))) return "CONTENT";
  if (CANONICAL_HINTS.some(h => path.includes(h))) return "CANONICAL";
  if (u && (path === "/" || path === "")) return "HOMEPAGE";
  return "OTHER";
}

function finalUrlFromNotes(notes?: string | null) {
  if (!notes) return null;
  const m = notes.match(/Final URL:\s*(https?:\/\/\S+)/i);
  if (!m) return null;
  return m[1].replace(/[.)\],]+$/, "");
}

function isHomepageLikeTitle(title?: string | null) {
  const t = norm(title ?? "");
  return (
    t.includes("#1") ||
    t.includes("store online") ||
    t.includes("απολυτος προορισμος") ||
    t.length > 90
  );
}

function score(row: Row) {
  let value = 0;
  const reasons: string[] = [];
  const kind = classify(row);
  const u = safeUrl(row.sourceUrl);
  const path = (u?.pathname ?? "").toLowerCase();
  const title = norm(row.title ?? "");
  const finalUrl = finalUrlFromNotes(row.notes);

  if (row.status === DiscoveryStatus.VERIFIED) {
    value += 50; reasons.push("+50 VERIFIED");
  } else if (row.status === DiscoveryStatus.QUEUED) {
    value += 15; reasons.push("+15 QUEUED");
  }

  if (kind === "CANONICAL") {
    value += 40; reasons.push("+40 canonical URL");
  } else if (kind === "CHECKOUT") {
    value += 10; reasons.push("+10 checkout");
  } else if (kind === "TERMS") {
    value -= 40; reasons.push("-40 terms");
  } else if (kind === "PROMO") {
    value -= 80; reasons.push("-80 promo");
  } else if (kind === "CONTENT") {
    value -= 70; reasons.push("-70 content");
  } else if (kind === "HOMEPAGE") {
    value -= 20; reasons.push("-20 homepage");
  }

  if (
    title.includes("gift card") ||
    title.includes("gift voucher") ||
    title.includes("δωροκαρτα") ||
    title.includes("δωροεπιταγη")
  ) {
    value += 20; reasons.push("+20 strong title");
  }

  // Prefer Greek-localized pages for Greek catalog when quality is otherwise equal.
  if (/\/el(\/|$)/i.test(path) || /\/el-gr(\/|$)/i.test(path) || /\/grc(\/|$)/i.test(path)) {
    value += 12; reasons.push("+12 Greek locale");
  }

  // Prefer known direct "send/buy gift card" landing pages over guessed generic aliases.
  if (path.includes("send-gift-card")) {
    value += 18; reasons.push("+18 explicit send-gift-card landing");
  }

  // A concrete merchant e-gift-card product page is stronger than guessed aliases.
  if (/\/product\/.*(?:e-?gift-card|gift-card)/i.test(path)) {
    value += 18; reasons.push("+18 concrete gift-card product");
  }

  if (isHomepageLikeTitle(row.title)) {
    value -= 20; reasons.push("-20 homepage-like title");
  }

  // If a supposed gift-card URL silently ends at the homepage, it is likely a guessed/invalid alias.
  if (finalUrl) {
    const f = safeUrl(finalUrl);
    const sourceDomain = domainOf(row.sourceUrl);
    const finalDomain = domainOf(finalUrl);
    if (f && sourceDomain === finalDomain && (f.pathname === "/" || f.pathname === "")) {
      value -= 45; reasons.push("-45 redirected/resolved to homepage");
    }
  }

  return { score: value, reasons };
}

function merchantLabel(group: RankedRow[]) {
  // Favor short human merchant names, not page titles.
  const candidates = group
    .map(x => x.merchantName?.trim())
    .filter((x): x is string => Boolean(x))
    .filter(x => x.length <= 45);

  if (candidates.length) {
    const byNorm = new Map<string, { original: string; count: number }>();
    for (const c of candidates) {
      const k = norm(c);
      const prev = byNorm.get(k);
      byNorm.set(k, { original: prev?.original ?? c, count: (prev?.count ?? 0) + 1 });
    }
    return [...byNorm.values()].sort((a,b) => b.count - a.count)[0].original;
  }

  return group[0]?.domain ?? "unknown";
}

async function main() {
  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      NOT: { sourceName: "Official Website Verifier" },
      status: {
        in: [
          DiscoveryStatus.DISCOVERED,
          DiscoveryStatus.QUEUED,
          DiscoveryStatus.VERIFIED,
          DiscoveryStatus.DUPLICATE,
          DiscoveryStatus.REJECTED,
        ],
      },
    },
    select: {
      id: true, sourceName: true, sourceUrl: true, merchantName: true,
      title: true, status: true, notes: true, discoveredAt: true,
    },
    orderBy: { discoveredAt: "asc" },
  });

  const groups = new Map<string, RankedRow[]>();

  for (const row of rows) {
    const domain = domainOf(row.sourceUrl);
    const s = score(row);
    const ranked: RankedRow = {
      ...row,
      domain,
      kind: classify(row),
      score: s.score,
      reasons: s.reasons,
    };
    const list = groups.get(domain) ?? [];
    list.push(ranked);
    groups.set(domain, list);
  }

  const report: any[] = [];
  let winners = 0, dup = 0, rejected = 0, manual = 0;

  for (const [domain, group] of [...groups.entries()].sort()) {
    const ranked = [...group].sort((a,b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ap = safeUrl(a.sourceUrl)?.pathname.length ?? 9999;
      const bp = safeUrl(b.sourceUrl)?.pathname.length ?? 9999;
      return ap - bp;
    });

    const usable = ranked.filter(x =>
      !["PROMO","CONTENT","TERMS"].includes(x.kind)
    );

    const winner = usable[0];
    const merchant = merchantLabel(ranked);

    console.log(`\n=== ${merchant} (${domain}) ===`);

    if (!winner || winner.score < 25) {
      console.log("NO SAFE CANONICAL WINNER -> manual review");
      manual++;
      report.push({ domain, merchant, decision: "MANUAL_REVIEW", rows: ranked });
      continue;
    }

    winners++;
    console.log(`CANONICAL -> ${winner.sourceUrl}`);
    console.log(`score=${winner.score} kind=${winner.kind}`);
    console.log(`reasons=${winner.reasons.join("; ")}`);

    if (APPLY) {
      await prisma.discoveryItem.update({
        where: { id: winner.id },
        data: {
          status: winner.status === DiscoveryStatus.VERIFIED
            ? DiscoveryStatus.VERIFIED
            : DiscoveryStatus.QUEUED,
          processedAt: new Date(),
          notes: `${winner.notes ?? ""} | Canonicalizer v2.1: selected domain-level canonical official gift-card URL for ${domain}.`,
        },
      });
    }

    for (const row of ranked) {
      if (row.id === winner.id) continue;

      const next =
        row.kind === "PROMO" || row.kind === "CONTENT"
          ? DiscoveryStatus.REJECTED
          : DiscoveryStatus.DUPLICATE;

      if (next === DiscoveryStatus.REJECTED) rejected++;
      else dup++;

      console.log(`  ${next.padEnd(9)} [${row.kind}] ${row.score} ${row.sourceUrl}`);

      if (APPLY) {
        await prisma.discoveryItem.update({
          where: { id: row.id },
          data: {
            status: next,
            processedAt: new Date(),
            notes: `${row.notes ?? ""} | Canonicalizer v2.1: ${next.toLowerCase()} under canonical ${winner.sourceUrl}.`,
          },
        });
      }
    }

    report.push({
      domain, merchant, decision: "CANONICAL_SELECTED",
      canonical: {
        id: winner.id, url: winner.sourceUrl, score: winner.score,
        kind: winner.kind, reasons: winner.reasons,
      },
      rows: ranked.map(x => ({
        id: x.id, url: x.sourceUrl, score: x.score,
        kind: x.kind, status: x.status, reasons: x.reasons,
      })),
    });
  }

  const reportPath = resolve(process.cwd(), "data/discovery/canonical-v2.1-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n====================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Domain merchant groups: ${groups.size}`);
  console.log(`Canonical winners: ${winners}`);
  console.log(`Duplicates: ${dup}`);
  console.log(`Rejected promo/content: ${rejected}`);
  console.log(`Manual-review groups: ${manual}`);
  console.log(`Report: ${reportPath}`);
  if (!APPLY) console.log("No database rows were changed.");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
