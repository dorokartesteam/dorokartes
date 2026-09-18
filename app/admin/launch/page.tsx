import Link from "next/link";
import { getLaunchDashboardData } from "@/lib/admin/launch";

export default async function LaunchDashboardPage() {
  const d = await getLaunchDashboardData();

  return <div className="dk-launch">
    <div className="dk-pageintro">
      <div>
        <span>OPERATIONS</span>
        <h2>Launch Dashboard</h2>
        <p>One screen for catalog readiness, discovery backlog and launch blockers.</p>
      </div>
      <Link className="dk-btn primary" href="/admin/readiness">Open readiness →</Link>
    </div>

    <div className="dk-launchhero">
      <div className="dk-launchring">
        <strong>{d.readiness.readyPct}%</strong>
        <span>catalog ready</span>
      </div>
      <div className="dk-launchheadline">
        <span>Current production health</span>
        <h3>{d.readiness.ready} of {d.readiness.total} gift-card programs are launch ready.</h3>
        <p>Average completeness score: <b>{d.readiness.avgScore}%</b>. Active merchants: <b>{d.merchants}</b>.</p>
      </div>
      <div className="dk-launchactions">
        <Link href="/admin/readiness">Fix catalog gaps</Link>
        <Link href="/admin/homepage">Merchandise homepage</Link>
        <Link href="/admin/bulk">Bulk edit</Link>
      </div>
    </div>

    <div className="dk-launchmetrics">
      <article><span>ACTIVE MERCHANTS</span><strong>{d.merchants}</strong><small>production catalog</small></article>
      <article><span>READY CARDS</span><strong>{d.readiness.ready}</strong><small>{d.readiness.readyPct}% launch-ready</small></article>
      <article><span>FEATURED</span><strong>{d.featured.length}</strong><small>homepage candidates</small></article>
      <article><span>DISCOVERED</span><strong>{d.discoveryMap.DISCOVERED ?? 0}</strong><small>waiting review</small></article>
      <article><span>QUEUED</span><strong>{d.discoveryMap.QUEUED ?? 0}</strong><small>waiting promotion</small></article>
      <article><span>VERIFIED</span><strong>{d.discoveryMap.VERIFIED ?? 0}</strong><small>discovery records</small></article>
    </div>

    <div className="dk-grid2">
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Largest blockers</h3><p>Prioritize the highest-volume gaps first.</p></div>
        <div className="dk-launchissues">
          {d.topIssues.map(([label,value]:any, idx:number) => {
            const max = Math.max(1, d.topIssues[0]?.[1] ?? 1);
            return <div key={label}>
              <div><span>{idx+1}. {label}</span><b>{value}</b></div>
              <i><em style={{width:`${Math.round(value/max*100)}%`}}/></i>
            </div>
          })}
        </div>
      </section>

      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Readiness distribution</h3><p>Quality distribution across the current gift-card catalog.</p></div>
        <div className="dk-scorebuckets">
          {d.scoreBuckets.map((x:any)=><div key={x.label}><span>{x.label}</span><strong>{x.value}</strong><small>cards</small></div>)}
        </div>
      </section>
    </div>

    <div className="dk-grid2">
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Category coverage</h3><p>Largest catalog groups available for navigation.</p></div>
        <div className="dk-taxcoverage">
          {d.categories.slice().sort((a:any,b:any)=>(b._count?.giftCards||0)-(a._count?.giftCards||0)).slice(0,10).map((x:any)=>
            <div key={x.id}><b>{x.name}</b><span>{x._count?.giftCards||0}</span></div>
          )}
        </div>
      </section>

      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Occasion coverage</h3><p>Occasions with the deepest available inventory.</p></div>
        <div className="dk-taxcoverage">
          {d.occasions.slice().sort((a:any,b:any)=>(b._count?.giftCards||0)-(a._count?.giftCards||0)).slice(0,10).map((x:any)=>
            <div key={x.id}><b>{x.name}</b><span>{x._count?.giftCards||0}</span></div>
          )}
        </div>
      </section>
    </div>
  </div>;
}
