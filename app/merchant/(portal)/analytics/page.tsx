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

  const maxClicks = Math.max(...topCards.map(([, count]) => count), 1);
  const weeklyShare = clicks30 > 0 ? Math.round((clicks7 / clicks30) * 100) : 0;

  return (
    <div className="dkm-page-stack">
      <section className="dkm-page-heading">
        <div>
          <span className="dkm-eyebrow">PERFORMANCE</span>
          <h1>Analytics</h1>
          <p>Πραγματικά outbound clicks που στέλνει το Dorokartes προς την επιχείρησή σου.</p>
        </div>
        <div className="dkm-heading-badge">Τελευταίες 30 ημέρες</div>
      </section>

      <section className="dkm-metrics dkm-v2-metrics">
        <article>
          <div className="dkm-metric-icon clicks">7</div>
          <div><small>CLICKS 7 ΗΜΕΡΩΝ</small><b>{clicks7}</b><span>προς την επιχείρησή σου</span></div>
        </article>
        <article>
          <div className="dkm-metric-icon analytics">30</div>
          <div><small>CLICKS 30 ΗΜΕΡΩΝ</small><b>{clicks30}</b><span>καταγεγραμμένα outbound clicks</span></div>
        </article>
        <article>
          <div className="dkm-metric-icon share">%</div>
          <div><small>7-DAY SHARE</small><b>{weeklyShare}%</b><span>του traffic 30 ημερών</span></div>
        </article>
      </section>

      <section className="dkm-panel dkm-v2-panel">
        <div className="dkm-panel-head">
          <div>
            <small>TOP PERFORMANCE</small>
            <h2>Clicks ανά δωροκάρτα</h2>
            <p>Ποια προγράμματα τραβούν περισσότερο ενδιαφέρον τις τελευταίες 30 ημέρες.</p>
          </div>
        </div>

        <div className="dkm-analytics-list">
          {topCards.length ? topCards.map(([name, count], index) => (
            <div className="dkm-analytics-row" key={name}>
              <div className="dkm-analytics-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="dkm-analytics-data">
                <div className="dkm-analytics-label"><b>{name}</b><span>{count} clicks</span></div>
                <div className="dkm-analytics-track"><i style={{ width: `${Math.max(8, (count / maxClicks) * 100)}%` }} /></div>
              </div>
            </div>
          )) : (
            <div className="dkm-empty dkm-v2-empty">
              <div>↗</div>
              <b>Δεν υπάρχουν ακόμη clicks</b>
              <span>Τα outbound clicks θα εμφανιστούν εδώ μόλις υπάρξει traffic.</span>
            </div>
          )}
        </div>

        <div className="dkm-info-strip">
          <span>i</span>
          <p>Εμφανίζονται μόνο τα πραγματικά outbound clicks που καταγράφονται ήδη από το Dorokartes. Δεν εμφανίζουμε εκτιμώμενες πωλήσεις ή conversions.</p>
        </div>
      </section>
    </div>
  );
}
