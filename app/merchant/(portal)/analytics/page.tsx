import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";

const DAY = 86_400_000;

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function formatChange(value: number | null) {
  if (value === null) return "Νέα δραστηριότητα";
  if (Math.abs(value) < 0.05) return "0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function changeClass(value: number | null) {
  if (value === null || value > 0) return "is-up";
  if (value < 0) return "is-down";
  return "is-flat";
}

function formatCtr(clicks: number, views: number) {
  if (!views) return "—";
  return `${((clicks / views) * 100).toFixed(1)}%`;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shortDayLabel(key: string) {
  return new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit" }).format(
    new Date(`${key}T12:00:00Z`),
  );
}

export default async function MerchantAnalyticsPage() {
  const member = await requireMerchantMember();
  const merchantId = member.merchantId;
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since60 = new Date(now.getTime() - 60 * DAY);

  const [views60, clicks60, placement] = await Promise.all([
    prisma.catalogViewEvent.findMany({
      where: { merchantId, viewedAt: { gte: since60 } },
      select: {
        viewedAt: true,
        giftCardId: true,
        sessionId: true,
        pageType: true,
        giftCard: { select: { title: true } },
      },
      orderBy: { viewedAt: "desc" },
      take: 20_000,
    }),
    prisma.outboundClick.findMany({
      where: { merchantId, clickedAt: { gte: since60 } },
      select: {
        clickedAt: true,
        giftCardId: true,
        source: true,
        giftCard: { select: { title: true } },
      },
      orderBy: { clickedAt: "desc" },
      take: 20_000,
    }),
    prisma.premiumPlacement.findFirst({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        impressions: true,
        clicks: true,
        startsAt: true,
        endsAt: true,
      },
    }),
  ]);

  const currentViews = views60.filter((row) => row.viewedAt >= since30);
  const previousViews = views60.filter((row) => row.viewedAt < since30);
  const currentClicks = clicks60.filter((row) => row.clickedAt >= since30);
  const previousClicks = clicks60.filter((row) => row.clickedAt < since30);
  const views7 = currentViews.filter((row) => row.viewedAt >= since7).length;
  const clicks7 = currentClicks.filter((row) => row.clickedAt >= since7).length;
  const uniqueSessions30 = new Set(currentViews.map((row) => row.sessionId)).size;
  const viewChange = pctChange(currentViews.length, previousViews.length);
  const clickChange = pctChange(currentClicks.length, previousClicks.length);

  const daily = new Map<string, { views: number; clicks: number }>();
  for (let offset = 29; offset >= 0; offset -= 1) {
    const key = dayKey(new Date(now.getTime() - offset * DAY));
    daily.set(key, { views: 0, clicks: 0 });
  }
  for (const row of currentViews) {
    const bucket = daily.get(dayKey(row.viewedAt));
    if (bucket) bucket.views += 1;
  }
  for (const row of currentClicks) {
    const bucket = daily.get(dayKey(row.clickedAt));
    if (bucket) bucket.clicks += 1;
  }
  const dailyRows = [...daily.entries()];
  const maxDaily = Math.max(1, ...dailyRows.flatMap(([, value]) => [value.views, value.clicks]));

  type CardPerformance = { title: string; views: number; clicks: number };
  const cards = new Map<string, CardPerformance>();
  for (const row of currentViews) {
    if (!row.giftCardId) continue;
    const current = cards.get(row.giftCardId) || {
      title: row.giftCard?.title || "Δωροκάρτα",
      views: 0,
      clicks: 0,
    };
    current.views += 1;
    cards.set(row.giftCardId, current);
  }
  for (const row of currentClicks) {
    if (!row.giftCardId) continue;
    const current = cards.get(row.giftCardId) || {
      title: row.giftCard?.title || "Δωροκάρτα",
      views: 0,
      clicks: 0,
    };
    current.clicks += 1;
    cards.set(row.giftCardId, current);
  }
  const topCards = [...cards.values()]
    .sort((a, b) => b.clicks - a.clicks || b.views - a.views || a.title.localeCompare(b.title, "el"))
    .slice(0, 10);

  const sourceMap = new Map<string, number>();
  for (const row of currentClicks) {
    const source = row.source?.trim() || "Άμεσο / άγνωστο";
    sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
  }
  const sources = [...sourceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const brandViews = currentViews.filter((row) => row.pageType === "brand").length;
  const cardViews = currentViews.filter((row) => row.pageType === "gift_card").length;
  const subscription = member.merchant.subscription;

  return (
    <div className="dkm42-analytics-page">
      <section className="dkm42-analytics-head">
        <div>
          <span>MERCHANT ANALYTICS</span>
          <h1>Απόδοση καταστήματος</h1>
          <p>Πραγματικά views και outbound clicks προς την επιχείρησή σου, χωρίς να παρουσιάζονται ως πωλήσεις.</p>
        </div>
        <div className="dkm42-plan-pill">
          <span>Τρέχον πακέτο</span>
          <b>{subscription?.plan?.replaceAll("_", " ") || "Χωρίς ενεργό πακέτο"}</b>
        </div>
      </section>

      <section className="dkm42-metrics">
        <article className="primary">
          <div><span>Views 30 ημερών</span><b>{currentViews.length.toLocaleString("el-GR")}</b></div>
          <small className={changeClass(viewChange)}>{formatChange(viewChange)} από τις προηγούμενες 30 ημέρες</small>
        </article>
        <article>
          <div><span>Clicks 30 ημερών</span><b>{currentClicks.length.toLocaleString("el-GR")}</b></div>
          <small className={changeClass(clickChange)}>{formatChange(clickChange)} από τις προηγούμενες 30 ημέρες</small>
        </article>
        <article>
          <div><span>CTR</span><b>{formatCtr(currentClicks.length, currentViews.length)}</b></div>
          <small>Clicks ÷ views στο Dorokartes</small>
        </article>
        <article>
          <div><span>Μοναδικές συνεδρίες</span><b>{uniqueSessions30.toLocaleString("el-GR")}</b></div>
          <small>Ανώνυμες sessions με καταγεγραμμένο view</small>
        </article>
      </section>

      <section className="dkm42-card dkm42-trend-card">
        <div className="dkm42-section-head">
          <div><span>ΤΕΛΕΥΤΑΙΕΣ 30 ΗΜΕΡΕΣ</span><h2>Views & clicks ανά ημέρα</h2></div>
          <div className="dkm42-legend"><i className="views" /> Views <i className="clicks" /> Clicks</div>
        </div>
        <div className="dkm42-chart" aria-label="Ημερήσια απόδοση 30 ημερών">
          {dailyRows.map(([key, value], index) => (
            <div className="dkm42-day" key={key} title={`${shortDayLabel(key)} — ${value.views} views / ${value.clicks} clicks`}>
              <div className="dkm42-bars">
                <i className="views" style={{ height: `${Math.max(value.views ? 5 : 1, (value.views / maxDaily) * 100)}%` }} />
                <i className="clicks" style={{ height: `${Math.max(value.clicks ? 5 : 1, (value.clicks / maxDaily) * 100)}%` }} />
              </div>
              {(index % 5 === 0 || index === dailyRows.length - 1) && <small>{shortDayLabel(key)}</small>}
            </div>
          ))}
        </div>
        <div className="dkm42-quick-period">
          <span><b>{views7}</b> views τις τελευταίες 7 ημέρες</span>
          <span><b>{clicks7}</b> clicks τις τελευταίες 7 ημέρες</span>
          <span><b>{brandViews}</b> views προφίλ</span>
          <span><b>{cardViews}</b> views δωροκαρτών</span>
        </div>
      </section>

      <div className="dkm42-grid2">
        <section className="dkm42-card">
          <div className="dkm42-section-head">
            <div><span>30 ΗΜΕΡΕΣ</span><h2>Απόδοση ανά δωροκάρτα</h2></div>
          </div>
          {topCards.length ? (
            <div className="dkm42-table-wrap">
              <table className="dkm42-table">
                <thead><tr><th>Δωροκάρτα</th><th>Views</th><th>Clicks</th><th>CTR</th></tr></thead>
                <tbody>
                  {topCards.map((card) => (
                    <tr key={card.title}>
                      <td><b>{card.title}</b></td>
                      <td>{card.views}</td>
                      <td>{card.clicks}</td>
                      <td>{formatCtr(card.clicks, card.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="dkm42-empty">Δεν υπάρχουν ακόμη δεδομένα ανά δωροκάρτα.</div>}
        </section>

        <section className="dkm42-card">
          <div className="dkm42-section-head">
            <div><span>OUTBOUND TRAFFIC</span><h2>Πηγές clicks</h2></div>
          </div>
          {sources.length ? (
            <div className="dkm42-source-list">
              {sources.map(([source, count]) => (
                <div key={source}><span>{source}</span><b>{count.toLocaleString("el-GR")}</b></div>
              ))}
            </div>
          ) : <div className="dkm42-empty">Δεν υπάρχουν ακόμη outbound clicks στο διάστημα.</div>}
        </section>
      </div>

      {placement ? (
        <section className="dkm42-card dkm42-premium-card">
          <div className="dkm42-section-head">
            <div><span>PREMIUM BANNER</span><h2>Απόδοση premium προβολής</h2></div>
            <strong>{placement.status}</strong>
          </div>
          <div className="dkm42-premium-stats">
            <div><span>Impressions</span><b>{placement.impressions.toLocaleString("el-GR")}</b></div>
            <div><span>Clicks</span><b>{placement.clicks.toLocaleString("el-GR")}</b></div>
            <div><span>CTR</span><b>{formatCtr(placement.clicks, placement.impressions)}</b></div>
          </div>
        </section>
      ) : null}

      <p className="dkm42-note">
        Τα views καταγράφονται από την εγκατάσταση του Analytics V2 και μετά. Τα outbound clicks συνεχίζουν να χρησιμοποιούν το υπάρχον ιστορικό του Dorokartes. Δεν εμφανίζουμε αγορές ή conversions χωρίς πραγματικό merchant-side tracking.
      </p>
    </div>
  );
}
