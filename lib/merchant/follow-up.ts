import { prisma } from "@/lib/prisma";
import { addDays, hashToken, newToken, normalizeEmail } from "@/lib/merchant/security";
import { sendMerchantActivationReminder } from "@/lib/merchant/email";

export type MerchantActivationStage =
  | "INVITE_PENDING"
  | "SUBSCRIPTION_PENDING"
  | "CONVERTED"
  | "PAST_DUE"
  | "SUSPENDED"
  | "MISSING_PORTAL";

const DAY_MS = 86_400_000;
const INVITE_FIRST_DELAY_DAYS = 2;
const SUBSCRIPTION_FIRST_DELAY_DAYS = 2;
const REPEAT_DELAY_DAYS = 4;
const MAX_AUTOMATED_FOLLOWUPS = 6;

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

function stageLabel(stage: MerchantActivationStage) {
  if (stage === "INVITE_PENDING") return "Awaiting portal activation";
  if (stage === "SUBSCRIPTION_PENDING") return "Portal active · no active plan";
  if (stage === "CONVERTED") return "Active subscription";
  if (stage === "PAST_DUE") return "Past due";
  if (stage === "SUSPENDED") return "Portal suspended";
  return "Portal account missing";
}

export { stageLabel };

export async function getMerchantActivationData(now = new Date()) {
  const raw = await prisma.merchantLead.findMany({
    where: {
      status: "APPROVED",
      matchedMerchantId: { not: null },
    },
    orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      businessName: true,
      contactName: true,
      email: true,
      requestedPlan: true,
      reviewedAt: true,
      createdAt: true,
      matchedMerchantId: true,
      lastFollowUpAt: true,
      lastFollowUpStage: true,
      followUpCount: true,
      matchedMerchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
          logoUrl: true,
          subscription: {
            select: {
              plan: true,
              status: true,
              startsAt: true,
              endsAt: true,
            },
          },
          members: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              email: true,
              name: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              sessions: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  const seen = new Set<string>();
  const rows = [] as Array<{
    leadId: string;
    merchantId: string;
    merchantName: string;
    merchantSlug: string;
    contactName: string;
    email: string;
    requestedPlan: string | null;
    stage: MerchantActivationStage;
    stageLabel: string;
    stageSince: Date;
    stageAgeDays: number;
    lastFollowUpAt: Date | null;
    lastFollowUpStage: string | null;
    followUpCount: number;
    due: boolean;
    autoPaused: boolean;
    profileComplete: boolean;
    subscriptionStatus: string | null;
    subscriptionPlan: string | null;
  }>;

  for (const lead of raw) {
    if (!lead.matchedMerchant) continue;

    const normalizedLeadEmail = normalizeEmail(lead.email);
    const member =
      lead.matchedMerchant.members.find(
        (candidate) => normalizeEmail(candidate.email) === normalizedLeadEmail,
      ) || lead.matchedMerchant.members[0] || null;

    const dedupeKey = `${lead.matchedMerchant.id}:${normalizedLeadEmail}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const subscription = lead.matchedMerchant.subscription;
    let stage: MerchantActivationStage;
    let stageSince = lead.reviewedAt || lead.createdAt;

    if (!member) {
      stage = "MISSING_PORTAL";
    } else if (member.status === "SUSPENDED") {
      stage = "SUSPENDED";
      stageSince = member.updatedAt;
    } else if (member.status === "INVITED") {
      stage = "INVITE_PENDING";
      stageSince = lead.reviewedAt || member.createdAt;
    } else if (subscription?.status === "ACTIVE") {
      stage = "CONVERTED";
      stageSince = subscription.startsAt || member.sessions[0]?.createdAt || member.updatedAt;
    } else if (subscription?.status === "PAST_DUE") {
      stage = "PAST_DUE";
      stageSince = subscription.startsAt || member.sessions[0]?.createdAt || member.updatedAt;
    } else {
      stage = "SUBSCRIPTION_PENDING";
      stageSince = member.sessions[0]?.createdAt || member.updatedAt;
    }

    const age = daysBetween(stageSince, now);
    const autoPaused = lead.followUpCount >= MAX_AUTOMATED_FOLLOWUPS;
    const firstDelay =
      stage === "INVITE_PENDING"
        ? INVITE_FIRST_DELAY_DAYS
        : SUBSCRIPTION_FIRST_DELAY_DAYS;
    const sameStage = lead.lastFollowUpStage === stage;
    const repeatReady =
      !lead.lastFollowUpAt || daysBetween(lead.lastFollowUpAt, now) >= REPEAT_DELAY_DAYS;
    const due =
      !autoPaused &&
      (stage === "INVITE_PENDING" || stage === "SUBSCRIPTION_PENDING") &&
      age >= firstDelay &&
      (!sameStage || repeatReady);

    rows.push({
      leadId: lead.id,
      merchantId: lead.matchedMerchant.id,
      merchantName: lead.matchedMerchant.name,
      merchantSlug: lead.matchedMerchant.slug,
      contactName: lead.contactName,
      email: lead.email,
      requestedPlan: lead.requestedPlan,
      stage,
      stageLabel: stageLabel(stage),
      stageSince,
      stageAgeDays: age,
      lastFollowUpAt: lead.lastFollowUpAt,
      lastFollowUpStage: lead.lastFollowUpStage,
      followUpCount: lead.followUpCount,
      due,
      autoPaused,
      profileComplete: Boolean(
        lead.matchedMerchant.websiteUrl?.trim() && lead.matchedMerchant.logoUrl?.trim(),
      ),
      subscriptionStatus: subscription?.status || null,
      subscriptionPlan: subscription?.plan || null,
    });
  }

  const metrics = {
    awaitingActivation: rows.filter((row) => row.stage === "INVITE_PENDING").length,
    noActivePlan: rows.filter((row) => row.stage === "SUBSCRIPTION_PENDING").length,
    dueNow: rows.filter((row) => row.due).length,
    converted: rows.filter((row) => row.stage === "CONVERTED").length,
    pastDue: rows.filter((row) => row.stage === "PAST_DUE").length,
  };

  return { rows, metrics };
}

export async function sendActivationFollowUp(input: {
  leadId: string;
  origin?: string;
  automated?: boolean;
}) {
  const lead = await prisma.merchantLead.findUnique({
    where: { id: input.leadId },
    include: {
      matchedMerchant: {
        include: {
          subscription: true,
          members: {
            include: {
              sessions: {
                orderBy: { createdAt: "asc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!lead || lead.status !== "APPROVED" || !lead.matchedMerchant) {
    throw new Error("Approved matched lead not found.");
  }

  const email = normalizeEmail(lead.email);
  const member =
    lead.matchedMerchant.members.find((candidate) => normalizeEmail(candidate.email) === email) ||
    lead.matchedMerchant.members[0] ||
    null;

  if (!member) throw new Error("Merchant portal member not found.");
  if (member.status === "SUSPENDED") throw new Error("Merchant portal member is suspended.");
  if (lead.matchedMerchant.subscription?.status === "ACTIVE") {
    throw new Error("Merchant already has an active subscription.");
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    input.origin?.replace(/\/$/, "") ||
    "https://dorokartes.gr";

  let stage: "INVITE_PENDING" | "SUBSCRIPTION_PENDING";
  let actionUrl: string;

  if (member.status === "INVITED") {
    stage = "INVITE_PENDING";
    const token = newToken();
    const tokenHash = hashToken(token);

    await prisma.$transaction([
      prisma.merchantMagicLink.deleteMany({
        where: { memberId: member.id, purpose: "INVITE", usedAt: null },
      }),
      prisma.merchantMagicLink.create({
        data: {
          memberId: member.id,
          purpose: "INVITE",
          tokenHash,
          expiresAt: addDays(new Date(), 7),
        },
      }),
    ]);

    actionUrl = `${baseUrl}/merchant/invite?token=${encodeURIComponent(token)}`;
  } else {
    stage = "SUBSCRIPTION_PENDING";
    actionUrl = `${baseUrl}/merchant/billing`;
  }

  const mail = await sendMerchantActivationReminder({
    to: member.email,
    contactName: member.name || lead.contactName,
    merchantName: lead.matchedMerchant.name,
    stage,
    actionUrl,
    loginUrl: `${baseUrl}/merchant/login`,
  });

  if (!mail.sent) {
    throw new Error(`Email send failed: ${mail.reason}`);
  }

  await prisma.merchantLead.update({
    where: { id: lead.id },
    data: {
      lastFollowUpAt: new Date(),
      lastFollowUpStage: stage,
      followUpCount: { increment: 1 },
    },
  });

  return {
    ok: true,
    stage,
    automated: Boolean(input.automated),
    merchantName: lead.matchedMerchant.name,
    email: member.email,
  };
}

export async function runDueActivationFollowUps(input: {
  origin?: string;
  limit?: number;
  automated?: boolean;
}) {
  const data = await getMerchantActivationData();
  const due = data.rows.filter((row) => row.due).slice(0, input.limit ?? 20);
  const results: Array<{
    leadId: string;
    ok: boolean;
    merchantName: string;
    error?: string;
  }> = [];

  for (const row of due) {
    try {
      await sendActivationFollowUp({
        leadId: row.leadId,
        origin: input.origin,
        automated: input.automated,
      });
      results.push({ leadId: row.leadId, ok: true, merchantName: row.merchantName });
    } catch (error) {
      results.push({
        leadId: row.leadId,
        ok: false,
        merchantName: row.merchantName,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    candidates: due.length,
    sent: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}
