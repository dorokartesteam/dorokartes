import "dotenv/config";
import {
  PrismaClient,
  GiftCardStatus,
  VerificationStatus,
  VerificationResult,
  ReviewFlagType,
  ReviewFlagStatus,
} from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  fetchHttp,
  fetchPlaywright,
  looksJavascriptThin,
} from "../core/fetch-evidence";
import { classifyPreflight } from "../core/preflight";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const LIMIT = Number(process.env.REVERIFY_BATCH_SIZE || "25");
const REVIEW_DAYS = Number(process.env.REVERIFY_DAYS || "30");
const RETRY_DAYS = Number(process.env.REVERIFY_RETRY_DAYS || "7");

function dateAfterDays(days: number) {
  return new Date(Date.now() + days * 86400_000);
}

async function openFlag(
  giftCardId: string,
  type: ReviewFlagType,
  oldValue: string | null,
  newValue: string | null,
  reason: string,
) {
  const existing = await prisma.productionReviewFlag.findFirst({
    where: {
      giftCardId,
      type,
      status: ReviewFlagStatus.OPEN,
      newValue,
    },
  });

  if (!existing) {
    await prisma.productionReviewFlag.create({
      data: { giftCardId, type, oldValue, newValue, reason },
    });
  }
}

async function latestSemanticRole(url: string) {
  const manual = await prisma.manualVerificationOverride.findUnique({
    where: { sourceUrl: url },
  });

  if (manual?.active) return manual.forcedPageRole;

  const attempt = await prisma.discoveryVerificationAttempt.findFirst({
    where: { requestedUrl: url },
    orderBy: { checkedAt: "desc" },
    select: { pageRole: true },
  });

  return attempt?.pageRole ?? null;
}

async function main() {
  const now = new Date();

  const cards = await prisma.giftCard.findMany({
    where: {
      status: GiftCardStatus.ACTIVE,
      verificationStatus: VerificationStatus.VERIFIED,
      officialUrl: { not: null },
      ...(FORCE
        ? {}
        : {
            OR: [
              { nextReviewAt: null },
              { nextReviewAt: { lte: now } },
            ],
          }),
    },
    orderBy: { nextReviewAt: "asc" },
    take: LIMIT,
  });

  console.log("Dorokartes Production Reverify");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Force: ${FORCE}`);
  console.log(`Due cards: ${cards.length}`);
  console.log("");

  let baselined = 0;
  let unchanged = 0;
  let changed = 0;
  let unavailable = 0;

  for (const card of cards) {
    const url = card.officialUrl!;
    console.log(`=== ${card.title} ===`);
    console.log(url);

    let evidence = await fetchHttp(url);

    if (!evidence || looksJavascriptThin(evidence)) {
      const browser = await fetchPlaywright(url);
      if (browser) evidence = browser;
    }

    const previous = await prisma.productionVerificationSnapshot.findFirst({
      where: { giftCardId: card.id },
      orderBy: { observedAt: "desc" },
    });

    if (!evidence) {
      unavailable++;
      console.log(
        previous
          ? "  -> UNAVAILABLE: no evidence"
          : "  -> BASELINE UNAVAILABLE: no evidence (no change decision)",
      );

      if (APPLY) {
        await prisma.productionVerificationSnapshot.create({
          data: {
            giftCardId: card.id,
            officialUrl: url,
            contentHash: null,
            pageRole: await latestSemanticRole(url),
            httpStatus: null,
            fetchTier: null,
            preflightKind: "NO_EVIDENCE",
            source: previous ? "REVERIFY" : "BASELINE",
          },
        });

        await prisma.verificationEvent.create({
          data: {
            giftCardId: card.id,
            result: VerificationResult.UNAVAILABLE,
            url,
            notes: previous
              ? "Scheduled reverify: no usable HTTP/Playwright evidence."
              : "Initial production baseline unavailable; no change inferred.",
          },
        });

        await prisma.giftCard.update({
          where: { id: card.id },
          data: { nextReviewAt: dateAfterDays(RETRY_DAYS) },
        });
      }

      continue;
    }

    const preflight = classifyPreflight(evidence);

    if (!preflight.usableForLlm) {
      unavailable++;
      console.log(
        previous
          ? `  -> UNAVAILABLE preflight=${preflight.kind}`
          : `  -> BASELINE UNAVAILABLE preflight=${preflight.kind} (no change decision)`,
      );

      if (APPLY) {
        await prisma.productionVerificationSnapshot.create({
          data: {
            giftCardId: card.id,
            officialUrl: url,
            contentHash: evidence.contentHash ?? null,
            pageRole: await latestSemanticRole(url),
            httpStatus: evidence.httpStatus ?? null,
            fetchTier: evidence.fetchTier ?? null,
            preflightKind: preflight.kind,
            source: previous ? "REVERIFY" : "BASELINE",
          },
        });

        await prisma.verificationEvent.create({
          data: {
            giftCardId: card.id,
            result: VerificationResult.UNAVAILABLE,
            url,
            notes: previous
              ? `Scheduled reverify preflight=${preflight.kind}; reasons=${preflight.reasonCodes.join(",")}.`
              : `Initial production baseline preflight=${preflight.kind}; no change inferred.`,
          },
        });

        await prisma.giftCard.update({
          where: { id: card.id },
          data: { nextReviewAt: dateAfterDays(RETRY_DAYS) },
        });
      }

      continue;
    }

    const currentRole = await latestSemanticRole(url);

    // First usable observation establishes the baseline. It is NOT a change.
    if (!previous || !previous.contentHash) {
      baselined++;
      console.log(`  -> BASELINE ESTABLISHED hash=${evidence.contentHash}`);

      if (APPLY) {
        await prisma.productionVerificationSnapshot.create({
          data: {
            giftCardId: card.id,
            officialUrl: url,
            contentHash: evidence.contentHash,
            pageRole: currentRole,
            httpStatus: evidence.httpStatus ?? null,
            fetchTier: evidence.fetchTier ?? null,
            preflightKind: preflight.kind,
            source: "BASELINE",
          },
        });

        await prisma.giftCard.update({
          where: { id: card.id },
          data: {
            lastVerifiedAt: new Date(),
            nextReviewAt: dateAfterDays(REVIEW_DAYS),
          },
        });

        await prisma.verificationEvent.create({
          data: {
            giftCardId: card.id,
            result: VerificationResult.PASSED,
            url,
            notes:
              `Initial production content baseline established; contentHash=${evidence.contentHash}; role=${currentRole ?? "UNKNOWN"}.`,
          },
        });
      }

      continue;
    }

    if (
      previous.contentHash === evidence.contentHash &&
      previous.officialUrl === url
    ) {
      unchanged++;
      console.log(`  -> UNCHANGED hash=${evidence.contentHash}`);

      if (APPLY) {
        await prisma.productionVerificationSnapshot.create({
          data: {
            giftCardId: card.id,
            officialUrl: url,
            contentHash: evidence.contentHash,
            pageRole: currentRole,
            httpStatus: evidence.httpStatus ?? null,
            fetchTier: evidence.fetchTier ?? null,
            preflightKind: preflight.kind,
            source: "REVERIFY",
          },
        });

        await prisma.giftCard.update({
          where: { id: card.id },
          data: {
            lastVerifiedAt: new Date(),
            nextReviewAt: dateAfterDays(REVIEW_DAYS),
          },
        });

        await prisma.verificationEvent.create({
          data: {
            giftCardId: card.id,
            result: VerificationResult.PASSED,
            url,
            notes:
              `Scheduled reverify unchanged contentHash=${evidence.contentHash}; role=${currentRole ?? "UNKNOWN"}.`,
          },
        });
      }

      continue;
    }

    changed++;
    console.log("  -> CONTENT CHANGED -> REVIEW REQUIRED");

    if (APPLY) {
      await prisma.productionVerificationSnapshot.create({
        data: {
          giftCardId: card.id,
          officialUrl: url,
          contentHash: evidence.contentHash,
          pageRole: currentRole,
          httpStatus: evidence.httpStatus ?? null,
          fetchTier: evidence.fetchTier ?? null,
          preflightKind: preflight.kind,
          source: "REVERIFY",
        },
      });

      await prisma.verificationEvent.create({
        data: {
          giftCardId: card.id,
          result: VerificationResult.CHANGED,
          url,
          notes:
            `Scheduled reverify content changed; previousHash=${previous.contentHash}; currentHash=${evidence.contentHash}.`,
        },
      });

      await openFlag(
        card.id,
        ReviewFlagType.CONTENT_CHANGED,
        previous.contentHash,
        evidence.contentHash,
        "Production page content changed. Human/semantic review required before production state changes.",
      );
    }
  }

  console.log("");
  console.log("====================================");
  console.log(`Baselines established: ${baselined}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Changed -> review: ${changed}`);
  console.log(`Unavailable: ${unavailable}`);

  if (!APPLY) {
    console.log("Dry run only. Production data unchanged.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
