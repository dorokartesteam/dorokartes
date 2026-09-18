import Link from "next/link";
import { getDashboardData, ago, host } from "@/lib/admin/data";
import { Metric, Panel, Status, MiniBar } from "@/components/admin/AdminUI";

export default async function AdminDashboard() {
  const d = await getDashboardData();
  const verifiedPct = d.cards ? Math.round((d.verifiedCards / d.cards) * 100) : 0;
  const activePct = d.merchants ? Math.round((d.activeMerchants / d.merchants) * 100) : 0;

  return <>
    <div className="dk-herobar">
      <div><span className="dk-live"><i /> LIVE CATALOG</span><h2>Η βάση σου, σε μία οθόνη.</h2><p>Catalog health, discovery, verification και growth signals χωρίς PowerShell για την καθημερινή διαχείριση.</p></div>
      <div className="dk-herostat"><b>{d.merchants.toLocaleString("el-GR")}</b><span>production merchants</span></div>
    </div>

    <div className="dk-metricgrid">
      <Metric label="Merchants" value={d.merchants.toLocaleString("el-GR")} detail={`${activePct}% active`} tone="purple" />
      <Metric label="Gift Cards" value={d.cards.toLocaleString("el-GR")} detail={`${d.activeCards} active`} />
      <Metric label="Verified" value={`${verifiedPct}%`} detail={`${d.verifiedCards} verified cards`} tone="good" />
      <Metric label="Needs Review" value={d.reviewCards} detail="gift-card review queue" tone={d.reviewCards ? "warn" : "good"} />
      <Metric label="Discovery" value={d.discovered} detail={`${d.queued} accepted / queued`} />
      <Metric label="Missing Media" value={d.missingImage} detail="cards without assets" tone={d.missingImage ? "warn" : "good"} />
    </div>

    <div className="dk-grid2">
      <Panel title="Catalog health" subtitle="Production quality snapshot">
        <div className="dk-healthrows">
          <div><span>Active merchants</span><b>{d.activeMerchants}/{d.merchants}</b><MiniBar value={d.activeMerchants} max={Math.max(d.merchants,1)} /></div>
          <div><span>Verified cards</span><b>{d.verifiedCards}/{d.cards}</b><MiniBar value={d.verifiedCards} max={Math.max(d.cards,1)} /></div>
          <div><span>Cards with description</span><b>{Math.max(0,d.cards-d.missingDescription)}/{d.cards}</b><MiniBar value={Math.max(0,d.cards-d.missingDescription)} max={Math.max(d.cards,1)} /></div>
          <div><span>Featured cards</span><b>{d.featured}</b><MiniBar value={d.featured} max={Math.max(Math.min(d.cards,50),1)} /></div>
        </div>
      </Panel>

      <Panel title="Operations pulse" subtitle="What needs attention now">
        <div className="dk-pulse">
          <Link href="/admin/discovery"><strong>{d.discovered}</strong><span>Unreviewed discovery</span><em>Open →</em></Link>
          <Link href="/admin/verification"><strong>{d.reviewCards}</strong><span>Verification review</span><em>Inspect →</em></Link>
          <Link href="/admin/quality"><strong>{d.missingImage}</strong><span>Missing media</span><em>Fix →</em></Link>
          <Link href="/admin/taxonomy"><strong>{d.categories + d.occasions}</strong><span>Taxonomy nodes</span><em>Manage →</em></Link>
        </div>
      </Panel>
    </div>

    <div className="dk-grid2">
      <Panel title="Newest merchants" subtitle="Latest additions to production" action={<Link href="/admin/merchants" className="dk-textlink">View all</Link>}>
        <div className="dk-list">
          {d.recentMerchants.length ? d.recentMerchants.map((m:any) => <div className="dk-listrow" key={m.id}><div className="dk-avatar">{m.name?.slice(0,2).toUpperCase()}</div><div className="grow"><b>{m.name}</b><small>{host(m.websiteUrl)}</small></div><Status value={m.status}/><time>{ago(m.createdAt)}</time></div>) : <div className="dk-empty">No merchant data</div>}
        </div>
      </Panel>
      <Panel title="Newest gift cards" subtitle="Recently promoted cards" action={<Link href="/admin/gift-cards" className="dk-textlink">View all</Link>}>
        <div className="dk-list">
          {d.recentCards.length ? d.recentCards.map((c:any) => <div className="dk-listrow" key={c.id}><div className="dk-avatar card">GC</div><div className="grow"><b>{c.merchant?.name || c.title}</b><small>{c.title}</small></div><Status value={c.verificationStatus}/><time>{ago(c.createdAt)}</time></div>) : <div className="dk-empty">No card data</div>}
        </div>
      </Panel>
    </div>
  </>;
}
