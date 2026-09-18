import { getMerchants, host } from "@/lib/admin/data";
import { PageIntro, Panel, Status } from "@/components/admin/AdminUI";

export default async function MerchantsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const p = await searchParams;
  const rows = await getMerchants(p.q || "", p.status || "");
  return <>
    <PageIntro title="Merchants" text="Production merchant catalog. Search, audit status, card coverage and brand hygiene." />
    <form className="dk-filterbar">
      <input name="q" defaultValue={p.q || ""} placeholder="Search merchant, domain, slug…" />
      <select name="status" defaultValue={p.status || ""}><option value="">All statuses</option><option>ACTIVE</option><option>INACTIVE</option><option>NEEDS_REVIEW</option><option>ARCHIVED</option></select>
      <button>Filter</button><a href="/admin/merchants">Reset</a>
      <span className="dk-resultcount">{rows.length} shown</span>
    </form>
    <Panel title="Merchant directory" subtitle="First 150 matching records">
      <div className="dk-tablewrap"><table className="dk-table"><thead><tr><th>Merchant</th><th>Domain</th><th>Status</th><th>Cards</th><th>Country</th><th>Quality</th></tr></thead><tbody>
      {rows.map((m:any)=><tr key={m.id}><td><div className="dk-entity"><div className="dk-avatar">{m.name?.slice(0,2).toUpperCase()}</div><div><a className="dk-entitylink" href={`/admin/merchants/${m.id}`}><b>{m.name}</b><small>{m.slug}</small></a></div></div></td><td><a href={m.websiteUrl || "#"} target="_blank" rel="noreferrer">{host(m.websiteUrl)} ↗</a></td><td><Status value={m.status}/></td><td><b>{m._count?.giftCards ?? 0}</b></td><td>{m.country || "GR"}</td><td><span className={`dk-dot ${m.description ? "good":"warn"}`}/>{m.description ? "Profile ready":"Missing description"}</td></tr>)}
      </tbody></table></div>
    </Panel>
  </>;
}
