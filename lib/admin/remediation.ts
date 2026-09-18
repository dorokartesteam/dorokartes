import { getReadinessData, type ReadinessItem } from "@/lib/admin/readiness";

export type QueueKey =
  | "critical"
  | "media"
  | "category"
  | "occasion"
  | "variant"
  | "description"
  | "seo"
  | "verification"
  | "almost-ready";

export async function getRemediationData() {
  const { items, summary } = await getReadinessData();

  const queues: Record<QueueKey, ReadinessItem[]> = {
    critical: items.filter((x: ReadinessItem) => x.score < 60),
    media: items.filter((x: ReadinessItem) => !x.checks.media),
    category: items.filter((x: ReadinessItem) => !x.checks.category),
    occasion: items.filter((x: ReadinessItem) => !x.checks.occasion),
    variant: items.filter((x: ReadinessItem) => !x.checks.variant),
    description: items.filter((x: ReadinessItem) => !x.checks.description),
    seo: items.filter((x: ReadinessItem) => !x.checks.seo),
    verification: items.filter((x: ReadinessItem) => !x.checks.verified),
    "almost-ready": items.filter(
      (x: ReadinessItem) => !x.launchReady && x.score >= 70
    ),
  };

  const priority = items
    .filter((x: ReadinessItem) => !x.launchReady)
    .map((x: ReadinessItem) => {
      let priorityScore = 0;

      if (!x.checks.verified) priorityScore += 50;
      if (!x.checks.officialUrl) priorityScore += 45;
      if (!x.checks.category) priorityScore += 25;
      if (!x.checks.description) priorityScore += 18;
      if (!x.checks.occasion) priorityScore += 15;
      if (!x.checks.seo) priorityScore += 10;
      if (!x.checks.validityOrTerms) priorityScore += 5;

      // Cards closer to launch get a small boost so quick wins appear high.
      priorityScore += Math.max(0, x.score - 50) / 5;

      return { ...x, priorityScore: Math.round(priorityScore) };
    })
    .sort((a: any, b: any) => b.priorityScore - a.priorityScore);

  return {
    items,
    summary,
    queues,
    priority,
    counts: Object.fromEntries(
      Object.entries(queues).map(([key, value]) => [key, value.length])
    ),
  };
}
