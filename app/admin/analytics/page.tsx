import Link from "next/link";
import { getAnalyticsData } from "@/lib/admin/data";
import { Metric, PageIntro, Panel } from "@/components/admin/AdminUI";

function value(row: any, keys: string[]) {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  return "—";
}

export default async function AnalyticsPage() {
  const d = await getAnalyticsData();

  return <>
    <PageIntro
      title="Analytics"
      text="Real catalog signals: outbound activity and user search demand. This screen intentionally shows only data that exists in production."
    />

    <div className="dk-metricgrid small">
      <Metric label="Outbound clicks" value={d.clicks} tone="purple" />
      <Metric label="Recent clicks" value={d.recentClicks.length} />
      <Metric label="Search events" value={d.searchEvents.length} />
    </div>

    <div className="dk-grid2">
      <Panel title="Recent outbound clicks" subtitle="Latest users continuing to official merchant destinations">
        {d.recentClicks.length ? (
          <div className="dk-analytics-list">
            {d.recentClicks.slice(0, 30).map((row: any, i: number) => (
              <div className="dk-analytics-row" key={row.id || i}>
                <div>
                  <b>{String(value(row, ["merchantName", "giftCardTitle", "destinationUrl", "url"]))}</b>
                  <small>{String(value(row, ["destinationUrl", "url", "sourcePath", "path"]))}</small>
                </div>
                <span>{row.createdAt ? new Date(row.createdAt).toLocaleString("el-GR") : "—"}</span>
              </div>
            ))}
          </div>
        ) : <div className="dk-empty-state">No outbound click rows yet. Tracking can remain empty until the public site starts receiving traffic.</div>}
      </Panel>

      <Panel title="Search demand" subtitle="What visitors ask Dorokartes to find">
        {d.searchEvents.length ? (
          <div className="dk-analytics-list">
            {d.searchEvents.slice(0, 30).map((row: any, i: number) => (
              <div className="dk-analytics-row" key={row.id || i}>
                <div>
                  <b>{String(value(row, ["query", "term", "search", "text"]))}</b>
                  <small>{String(value(row, ["resultCount", "results", "path", "source"]))}</small>
                </div>
                <span>{row.createdAt ? new Date(row.createdAt).toLocaleString("el-GR") : "—"}</span>
              </div>
            ))}
          </div>
        ) : <div className="dk-empty-state">No search events yet. This becomes useful as soon as public search is live.</div>}
      </Panel>
    </div>

    <div className="dk-admin-note">
      <div><b>Use this page after launch</b><span>Zero-result searches become the best signal for which merchants, categories and local areas to add next.</span></div>
      <Link href="/admin/gift-cards">Open catalog →</Link>
    </div>
  </>;
}
