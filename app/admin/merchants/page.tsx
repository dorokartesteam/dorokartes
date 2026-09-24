import { getMerchantCommercialSummary, getMerchants, host } from "@/lib/admin/data";
import { Metric, PageIntro, Panel, Status } from "@/components/admin/AdminUI";

function portalStatus(members: Array<{ status?: string | null }> = []) {
  if (!members.length) return null;
  if (members.some((member) => member.status === "ACTIVE")) return "ACTIVE";
  if (members.some((member) => member.status === "INVITED")) return "INVITED";
  if (members.every((member) => member.status === "SUSPENDED")) return "SUSPENDED";
  return members[0]?.status || "UNKNOWN";
}

function planLabel(plan?: string | null) {
  if (plan === "PREMIUM_BANNER") return "Premium Banner";
  if (plan === "FEATURED") return "Featured";
  if (plan === "PARTNER") return "Partner";
  return "—";
}

export default async function MerchantsPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const p = await searchParams;
  const [rows, summary] = await Promise.all([
    getMerchants(p.q || "", p.status || "", p.commercial || ""),
    getMerchantCommercialSummary(),
  ]);

  return <>
    <PageIntro
      title="Merchants"
      text="Catalog merchants and commercial portal customers in one place. Manage publication, portal access and subscription status."
    />

    <div className="dk-metricgrid dk-merchant-commercial-metrics">
      <Metric label="Portal merchants" value={summary.portalMerchants} detail="Businesses with merchant access" tone="purple" />
      <Metric label="Active subscriptions" value={summary.activeSubscriptions} detail="Live paid entitlement" tone="good" />
      <Metric label="Pending" value={summary.pendingSubscriptions} detail="Approved / not active yet" tone="warn" />
      <Metric
        label="Premium slots"
        value={`${summary.premiumSlots}/4`}
        detail={summary.pastDueSubscriptions ? `${summary.pastDueSubscriptions} past due subscription(s)` : "Current active inventory"}
        tone={summary.premiumSlots >= 4 ? "warn" : "default"}
      />
    </div>

    <form className="dk-filterbar dk-merchant-filterbar">
      <input name="q" defaultValue={p.q || ""} placeholder="Search merchant, domain, slug or portal email…" />
      <select name="status" defaultValue={p.status || ""}>
        <option value="">All catalog statuses</option>
        <option>ACTIVE</option><option>INACTIVE</option><option>NEEDS_REVIEW</option><option>ARCHIVED</option>
      </select>
      <select name="commercial" defaultValue={p.commercial || ""}>
        <option value="">All commercial states</option>
        <option value="PORTAL">Has portal account</option>
        <option value="ACTIVE_SUB">Active subscription</option>
        <option value="PENDING_SUB">Pending subscription</option>
        <option value="PAST_DUE">Past due</option>
        <option value="CANCELED_SUB">Canceled subscription</option>
        <option value="NO_PORTAL">No portal account</option>
      </select>
      <button>Filter</button><a href="/admin/merchants">Reset</a>
      <span className="dk-resultcount">{rows.length} shown</span>
    </form>

    <Panel title="Merchant directory" subtitle="Catalog identity + merchant portal + billing visibility">
      <div className="dk-tablewrap"><table className="dk-table dk-merchant-commercial-table"><thead><tr>
        <th>Merchant</th><th>Domain</th><th>Catalog</th><th>Portal</th><th>Plan</th><th>Subscription</th><th>Cards</th>
      </tr></thead><tbody>
      {rows.map((m:any)=>{
        const portal = portalStatus(m.members || []);
        return <tr key={m.id}>
          <td><div className="dk-entity"><div className="dk-avatar">{m.name?.slice(0,2).toUpperCase()}</div><div><a className="dk-entitylink" href={`/admin/merchants/${m.id}`}><b>{m.name}</b><small>{m.members?.[0]?.email || m.slug}</small></a></div></div></td>
          <td><a href={m.websiteUrl || "#"} target="_blank" rel="noreferrer">{host(m.websiteUrl)} ↗</a></td>
          <td><Status value={m.status}/></td>
          <td>{portal ? <Status value={portal}/> : <span className="dk-admin-muted">—</span>}</td>
          <td><b className="dk-plan-label">{planLabel(m.subscription?.plan)}</b></td>
          <td>{m.subscription ? <Status value={m.subscription.status}/> : <span className="dk-admin-muted">—</span>}</td>
          <td><b>{m._count?.giftCards ?? 0}</b></td>
        </tr>;
      })}
      </tbody></table></div>
    </Panel>
  </>;
}
