import { getGiftCards, host, ago } from "@/lib/admin/data";
import { PageIntro, Panel, Status } from "@/components/admin/AdminUI";
import { ToggleGiftCard } from "@/components/admin/AdminActions";

export default async function GiftCardsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const p = await searchParams;
  const rows = await getGiftCards(p.q || "", p.status || "", p.verification || "");
  return <>
    <PageIntro title="Gift Cards" text="The production inventory: official URL, verification, merchandising, variants and content completeness." />
    <form className="dk-filterbar">
      <input name="q" defaultValue={p.q || ""} placeholder="Search card, merchant, URL…" />
      <select name="status" defaultValue={p.status || ""}><option value="">All card statuses</option><option>ACTIVE</option><option>DRAFT</option><option>HIDDEN</option><option>EXPIRED</option><option>ARCHIVED</option></select>
      <select name="verification" defaultValue={p.verification || ""}><option value="">All verification</option><option>VERIFIED</option><option>PENDING</option><option>NEEDS_REVIEW</option><option>EXPIRED</option><option>REJECTED</option></select>
      <button>Filter</button><a href="/admin/gift-cards">Reset</a><span className="dk-resultcount">{rows.length} shown</span>
    </form>
    <Panel title="Gift-card inventory" subtitle="First 150 matching cards">
      <div className="dk-tablewrap"><table className="dk-table wide"><thead><tr><th>Merchant / Card</th><th>Official</th><th>Status</th><th>Verification</th><th>Coverage</th><th>Last verified</th><th>Actions</th></tr></thead><tbody>
      {rows.map((c:any)=><tr key={c.id}>
        <td><div className="dk-entity"><div className="dk-avatar card">GC</div><div><a className="dk-entitylink" href={`/admin/gift-cards/${c.id}`}><b>{c.merchant?.name || "Unknown"}</b><small>{c.title}</small></a></div></div></td>
        <td><a href={c.officialUrl || "#"} target="_blank" rel="noreferrer">{host(c.officialUrl)} ↗</a></td>
        <td><Status value={c.status}/>{c.featured && <span className="dk-star">★</span>}</td>
        <td><Status value={c.verificationStatus}/></td>
        <td><div className="dk-coverage"><span>V {c._count?.variants ?? 0}</span><span>C {c._count?.categories ?? 0}</span><span>O {c._count?.occasions ?? 0}</span><span>M {c._count?.mediaAssets ?? 0}</span></div></td>
        <td>{ago(c.lastVerifiedAt)}</td>
        <td><ToggleGiftCard id={c.id} featured={!!c.featured} status={c.status}/></td>
      </tr>)}
      </tbody></table></div>
    </Panel>
  </>;
}
