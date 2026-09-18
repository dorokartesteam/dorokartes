import { getDiscovery, host, ago } from "@/lib/admin/data";
import { PageIntro, Panel, Status } from "@/components/admin/AdminUI";
import { DiscoveryActions } from "@/components/admin/AdminActions";

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const p = await searchParams;
  const rows = await getDiscovery(p.q || "", p.status || "");
  return <>
    <PageIntro title="Discovery Queue" text="Review incoming merchant/card evidence. Accept moves to QUEUED; reject preserves the audit trail." />
    <form className="dk-filterbar">
      <input name="q" defaultValue={p.q || ""} placeholder="Merchant, source, URL…" />
      <select name="status" defaultValue={p.status || ""}><option value="">All statuses</option><option>DISCOVERED</option><option>QUEUED</option><option>VERIFYING</option><option>VERIFIED</option><option>REJECTED</option><option>DUPLICATE</option><option>ERROR</option></select>
      <button>Filter</button><a href="/admin/discovery">Reset</a><span className="dk-resultcount">{rows.length} shown</span>
    </form>
    <Panel title="Evidence inbox" subtitle="Newest records first">
      <div className="dk-tablewrap"><table className="dk-table wide"><thead><tr><th>Candidate</th><th>Official candidate</th><th>Source</th><th>Status</th><th>Updated</th><th>Review</th></tr></thead><tbody>
      {rows.map((r:any)=><tr key={r.id}>
        <td><b>{r.merchantName || "Unnamed"}</b><small className="block">{r.title || "—"}</small></td>
        <td><a href={r.possibleOfficialUrl || r.sourceUrl || "#"} target="_blank" rel="noreferrer">{host(r.possibleOfficialUrl || r.sourceUrl)} ↗</a></td>
        <td><b>{r.sourceName || "Unknown"}</b><small className="block">{host(r.sourceUrl)}</small></td>
        <td><Status value={r.status}/></td><td>{ago(r.updatedAt)}</td>
        <td>{["DISCOVERED","QUEUED"].includes(r.status) ? <DiscoveryActions id={r.id}/> : <span className="muted">Locked</span>}</td>
      </tr>)}
      </tbody></table></div>
    </Panel>
  </>;
}
