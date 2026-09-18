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

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

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

function normalizeText(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function registrableDomain(input: string) {
  const url = safeUrl(input);
  if (!url) return input.toLowerCase();

  return (
    getDomain(url.hostname, { allowPrivateDomains: true }) ??
    url.hostname.replace(/^www\./, "").toLowerCase()
  );
}

const TERMS_PATTERNS = [
  /\/terms?(\/|$)/i,
  /terms-and-conditions/i,
  /gift-terms/i,
  /oroi[-_/]?hrisis/i,
  /conditions/i,
  /legalframework/i,
  /marketingandcontestterms/i,
];

const CHECKOUT_PATTERNS = [
  /checkout/i,
  /buy-now/i,
  /\/buy(\/|$)/i,
  /purchase-gift/i,
];

const PROMO_PATTERNS = [
  /\/collection\//i,
  /\/promo/i,
  /promotion/i,
  /contest/i,
  /doroepitagi.*20/i,
  /20.*doroepitagi/i,
  /spring-gift/i,
  /spring-gifts/i,
  /holiday-gift/i,
  /xmas/i,
  /christmas/i,
  /black-friday/i,
];

const CONTENT_PATTERNS = [
  /\/events?\//i,
  /\/blog\//i,
  /\/news\//i,
  /\/articles?\//i,
  /gift-guide/i,
  /gift-finder/i,
  /gift-wrapping/i,
  /packaging/i,
  /engraving/i,
  /\/product\/dora\//i,
];

const CANONICAL_HINTS = [
  "gift-card",
  "giftcard",
  "gift-cards",
  "e-gift",
  "egift",
  "gift-voucher",
  "gift-vouchers",
  "dorokarta",
  "dwrokarta",
  "doroepitagi",
  "doroepitage",
  "sky-gift",
  "send-gift-card",
];

function classify(row: Row): Kind {
  const url = safeUrl(row.sourceUrl);
  const raw = row.sourceUrl.toLowerCase();
  const path = url?.pathname.toLowerCase() ?? raw;

  if (TERMS_PATTERNS.some((r) => r.test(path))) return "TERMS";
  if (CHECKOUT_PATTERNS.some((r) => r.test(path))) return "CHECKOUT";
  if (PROMO_PATTERNS.some((r) => r.test(path))) return "PROMO";
  if (CONTENT_PATTERNS.some((r) => r.test(path))) return "CONTENT";

  if (
    CANONICAL_HINTS.some((hint) => path.includes(hint)) ||
    CANONICAL_HINTS.some((hint) => raw.includes(hint))
  ) {
    return "CANONICAL";
  }

  if (url && (path === "/" || path === "")) return "HOMEPAGE";

  return "OTHER";
}

function score(row: Row): { score: number; reasons: string[] } {
  let value = 0;
  const reasons: string[] = [];
  const kind = classify(row);
  const title = normalizeText(row.title ?? "");
  const url = row.sourceUrl.toLowerCase();

  if (row.status === DiscoveryStatus.VERIFIED) {
    value += 50;
    reasons.push("+50 VERIFIED");
  } else if (row.status === DiscoveryStatus.QUEUED) {
    value += 15;
    reasons.push("+15 QUEUED");
  } else if (row.status === DiscoveryStatus.DISCOVERED) {
    value += 5;
    reasons.push("+5 DISCOVERED");
  }

  if (kind === "CANONICAL") {
    value += 40;
    reasons.push("+40 canonical-looking URL");
  } else if (kind === "CHECKOUT") {
    value += 20;
    reasons.push("+20 checkout");
  } else if (kind === "TERMS") {
    value -= 35;
    reasons.push("-35 terms");
  } else if (kind === "PROMO") {
    value -= 70;
    reasons.push("-70 promotion");
  } else if (kind === "CONTENT") {
    value -= 60;
    reasons.push("-60 content/event");
  } else if (kind === "HOMEPAGE") {
    value -= 10;
    reasons.push("-10 homepage");
  }

  if (
    title.includes("gift card") ||
    title.includes("gift voucher") ||
    title.includes("δωροκαρτα") ||
    title.includes("δωροεπιταγη")
  ) {
    value += 15;
    reasons.push("+15 gift-card title");
  }

  if (/\/product\/dora\//i.test(url)) {
    value -= 60;
    reasons.push("-60 ordinary gift-product path");
  }

  if (
    /gift[-_ ]?card/i.test(url) ||
    /dorokarta|dwrokarta|doroepit/i.test(url)
  ) {
    value += 10;
    reasons.push("+10 strong URL token");
  }

  return { score: value, reasons };
}

function merchantLabel(group: RankedRow[]) {
  // Prefer human-entered/seeded merchant names from the shortest/strongest rows.
  const names = group
    .map((x) => x.merchantName?.trim())
    .filter((x): x is string => Boolean(x));

  if (names.length) {
    const counts = new Map<string, number>();
    for (const name of names) {
      const key = normalizeText(name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const bestKey = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    const original = names.find((name) => normalizeText(name) === bestKey);
    if (original) return original;
  }

  return group[0]?.domain ?? "unknown";
}

async function main() {
  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      NOT: {
        sourceName: "Official Website Verifier",
      },
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
      id: true,
      sourceName: true,
      sourceUrl: true,
      merchantName: true,
      title: true,
      status: true,
      notes: true,
      discoveredAt: true,
    },
    orderBy: {
      discoveredAt: "asc",
    },
  });

  const groups = new Map<string, RankedRow[]>();

  for (const row of rows) {
    const domain = registrableDomain(row.sourceUrl);
    const result = score(row);

    const ranked: RankedRow = {
      ...row,
      domain,
      kind: classify(row),
      score: result.score,
      reasons: result.reasons,
    };

    const list = groups.get(domain) ?? [];
    list.push(ranked);
    groups.set(domain, list);
  }

  const report: any[] = [];

  let merchantGroups = 0;
  let canonicalSelected = 0;
  let duplicates = 0;
  let rejected = 0;
  let review = 0;

  for (const [domain, group] of [...groups.entries()].sort()) {
    merchantGroups++;

    const ranked = [...group].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      // Prefer shorter paths when score ties.
      const aPath = safeUrl(a.sourceUrl)?.pathname.length ?? 9999;
      const bPath = safeUrl(b.sourceUrl)?.pathname.length ?? 9999;
      return aPath - bPath;
    });

    const usable = ranked.filter(
      (x) => x.kind !== "PROMO" && x.kind !== "CONTENT" && x.kind !== "TERMS"
    );

    const winner = usable[0];
    const merchant = merchantLabel(ranked);

    console.log("");
    console.log(`=== ${merchant} (${domain}) ===`);

    if (!winner || winner.score < 25) {
      console.log("NO SAFE CANONICAL WINNER -> manual review");

      for (const row of ranked) {
        console.log(`  [${row.kind}] ${row.score} ${row.sourceUrl}`);

        if (APPLY) {
          await prisma.discoveryItem.update({
            where: { id: row.id },
            data: {
              status:
                row.kind === "PROMO" || row.kind === "CONTENT"
                  ? DiscoveryStatus.REJECTED
                  : DiscoveryStatus.QUEUED,
              processedAt: new Date(),
              notes: `${row.notes ?? ""} | Canonicalizer v2: no safe domain-level canonical winner; manual review required.`,
            },
          });
        }

        if (row.kind === "PROMO" || row.kind === "CONTENT") rejected++;
        else review++;
      }

      report.push({
        domain,
        merchant,
        canonical: null,
        decision: "MANUAL_REVIEW",
        rows: ranked.map((x) => ({
          url: x.sourceUrl,
          kind: x.kind,
          score: x.score,
          status: x.status,
          reasons: x.reasons,
        })),
      });

      continue;
    }

    canonicalSelected++;

    console.log(`CANONICAL -> ${winner.sourceUrl}`);
    console.log(`score=${winner.score} kind=${winner.kind}`);

    if (APPLY) {
      // Preserve VERIFIED if already verified. Otherwise keep QUEUED.
      const winnerStatus =
        winner.status === DiscoveryStatus.VERIFIED
          ? DiscoveryStatus.VERIFIED
          : DiscoveryStatus.QUEUED;

      await prisma.discoveryItem.update({
        where: { id: winner.id },
        data: {
          status: winnerStatus,
          processedAt: new Date(),
          notes: `${winner.notes ?? ""} | Canonicalizer v2: selected domain-level canonical official gift-card URL for ${domain}.`,
        },
      });
    }

    for (const row of ranked) {
      if (row.id === winner.id) continue;

      let nextStatus: DiscoveryStatus;

      if (row.kind === "PROMO" || row.kind === "CONTENT") {
        nextStatus = DiscoveryStatus.REJECTED;
        rejected++;
      } else {
        nextStatus = DiscoveryStatus.DUPLICATE;
        duplicates++;
      }

      console.log(
        `  ${nextStatus.padEnd(9)} [${row.kind}] ${row.score} ${row.sourceUrl}`,
      );

      if (APPLY) {
        await prisma.discoveryItem.update({
          where: { id: row.id },
          data: {
            status: nextStatus,
            processedAt: new Date(),
            notes: `${row.notes ?? ""} | Canonicalizer v2: ${nextStatus.toLowerCase()} under canonical ${winner.sourceUrl}.`,
          },
        });
      }
    }

    report.push({
      domain,
      merchant,
      canonical: {
        id: winner.id,
        url: winner.sourceUrl,
        kind: winner.kind,
        score: winner.score,
        previousStatus: winner.status,
        reasons: winner.reasons,
      },
      decision: "CANONICAL_SELECTED",
      rows: ranked.map((x) => ({
        url: x.sourceUrl,
        kind: x.kind,
        score: x.score,
        status: x.status,
        reasons: x.reasons,
      })),
    });
  }

  const reportPath = resolve(
    process.cwd(),
    "data/discovery/canonical-v2-report.json",
  );

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("");
  console.log("====================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Domain merchant groups: ${merchantGroups}`);
  console.log(`Canonical winners: ${canonicalSelected}`);
  console.log(`Duplicates: ${duplicates}`);
  console.log(`Rejected promo/content: ${rejected}`);
  console.log(`Manual review rows: ${review}`);
  console.log(`Report: ${reportPath}`);

  if (!APPLY) {
    console.log("");
    console.log("No database rows were changed.");
    console.log("Review the output/report, then run with --apply.");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
