import Link from "next/link";
import { Metric, PageIntro, Panel, Status } from "@/components/admin/AdminUI";
import { getRevenueDashboardData } from "@/lib/admin/revenue";
import { planLabel } from "@/lib/merchant/plans";

export const dynamic = "force-dynamic";

function eur(cents: number) {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function date(value?: Date | null) {
  if (!value) return "—";
  return value.toLocaleDateString("el-GR");
}

function FunnelStep({ label, value, max, detail }: { label: string; value: number; max: number; detail: string }) {
  const width = max > 0 ? Math.max(5, Math.round((value / max) * 100)) : 0;
  return (
    <div className="dk-revenue-funnel-step">
      <div className="dk-revenue-funnel-head">
        <div><b>{label}</b><small>{detail}</small></div>
        <strong>{value.toLocaleString("el-GR")}</strong>
      </div>
      <div className="dk-revenue-funnel-track"><i style={{ width: `${width}%` }} /></div>
    </div>
  );
}

function MixRow({ label, count, total, price }: { label: string; count: number; total: number; price: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="dk-revenue-mix-row">
      <div><b>{label}</b><small>{price} / μήνα</small></div>
      <div className="dk-revenue-mix-bar"><i style={{ width: `${pct}%` }} /></div>
      <strong>{count}</strong>
    </div>
  );
}

export default async function RevenuePage() {
  const d = await getRevenueDashboardData();
  const funnelMax = Math.max(d.funnel.leads, d.funnel.portal, d.funnel.paid, 1);

  return (
    <>
      <PageIntro
        title="Revenue"
        text="Merchant subscriptions, plan mix and acquisition funnel. MRR is calculated from ACTIVE Dorokartes subscription entitlements; collected cash remains authoritative in Stripe."
      />

      <div className="dk-metricgrid dk-revenue-metrics">
        <Metric label="Active-plan MRR" value={eur(d.mrrCents)} detail={`${d.activeSubscriptions} active subscription(s)`} tone="purple" />
        <Metric label="Annual run rate" value={eur(d.arrCents)} detail="MRR × 12" tone="good" />
        <Metric label="New active this month" value={d.newActiveThisMonth} detail="Started since month opening" />
        <Metric label="Premium inventory" value={`${d.premiumSlots}/${d.premiumCapacity}`} detail={`${d.premiumCapacity - d.premiumSlots} slot(s) available`} tone={d.premiumSlots >= d.premiumCapacity ? "warn" : "default"} />
      </div>

      <div className="dk-grid2 dk-revenue-grid">
        <Panel title="Subscription mix" subtitle="ACTIVE merchant plans">
          <div className="dk-revenue-mix">
            <MixRow label="Partner" count={d.planMix.PARTNER} total={d.activeSubscriptions} price="9,99€" />
            <MixRow label="Featured" count={d.planMix.FEATURED} total={d.activeSubscriptions} price="19,99€" />
            <MixRow label="Premium Banner" count={d.planMix.PREMIUM_BANNER} total={d.activeSubscriptions} price="39,99€" />
          </div>
          <div className="dk-revenue-status-grid">
            <Link href="/admin/merchants?commercial=PENDING_SUB"><span>Pending</span><b>{d.pendingSubscriptions}</b></Link>
            <Link href="/admin/merchants?commercial=PAST_DUE"><span>Past due</span><b>{d.pastDueSubscriptions}</b></Link>
            <Link href="/admin/merchants?commercial=CANCELED_SUB"><span>Canceled</span><b>{d.canceledSubscriptions}</b></Link>
            <Link href="/admin/merchants?commercial=PORTAL"><span>Portal merchants</span><b>{d.portalMerchants}</b></Link>
          </div>
        </Panel>

        <Panel title="Merchant funnel" subtitle="Interest → approval → portal → active subscription">
          <div className="dk-revenue-funnel">
            <FunnelStep label="Merchant leads" value={d.funnel.leads} max={funnelMax} detail="All submitted interest" />
            <FunnelStep label="Approved" value={d.funnel.approved} max={funnelMax} detail={`${d.funnel.leadToApproved}% of leads`} />
            <FunnelStep label="Portal merchants" value={d.funnel.portal} max={funnelMax} detail="Businesses with portal access" />
            <FunnelStep label="Active paid plan" value={d.funnel.paid} max={funnelMax} detail={`${d.funnel.leadToPaid}% lead → active`} />
          </div>
          <div className="dk-revenue-conversion-note">
            <b>{d.funnel.approvedToPaid}%</b>
            <span>approved → active subscription</span>
          </div>
        </Panel>
      </div>

      <div className="dk-grid2 dk-revenue-grid">
        <Panel title="Lead pipeline" subtitle="Current merchant acquisition workload">
          <div className="dk-revenue-lead-stats">
            <Link href="/admin/merchant-leads?status=SUBMITTED"><span>Submitted</span><b>{d.leadStats.submitted}</b></Link>
            <Link href="/admin/merchant-leads?status=UNDER_REVIEW"><span>Under review</span><b>{d.leadStats.underReview}</b></Link>
            <Link href="/admin/merchant-leads?status=APPROVED"><span>Approved</span><b>{d.leadStats.approved}</b></Link>
            <Link href="/admin/merchant-leads?status=REJECTED"><span>Rejected</span><b>{d.leadStats.rejected}</b></Link>
          </div>
          <div className="dk-revenue-requested">
            <span>Requested plans</span>
            <div><b>Partner</b><strong>{d.requestedPlans.PARTNER}</strong></div>
            <div><b>Featured</b><strong>{d.requestedPlans.FEATURED}</strong></div>
            <div><b>Premium</b><strong>{d.requestedPlans.PREMIUM_BANNER}</strong></div>
            <div><b>No selection</b><strong>{d.requestedPlans.NONE}</strong></div>
          </div>
        </Panel>

        <Panel title="Latest merchant leads" subtitle="Newest interest submissions">
          {d.recentLeads.length ? (
            <div className="dk-revenue-latest-list">
              {d.recentLeads.map((lead) => (
                <Link href={`/admin/merchant-leads/${lead.id}`} key={lead.id}>
                  <div>
                    <b>{lead.businessName}</b>
                    <small>{lead.email} · {planLabel(lead.requestedPlan)}</small>
                  </div>
                  <div><Status value={lead.status} /><small>{date(lead.createdAt)}</small></div>
                </Link>
              ))}
            </div>
          ) : <div className="dk-empty-state">No merchant leads yet.</div>}
        </Panel>
      </div>

      <Panel title="Recent subscriptions" subtitle="Latest billing records in Dorokartes">
        {d.recentSubscriptions.length ? (
          <div className="dk-tablewrap">
            <table className="dk-table dk-revenue-table">
              <thead><tr><th>Merchant</th><th>Plan</th><th>Status</th><th>MRR</th><th>Started</th><th>Ends / renews</th><th>Stripe</th></tr></thead>
              <tbody>
                {d.recentSubscriptions.map((row) => (
                  <tr key={row.id}>
                    <td><Link className="dk-entitylink" href={`/admin/merchants/${row.merchant.id}`}><b>{row.merchant.name}</b><small>{row.merchant.members[0]?.email || row.merchant.slug}</small></Link></td>
                    <td><b>{planLabel(row.plan)}</b></td>
                    <td><Status value={row.status} /></td>
                    <td>{eur(row.status === "ACTIVE" ? ({ PARTNER: 999, FEATURED: 1999, PREMIUM_BANNER: 3999 }[row.plan] ?? 0) : 0)}</td>
                    <td>{date(row.startsAt)}</td>
                    <td>{date(row.endsAt)}</td>
                    <td><small className="dk-revenue-stripe-id">{row.stripeSubscriptionId || row.stripeCustomerId || "—"}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="dk-empty-state">No subscription records yet.</div>}
      </Panel>

      <div className="dk-admin-note dk-revenue-note">
        <div>
          <b>Revenue interpretation</b>
          <span>This dashboard measures subscription state inside Dorokartes. Stripe remains the source of truth for actual successful charges, refunds and payouts.</span>
        </div>
        <Link href="/admin/merchants">Manage merchants →</Link>
      </div>
    </>
  );
}
