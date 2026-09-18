import { prisma } from "@/lib/prisma";

const db = prisma as any;

export type ReadinessItem = {
  id: string;
  merchantName: string;
  title: string;
  status: string;
  verificationStatus: string;
  officialUrl: string | null;
  score: number;
  launchReady: boolean;
  issues: string[];
  checks: {
    verified: boolean;
    officialUrl: boolean;
    description: boolean;
    category: boolean;
    occasion: boolean;
    variant: boolean;
    media: boolean;
    seo: boolean;
    validityOrTerms: boolean;
  };
};

function scoreCard(card: any): ReadinessItem {
  const checks = {
    verified: card.verificationStatus === "VERIFIED",
    officialUrl: !!card.officialUrl,
    description: !!(card.shortDescription || card.description),
    category: (card._count?.categories ?? 0) > 0,
    occasion: (card._count?.occasions ?? 0) > 0,
    variant: (card._count?.variants ?? 0) > 0,
    media: (card._count?.mediaAssets ?? 0) > 0,
    seo: !!(card.seoTitle && card.metaDescription),
    validityOrTerms: !!(card.validityText || card.validityMonths || card.termsUrl),
  };

  const weights: Record<keyof typeof checks, number> = {
    verified: 25,
    officialUrl: 25,
    description: 15,
    category: 10,
    occasion: 10,
    variant: 0,
    media: 0,
    seo: 10,
    validityOrTerms: 5,
  };

  let score = 0;
  for (const key of Object.keys(checks) as (keyof typeof checks)[]) {
    if (checks[key]) score += weights[key];
  }

  const issues: string[] = [];
  if (!checks.verified) issues.push("Not verified");
  if (!checks.officialUrl) issues.push("Missing official URL");
  if (!checks.description) issues.push("Missing description");
  if (!checks.category) issues.push("Missing category");
  if (!checks.occasion) issues.push("Missing occasion");
  if (!checks.seo) issues.push("Missing SEO");
  if (!checks.validityOrTerms) issues.push("Missing validity/terms");

  const launchReady =
    score >= 80 &&
    checks.verified &&
    checks.officialUrl &&
    checks.category;

  return {
    id: card.id,
    merchantName: card.merchant?.name || "Unknown",
    title: card.title,
    status: card.status,
    verificationStatus: card.verificationStatus,
    officialUrl: card.officialUrl,
    score,
    launchReady,
    issues,
    checks,
  };
}

export async function getReadinessData() {
  const cards = await db.giftCard.findMany({
    take: 2500,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      verificationStatus: true,
      officialUrl: true,
      shortDescription: true,
      description: true,
      seoTitle: true,
      metaDescription: true,
      validityText: true,
      validityMonths: true,
      termsUrl: true,
      merchant: { select: { name: true } },
      _count: {
        select: {
          categories: true,
          occasions: true,
          variants: true,
          mediaAssets: true,
        },
      },
    },
  });

  const items = cards.map(scoreCard);

  const summary = {
    total: items.length,
    ready: items.filter((x: ReadinessItem) => x.launchReady).length,
    score90: items.filter((x: ReadinessItem) => x.score >= 90).length,
    score80: items.filter((x: ReadinessItem) => x.score >= 80).length,
    score60to79: items.filter((x: ReadinessItem) => x.score >= 60 && x.score < 80).length,
    below60: items.filter((x: ReadinessItem) => x.score < 60).length,
    missingMedia: items.filter((x: ReadinessItem) => !x.checks.media).length,
    missingCategory: items.filter((x: ReadinessItem) => !x.checks.category).length,
    missingOccasion: items.filter((x: ReadinessItem) => !x.checks.occasion).length,
    missingVariant: items.filter((x: ReadinessItem) => !x.checks.variant).length,
    missingDescription: items.filter((x: ReadinessItem) => !x.checks.description).length,
    missingSeo: items.filter((x: ReadinessItem) => !x.checks.seo).length,
    unverified: items.filter((x: ReadinessItem) => !x.checks.verified).length,
  };

  return { items, summary };
}
