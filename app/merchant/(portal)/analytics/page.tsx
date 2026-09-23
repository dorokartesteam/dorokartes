import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";

export default async function MerchantAnalyticsPage() {
  const member = await requireMerchantMember();
  const merchantId = member.merchantId;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since7 = new Date(Date.now() - 7 * 86_400_000);

  const [clicks30, clicks7, clicks] = await Promise.all([
    prisma.outboundClick.count({ where: { merchantId, clickedAt: { gte: since30 } } }),
    prisma.outboundClick.count({ where: { merchantId, clickedAt: { gte: since7 } } }),
    prisma.outboundClick.findMany({
      where: { merchantId, clickedAt: { gte: since30 } },
      select: {
        clickedAt: true,
        giftCard: { select: { title: true } },
      },
      orderBy: { clickedAt: "desc" },
      take: 5000,
    }),
  ]);

  const byCard = new Map<string, number>();
  for (const click of clicks) {
    const key = click.giftCard?.title || "Merchant / generic link";
    byCard.set(key, (byCard.get(key) || 0) + 1);
  }

  const topCards = [...byCard.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <>
      <section className="dkm-metrics">
        <article><small>Clicks 7 ημερών</small><b>{clicks7}</b><span>προς την επιχείρησή σου</span></article>
        <article><small>Clicks 30 ημερών</small><b>{clicks30}</b><span>καταγεγραμμένα outbound clicks</span></article>
        <article><small>Top tracked cards</small><b>{topCards.length}</b><span>με clicks τις τελευταίες 30 ημέρες</span></article>
      </section>

      <section className="dkm-panel">
        <div className="dkm-panel-head">
          <div><small>30 ΗΜΕΡΕΣ</small><h1>Clicks ανά δωροκάρτα</h1></div>
        </div>

        <div className="dkm-list">
          {topCards.length ? topCards.map(([name, count]) => (
            <div className="dkm-list-row" key={name}>
              <div><b>{name}</b><small>Outbound traffic</small></div>
              <strong>{count}</strong>
            </div>
          )) : <div className="dkm-empty">Δεν υπάρχουν ακόμη clicks στο επιλεγμένο διάστημα.</div>}
        </div>

        <p className="dkm-footnote">
          Στην πρώτη έκδοση εμφανίζουμε τα πραγματικά outbound clicks που ήδη καταγράφει το Dorokartes.
          Impression analytics θα προστεθούν σε επόμενο βήμα.
        </p>
      </section>
    </>
  );
}
