import { getAnalyticsData } from "@/lib/admin/analytics";
import { Metric, PageIntro, Panel } from "@/components/admin/AdminUI";

function Ranking({ rows }: { rows: { id: string; name: string; count: number }[] }) {
  return rows.length ? <div className="dk-analytics-list">
    {rows.slice(0, 10).map(row => <div className="dk-analytics-row" key={row.id}><b>{row.name}</b><span>{row.count.toLocaleString("el-GR")}</span></div>)}
  </div> : <div className="dk-empty-state">No recorded clicks in this period.</div>;
}

export default async function AnalyticsPage() {
  const { outbound, search } = await getAnalyticsData();
  return <>
    <PageIntro title="Analytics" text="Last 30 days. Recorded outbound requests are not unique visitors; historical records may include automated traffic." />
    <div className="dk-metricgrid small">
      <Metric label="Recorded outbound clicks" value={outbound?.clicks ?? "Unavailable"} tone="purple" />
      <Metric label="Search events" value={search?.count ?? "Unavailable"} />
    </div>
    {!outbound && <p role="alert">Outbound analytics could not be loaded. This is not a zero-traffic result.</p>}
    {!search && <p role="alert">Search analytics could not be loaded.</p>}
    {outbound && <>
      <div className="dk-grid2">
        <Panel title="Top merchants" subtitle="Recorded outbound clicks"><Ranking rows={outbound.merchants} /></Panel>
        <Panel title="Top gift cards" subtitle="Recorded outbound clicks"><Ranking rows={outbound.cards} /></Panel>
        <Panel title="Top categories" subtitle="Attributed to each card's current primary category; one category per click"><Ranking rows={outbound.categories} /></Panel>
        <Panel title="Recent outbound clicks" subtitle="Most recent 30 records">
          {outbound.recentClicks.length ? <div className="dk-analytics-list">
            {outbound.recentClicks.slice(0, 30).map(row => <div className="dk-analytics-row" key={row.id}>
              <div><b>{row.merchant?.name || row.giftCard?.title || "Unavailable merchant"}</b><small>{row.giftCard?.title || row.destinationUrl}</small><small>{row.source || "Unknown source"}</small></div>
              <span>{row.clickedAt.toLocaleString("el-GR")}</span>
            </div>)}
          </div> : <div className="dk-empty-state">No recorded clicks in this period.</div>}
        </Panel>
      </div>
    </>}
    {search && <Panel title="Search demand" subtitle="Most recent 30 searches">
      {search.events.length ? <div className="dk-analytics-list">
        {search.events.slice(0, 30).map(row => <div className="dk-analytics-row" key={row.id}>
          <div><b>{row.query}</b><small>{row.resultsCount} results</small></div><span>{row.searchedAt.toLocaleString("el-GR")}</span>
        </div>)}
      </div> : <div className="dk-empty-state">No search events recorded in this period.</div>}
    </Panel>}
    <p className="dk-admin-note">Views and CTR are not available in this database report. GA catalog views and outbound events are measured separately; do not divide database clicks by GA views.</p>
  </>;
}
