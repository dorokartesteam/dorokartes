import Link from "next/link";
import { Metric, PageIntro, Panel, Status } from "@/components/admin/AdminUI";
import {
  MerchantActivationAction,
  MerchantActivationRunDue,
} from "@/components/admin/MerchantActivationAction";
import { getMerchantActivationData } from "@/lib/merchant/follow-up";
import { planLabel } from "@/lib/merchant/plans";

export const dynamic = "force-dynamic";

function date(value?: Date | null) {
  if (!value) return "—";
  return value.toLocaleString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MerchantActivationPage() {
  const d = await getMerchantActivationData();
  const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());

  const actionable = d.rows.filter(
    (row) => row.stage === "INVITE_PENDING" || row.stage === "SUBSCRIPTION_PENDING",
  );

  return (
    <>
      <PageIntro
        title="Merchant Activation"
        text="Follow-up queue από approval μέχρι ενεργή συνδρομή. Τα due reminders μπορούν να σταλούν χειροκίνητα ή αυτόματα μία φορά την ημέρα."
      />

      <div className="dk-metricgrid dk-activation-metrics">
        <Metric label="Awaiting activation" value={d.metrics.awaitingActivation} detail="Approved · invite not used" />
        <Metric label="Portal active · no plan" value={d.metrics.noActivePlan} detail="Activated · subscription pending" tone="purple" />
        <Metric label="Due follow-ups" value={d.metrics.dueNow} detail="Ready to send now" tone={d.metrics.dueNow ? "warn" : "good"} />
        <Metric label="Converted" value={d.metrics.converted} detail="Active merchant subscription" tone="good" />
      </div>

      <div className="dk-grid2 dk-activation-topgrid">
        <Panel title="Automation" subtitle="Daily activation follow-up">
          <div className="dk-activation-automation">
            <div>
              <span>CRON_SECRET</span>
              <Status value={cronConfigured ? "CONFIGURED" : "MISSING"} />
            </div>
            <div>
              <span>Schedule</span>
              <b>Daily · 07:15 UTC</b>
            </div>
            <div>
              <span>Cadence</span>
              <b>First reminder after 2 days · repeat after 4 days</b>
            </div>
            <div>
              <span>Safety cap</span>
              <b>6 automated reminders per lead</b>
            </div>
          </div>
          <MerchantActivationRunDue count={d.metrics.dueNow} />
        </Panel>

        <Panel title="Funnel guardrails" subtitle="Τι στέλνει αυτόματα το Dorokartes">
          <div className="dk-activation-rules">
            <p><b>Invite pending</b><span>Στέλνει νέο ασφαλές 7-day activation link.</span></p>
            <p><b>Portal active, plan pending</b><span>Στέλνει reminder προς Billing / Merchant Portal.</span></p>
            <p><b>Active subscription</b><span>Σταματούν όλα τα activation reminders.</span></p>
            <p><b>Past due / suspended</b><span>Δεν στέλνεται activation email από αυτό το flow.</span></p>
          </div>
        </Panel>
      </div>

      <Panel title="Activation queue" subtitle={`${actionable.length} merchant(s) still before active subscription`}>
        <div className="dk-tablewrap">
          <table className="dk-table dk-activation-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Stage</th>
                <th>Requested plan</th>
                <th>Age</th>
                <th>Profile</th>
                <th>Follow-up</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {actionable.map((row) => (
                <tr key={row.leadId}>
                  <td>
                    <Link className="dk-entitylink" href={`/admin/merchant-leads/${row.leadId}`}>
                      <b>{row.merchantName}</b>
                      <small>{row.contactName} · {row.email}</small>
                    </Link>
                  </td>
                  <td>
                    <span className={`dk-activation-stage stage-${row.stage.toLowerCase().replaceAll("_", "-")}`}><Status value={row.stageLabel} /></span>
                    {row.due ? <small className="dk-activation-due">DUE NOW</small> : null}
                    {row.autoPaused ? <small className="dk-activation-paused">AUTO PAUSED</small> : null}
                  </td>
                  <td>{planLabel(row.requestedPlan)}</td>
                  <td><b>{row.stageAgeDays}d</b><small className="dk-block-small">since stage start</small></td>
                  <td>{row.profileComplete ? <span className="dk-activation-ok">Complete</span> : <span className="dk-activation-muted">Incomplete</span>}</td>
                  <td>
                    <b>{row.followUpCount}</b>
                    <small className="dk-block-small">last: {date(row.lastFollowUpAt)}</small>
                  </td>
                  <td>
                    <MerchantActivationAction leadId={row.leadId} />
                  </td>
                </tr>
              ))}
              {!actionable.length ? (
                <tr><td colSpan={7}><div className="dk-empty-state">No merchants currently need activation follow-up.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Completed / exception states" subtitle="Converted, past-due and blocked accounts">
        <div className="dk-activation-stategrid">
          {d.rows
            .filter((row) => !["INVITE_PENDING", "SUBSCRIPTION_PENDING"].includes(row.stage))
            .slice(0, 24)
            .map((row) => (
              <Link href={`/admin/merchants/${row.merchantId}`} key={row.leadId}>
                <div><b>{row.merchantName}</b><small>{row.email}</small></div>
                <span className={`dk-activation-stage stage-${row.stage.toLowerCase().replaceAll("_", "-")}`}><Status value={row.stageLabel} /></span>
              </Link>
            ))}
        </div>
      </Panel>
    </>
  );
}
