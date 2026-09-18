
import "dotenv/config";
import { getDomain } from "tldts";
import {
  PrismaClient, DiscoveryStatus, SourceType, VerificationMethod,
  VerificationAttemptResult, VerificationPageRole, RediscoveryTaskStatus
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchHttp, fetchPlaywright, looksJavascriptThin } from "./fetch-evidence";
import { classifyPreflight } from "./preflight";
import {
  logHashComparison,
  recordFetchObservation,
  guardProductionRoleChange,
} from "./verification-guardrails";
import { classifyWithLlm, PROMPT_VERSION, VERIFICATION_TEMPERATURE, REASONING_EFFORT } from "./llm-classifier";
import {
  VERIFICATION_MODEL, VERIFY_POSITIVE_THRESHOLD, VERIFY_NEGATIVE_THRESHOLD
} from "./config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not defined");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.env.VERIFICATION_BATCH_SIZE || "25");
const USE_PLAYWRIGHT = process.env.VERIFICATION_USE_PLAYWRIGHT !== "false";
const USE_LLM = process.env.VERIFICATION_USE_LLM !== "false";
const RECHECK_OPEN_REDISCOVERY = process.argv.includes("--recheck-open");

function domainOf(url: string) {
  const u = new URL(url);
  return getDomain(u.hostname, { allowPrivateDomains: true }) ?? u.hostname.replace(/^www\./,"");
}

async function ensureRediscovery(item: any, reason: string) {
  const merchantDomain = domainOf(item.sourceUrl);
  const existing = await prisma.domainRediscoveryTask.findFirst({
    where: {
      merchantDomain,
      status: { in: [
        RediscoveryTaskStatus.PENDING,
        RediscoveryTaskStatus.RUNNING,
        RediscoveryTaskStatus.MANUAL_REVIEW
      ] }
    }
  });
  if (!existing) {
    await prisma.domainRediscoveryTask.create({
      data: {
        merchantDomain,
        merchantName: item.merchantName,
        triggerUrl: item.sourceUrl,
        triggerReason: reason
      }
    });
  }
}

async function updateItem(item: any, status: DiscoveryStatus, note: string, merchantName?: string | null) {
  if (!APPLY) return;
  await prisma.discoveryItem.update({
    where: { id: item.id },
    data: {
      status,
      merchantName: merchantName?.trim() || item.merchantName,
      processedAt: new Date(),
      notes: `${item.notes ?? ""} | ${note}`
    }
  });
}

async function main() {
  const rawItems = await prisma.discoveryItem.findMany({
    where: {
      sourceType: SourceType.OFFICIAL,
      status: {
        in: [DiscoveryStatus.DISCOVERED, DiscoveryStatus.QUEUED],
      },
      NOT: { sourceName: "Official Website Verifier" },
    },
    orderBy: { discoveredAt: "asc" },
    take: Math.max(LIMIT * 4, LIMIT),
  });

  const openTasks = RECHECK_OPEN_REDISCOVERY
    ? []
    : await prisma.domainRediscoveryTask.findMany({
        where: {
          status: {
            in: [
              RediscoveryTaskStatus.PENDING,
              RediscoveryTaskStatus.RUNNING,
              RediscoveryTaskStatus.MANUAL_REVIEW,
              RediscoveryTaskStatus.RESOLVED,
            ],
          },
        },
        select: {
          merchantDomain: true,
          triggerUrl: true,
        },
      });

  const openTaskKeys = new Set(
    openTasks.map(
      (t) => `${t.merchantDomain.toLowerCase()}|${t.triggerUrl}`,
    ),
  );

  const skippedOpen: typeof rawItems = [];

  const items = rawItems
    .filter((item) => {
      if (RECHECK_OPEN_REDISCOVERY) return true;

      const key =
        `${domainOf(item.sourceUrl).toLowerCase()}|${item.sourceUrl}`;

      if (openTaskKeys.has(key)) {
        skippedOpen.push(item);
        return false;
      }

      return true;
    })
    .slice(0, LIMIT);

  let verified=0,rejected=0,queued=0,browserUsed=0,llmCalls=0,cacheHits=0,manualHits=0;
  let inputTokens=0,outputTokens=0,totalTokens=0;

  console.log("Dorokartes Verification Engine");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Batch size: ${items.length}`);
  console.log(`Open rediscovery URLs skipped: ${skippedOpen.length}`);
  console.log(`Recheck open rediscovery: ${RECHECK_OPEN_REDISCOVERY}`);
  console.log("");

  for (const item of items) {
    console.log(`=== ${item.merchantName ?? item.sourceName} ===`);
    console.log(item.sourceUrl);

    const earlyManual = await prisma.manualVerificationOverride.findUnique({
      where: { sourceUrl: item.sourceUrl },
    });

    if (
      earlyManual?.active &&
      earlyManual.lockUntilContentChanges === false
    ) {
      manualHits++;

      const next = earlyManual.forcedStatus;

      if (next === DiscoveryStatus.VERIFIED) verified++;
      else if (next === DiscoveryStatus.REJECTED) rejected++;
      else queued++;

      console.log(
        `  -> ${next} UNCONDITIONAL_MANUAL_LOCK role=${earlyManual.forcedPageRole}`,
      );

      await updateItem(
        item,
        next,
        `Manual verification override by ${earlyManual.setBy}: ${earlyManual.reason}`,
        earlyManual.forcedMerchantName,
      );

      continue;
    }

    let evidence = await fetchHttp(item.sourceUrl);

    if ((!evidence || looksJavascriptThin(evidence)) && USE_PLAYWRIGHT) {
      browserUsed++;
      const b = await fetchPlaywright(item.sourceUrl);
      if (b) evidence = b;
    }

    if (!evidence) {
      queued++;
      console.log("  -> QUEUED (no usable evidence)");
      await updateItem(item, DiscoveryStatus.QUEUED, "No usable HTTP/Playwright evidence.");
      if (APPLY) await ensureRediscovery(item, "NO_USABLE_EVIDENCE");
      continue;
    }

    let preflight = classifyPreflight(evidence);

    // Retry one browser render for transient/soft states only.
    // Hard 401/403/404/410/429 and 5xx are not retried here.
    const hardHttpFailure =
      [401, 403, 404, 410, 429].includes(evidence.httpStatus ?? -1) ||
      ((evidence.httpStatus ?? 0) >= 500);

    if (
      USE_PLAYWRIGHT &&
      !preflight.usableForLlm &&
      !hardHttpFailure &&
      ["EMPTY", "NOT_FOUND", "BLOCKED"].includes(preflight.kind)
    ) {
      browserUsed++;
      const retryEvidence = await fetchPlaywright(item.sourceUrl);

      if (retryEvidence) {
        const retryPreflight = classifyPreflight(retryEvidence);

        console.log(
          `  -> preflight retry: ${preflight.kind} -> ${retryPreflight.kind}`,
        );

        evidence = retryEvidence;
        preflight = retryPreflight;
      }
    }

    if (!preflight.usableForLlm) {
      queued++;
      console.log(
        `  -> QUEUED preflight=${preflight.kind} reason=${preflight.reasonCodes.join(",")}`,
      );

      await updateItem(
        item,
        DiscoveryStatus.QUEUED,
        `Preflight blocked semantic verification: ${preflight.note}`,
      );

      if (APPLY) {
        await ensureRediscovery(
          item,
          `PREFLIGHT_${preflight.kind}:${preflight.reasonCodes.join(",")}`,
        );
      }

      continue;
    }
    await logHashComparison(
      prisma,
      item.id,
      evidence.contentHash ?? null,
    );

    if (APPLY) {
      await recordFetchObservation(prisma, {
        discoveryItemId: item.id,
        preflightKind: preflight.kind,
        contentHash: evidence.contentHash ?? null,
        httpStatus: evidence.httpStatus ?? null,
        fetchTier: evidence.fetchTier ?? null,
      });
    }


    const manual = await prisma.manualVerificationOverride.findUnique({
      where: { sourceUrl: item.sourceUrl }
    });

    const manualMatches = manual?.active && (
      !manual.lockUntilContentChanges ||
      !manual.contentHash ||
      manual.contentHash === evidence.contentHash
    );

    if (manualMatches && manual) {
      manualHits++;
      const next = manual.forcedStatus;
      if (next === DiscoveryStatus.VERIFIED) verified++;
      else if (next === DiscoveryStatus.REJECTED) rejected++;
      else queued++;
      console.log(`  -> ${next} MANUAL_LOCK role=${manual.forcedPageRole}`);
      await updateItem(item, next, `Manual override by ${manual.setBy}: ${manual.reason}`, manual.forcedMerchantName);
      if (APPLY && next !== DiscoveryStatus.VERIFIED) await ensureRediscovery(item, `MANUAL_${next}`);
      continue;
    }

    const cached = await prisma.discoveryVerificationAttempt.findFirst({
      where: {
        method: VerificationMethod.LLM,
        requestedUrl: item.sourceUrl,
        contentHash: evidence.contentHash,
        modelName: VERIFICATION_MODEL,
        promptVersion: PROMPT_VERSION,
        result: { in: [
          VerificationAttemptResult.PASSED,
          VerificationAttemptResult.FAILED,
          VerificationAttemptResult.AMBIGUOUS
        ] }
      },
      orderBy: { checkedAt: "desc" }
    });

    if (cached) {
      cacheHits++;
      let next = DiscoveryStatus.QUEUED;
      if (cached.result === VerificationAttemptResult.PASSED) { next=DiscoveryStatus.VERIFIED; verified++; }
      else if (cached.result === VerificationAttemptResult.FAILED) { next=DiscoveryStatus.REJECTED; rejected++; }
      else queued++;
      console.log(`  -> ${next} CACHE_HIT role=${cached.pageRole} confidence=${cached.confidence ?? "-"}`);
      await updateItem(item, next, `Cached LLM decision ${cached.id}; content unchanged.`);
      if (APPLY && next !== DiscoveryStatus.VERIFIED) await ensureRediscovery(item, `CACHED_${cached.pageRole}`);
      continue;
    }

    if (!USE_LLM) {
      queued++;
      console.log("  -> QUEUED (LLM disabled)");
      continue;
    }

    llmCalls++;

    try {
      const { classification, usage } = await classifyWithLlm(
        item.merchantName, item.possibleOfficialUrl, evidence
      );

      inputTokens += usage.inputTokens ?? 0;
      outputTokens += usage.outputTokens ?? 0;
      totalTokens += usage.totalTokens ?? 0;

      const positive =
        classification.isGiftCardProgram &&
        ["CANONICAL_PURCHASE","CHECKOUT"].includes(classification.pageRole) &&
        classification.confidence >= VERIFY_POSITIVE_THRESHOLD;

      const negative =
        !classification.isGiftCardProgram &&
        classification.confidence >= VERIFY_NEGATIVE_THRESHOLD;

      let next = DiscoveryStatus.QUEUED;
      let result = VerificationAttemptResult.AMBIGUOUS;
      if (positive) {
        const roleGuard = await guardProductionRoleChange(prisma, {
          officialUrl: item.sourceUrl,
          newRole: classification.pageRole as VerificationPageRole,
        });

        if (roleGuard.blocked) {
          next = DiscoveryStatus.QUEUED;
          result = VerificationAttemptResult.AMBIGUOUS;
          queued++;

          console.log(
            `  -> REVIEW_REQUIRED role changed ${roleGuard.previousRole} -> ${classification.pageRole}`,
          );
        } else {
          next = DiscoveryStatus.VERIFIED;
          result = VerificationAttemptResult.PASSED;
          verified++;
        }
      } else if (negative) { next=DiscoveryStatus.REJECTED; result=VerificationAttemptResult.FAILED; rejected++; }
      else queued++;

      console.log(`  -> ${next} role=${classification.pageRole} confidence=${classification.confidence.toFixed(2)} type=${classification.giftCardType}`);

      if (APPLY) {
        await prisma.discoveryVerificationAttempt.create({
          data: {
            discoveryItemId: item.id,
            method: VerificationMethod.LLM,
            result,
            pageRole: classification.pageRole as VerificationPageRole,
            requestedUrl: item.sourceUrl,
            finalUrl: evidence.finalUrl,
            httpStatus: evidence.httpStatus,
            confidence: classification.confidence,
            modelName: VERIFICATION_MODEL,
            promptVersion: PROMPT_VERSION,
            contentHash: evidence.contentHash,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            cacheHit: false,
            reasonCodes: classification.reasonCodes,
            evidence: {
              evidence: classification.evidence,
              merchantName: classification.merchantName,
              giftCardType: classification.giftCardType,
              purchasePossible: classification.purchasePossible,
              isGiftCardProgram: classification.isGiftCardProgram,
              fetchTier: evidence.fetchTier
            }
          }
        });
      }

      await updateItem(
        item, next,
        `Semantic verification role=${classification.pageRole}; confidence=${classification.confidence}; hash=${evidence.contentHash}`,
        classification.merchantName
      );

      if (APPLY && next !== DiscoveryStatus.VERIFIED) {
        await ensureRediscovery(item, `${classification.pageRole}:${classification.reasonCodes.join(",")}`);
      }
    } catch (e) {
      queued++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  -> QUEUED (LLM error: ${msg})`);
      await updateItem(item, DiscoveryStatus.QUEUED, `LLM error: ${msg.slice(0,500)}`);
    }
  }

  console.log("");
  console.log("====================================");
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Processed: ${items.length}`);
  console.log(`VERIFIED decisions: ${verified}`);
  console.log(`REJECTED URL decisions: ${rejected}`);
  console.log(`QUEUED/ambiguous: ${queued}`);
  console.log(`Playwright used: ${browserUsed}`);
  console.log(`Manual locks reused: ${manualHits}`);
  console.log(`LLM cache hits: ${cacheHits}`);
  console.log(`NEW LLM calls: ${llmCalls}`);
  console.log(`Input tokens: ${inputTokens}`);
  console.log(`Output tokens: ${outputTokens}`);
  console.log(`Total tokens: ${totalTokens}`);
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
}).finally(async () => prisma.$disconnect());
