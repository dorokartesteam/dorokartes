import "dotenv/config";
import { getDomain } from "tldts";
import {
  PrismaClient,
  DiscoveryStatus,
  SourceType,
  VerificationPageRole,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCORING_CONFIG, SCORING_MODEL_KEY } from "../core/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");

function domainOf(input: string) {
  const u = new URL(input);
  return (
    getDomain(u.hostname, { allowPrivateDomains: true }) ??
    u.hostname.replace(/^www\./, "").toLowerCase()
  );
}

function norm(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function urlHeuristic(url: string) {
  const path = new URL(url).pathname.toLowerCase();
  if (/terms|oroi|conditions|legal|consents/.test(path)) return "TERMS";
  if (/checkout|\/buy(\/|$)|purchase/.test(path)) return "CHECKOUT";
  if (/promo|promotion|contest|christmas|black-friday|xmas/.test(path)) return "PROMOTION";
  if (/blog|news|events|articles|gift-guide|gift-wrapping|packaging/.test(path)) return "CONTENT";
  if (/gift-card|giftcard|e-gift|egift|gift-voucher|dorokarta|dwrokarta|doroepitagi|sky-gift|send-gift-card/.test(path)) {
    return "CANONICAL_PURCHASE";
  }
  if (path === "/" || path === "") return "GENERIC";
  return "UNKNOWN";
}

function scoreRole(role: string) {
  switch (role) {
    case "CANONICAL_PURCHASE": return SCORING_CONFIG.canonicalUrl;
    case "CHECKOUT": return SCORING_CONFIG.checkout;
    case "TERMS": return SCORING_CONFIG.terms;
    case "PROMOTION": return SCORING_CONFIG.promotion;
    case "CONTENT":
    case "GIFT_GUIDE": return SCORING_CONFIG.content;
    case "GENERIC": return SCORING_CONFIG.homepage;
    default: return 0;
  }
}

async function latestRole(discoveryItemId: string, sourceUrl: string) {
  const manual = await prisma.manualVerificationOverride.findUnique({
    where: { sourceUrl },
  });
  if (manual?.active) return manual.forcedPageRole;

  const attempt = await prisma.discoveryVerificationAttempt.findFirst({
    where: { discoveryItemId },
    orderBy: { checkedAt: "desc" },
    select: { pageRole: true },
  });

  return attempt?.pageRole ?? null;
}

async function main() {
  const scoringModel = await prisma.scoringModelVersion.findUnique({
    where: { key: SCORING_MODEL_KEY },
  });

  if (!scoringModel?.active) {
    throw new Error(
      `Active scoring model ${SCORING_MODEL_KEY} not found. Run pipeline:governance first.`,
    );
  }

  const rows = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: {
        in: [
          DiscoveryStatus.VERIFIED,
          DiscoveryStatus.QUEUED,
          DiscoveryStatus.DISCOVERED,
          DiscoveryStatus.DUPLICATE,
          DiscoveryStatus.REJECTED,
        ],
      },
      NOT: { sourceName: "Official Website Verifier" },
    },
    orderBy: { discoveredAt: "asc" },
  });

  const overrides = await prisma.manualCanonicalOverride.findMany({
    where: { active: true },
  });
  const overrideByDomain = new Map(
    overrides.map((x) => [x.merchantDomain.toLowerCase(), x]),
  );

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const d = domainOf(row.sourceUrl);
    const list = groups.get(d) ?? [];
    list.push(row);
    groups.set(d, list);
  }

  let run: any = null;
  if (APPLY) {
    run = await prisma.canonicalizationRun.create({
      data: {
        scoringModelKey: SCORING_MODEL_KEY,
        dryRun: false,
      },
    });
  }

  let winners = 0;
  let overrideCount = 0;
  let manualReview = 0;
  let errors = 0;

  for (const [domain, group] of [...groups.entries()].sort()) {
    const ranked = [];

    for (const row of group) {
      const semanticRole = await latestRole(row.id, row.sourceUrl);
      const role = semanticRole ?? urlHeuristic(row.sourceUrl);

      let score = row.status === DiscoveryStatus.VERIFIED
        ? SCORING_CONFIG.verified
        : row.status === DiscoveryStatus.QUEUED
          ? SCORING_CONFIG.queued
          : 0;

      const reasons = [
        row.status === DiscoveryStatus.VERIFIED ? `+${SCORING_CONFIG.verified} VERIFIED` :
        row.status === DiscoveryStatus.QUEUED ? `+${SCORING_CONFIG.queued} QUEUED` : "status neutral",
      ];

      const rolePoints = scoreRole(String(role));
      score += rolePoints;
      reasons.push(`${rolePoints >= 0 ? "+" : ""}${rolePoints} role=${role}`);

      const title = norm(row.title ?? "");
      if (
        title.includes("gift card") ||
        title.includes("gift voucher") ||
        title.includes("δωροκαρτα") ||
        title.includes("δωροεπιταγη")
      ) {
        score += SCORING_CONFIG.strongTitle;
        reasons.push(`+${SCORING_CONFIG.strongTitle} strong title`);
      }

      const path = new URL(row.sourceUrl).pathname;
      if (/\/el(\/|$)|\/el-gr(\/|$)|\/grc(\/|$)/i.test(path)) {
        score += SCORING_CONFIG.greekLocale;
        reasons.push(`+${SCORING_CONFIG.greekLocale} Greek locale`);
      }

      ranked.push({ row, role: String(role), score, reasons });
    }

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new URL(a.row.sourceUrl).pathname.length -
        new URL(b.row.sourceUrl).pathname.length;
    });

    const verified = ranked.filter((x) => x.row.status === DiscoveryStatus.VERIFIED);
    const override = overrideByDomain.get(domain);
    let winner = verified[0] ?? null;
    let overrideApplied = false;

    if (override) {
      const forced = verified.find((x) => x.row.sourceUrl === override.forcedUrl);
      if (forced) {
        winner = forced;
        overrideApplied = true;
        overrideCount++;
      } else {
        console.log(`\n=== ${domain} ===`);
        console.log(`MANUAL REVIEW: canonical override URL is not VERIFIED`);
        console.log(`forced=${override.forcedUrl}`);
        manualReview++;
        errors++;

        if (APPLY && run) {
          for (const x of ranked) {
            await prisma.canonicalizationDecision.create({
              data: {
                runId: run.id,
                merchantDomain: domain,
                candidateUrl: x.row.sourceUrl,
                candidateKind: x.role,
                score: x.score,
                selected: false,
                overrideApplied: false,
                reasonCodes: x.reasons,
                notes: `Override requires VERIFIED URL: ${override.forcedUrl}`,
              },
            });
          }
        }
        continue;
      }
    }

    console.log(`\n=== ${domain} ===`);

    if (!winner) {
      console.log("NO VERIFIED CANONICAL WINNER -> manual review");
      manualReview++;
      continue;
    }

    winners++;
    console.log(`CANONICAL -> ${winner.row.sourceUrl}`);
    console.log(`role=${winner.role} score=${winner.score}`);
    if (overrideApplied) console.log("MANUAL CANONICAL OVERRIDE APPLIED");

    if (APPLY) {
      // Only demote OTHER VERIFIED rows. Never destroy queued/discovered candidates.
      for (const x of ranked) {
        if (x.row.id === winner.row.id) continue;
        if (x.row.status !== DiscoveryStatus.VERIFIED) continue;

        await prisma.discoveryItem.update({
          where: { id: x.row.id },
          data: {
            status: DiscoveryStatus.DUPLICATE,
            processedAt: new Date(),
            notes:
              `${x.row.notes ?? ""} | Stable canonicalizer: duplicate under ${winner.row.sourceUrl}.`,
          },
        });
      }

      await prisma.discoveryItem.update({
        where: { id: winner.row.id },
        data: {
          status: DiscoveryStatus.VERIFIED,
          processedAt: new Date(),
          merchantName:
            override?.forcedMerchantName?.trim() ||
            winner.row.merchantName,
          notes:
            `${winner.row.notes ?? ""} | Stable canonicalizer ${SCORING_MODEL_KEY}: selected.`,
        },
      });

      if (run) {
        for (const x of ranked) {
          await prisma.canonicalizationDecision.create({
            data: {
              runId: run.id,
              merchantDomain: domain,
              candidateUrl: x.row.sourceUrl,
              candidateKind: x.role,
              score: x.score,
              selected: x.row.id === winner.row.id,
              overrideApplied:
                overrideApplied && x.row.id === winner.row.id,
              reasonCodes: x.reasons,
              notes: overrideApplied ? override?.reason : null,
            },
          });
        }
      }
    }
  }

  if (APPLY && run) {
    await prisma.canonicalizationRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        domainsProcessed: groups.size,
        winnersSelected: winners,
        overridesApplied: overrideCount,
        errors,
        notes: `manualReview=${manualReview}`,
      },
    });
  }

  console.log("\n====================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Domains processed: ${groups.size}`);
  console.log(`Canonical winners: ${winners}`);
  console.log(`Overrides applied: ${overrideCount}`);
  console.log(`Manual review: ${manualReview}`);
  console.log(`Errors: ${errors}`);

  if (!APPLY) {
    console.log("Dry run only. No discovery statuses changed.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
