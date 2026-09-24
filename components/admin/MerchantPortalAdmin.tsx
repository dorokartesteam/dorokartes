"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MemberRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  lastAccess: string | null;
};

type SubscriptionRow = {
  plan: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
} | null;

type PlacementRow = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  impressions: number;
  clicks: number;
};

function planLabel(plan?: string | null) {
  if (plan === "PREMIUM_BANNER") return "Premium Banner";
  if (plan === "FEATURED") return "Featured";
  if (plan === "PARTNER") return "Partner";
  return "No plan";
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function benefitRows(subscription: SubscriptionRow) {
  const active = subscription?.status === "ACTIVE";
  const plan = active ? subscription?.plan : null;
  return [
    { label: "Partner badge", active: Boolean(plan) },
    { label: "Featured ranking", active: plan === "FEATURED" || plan === "PREMIUM_BANNER" },
    { label: "Premium banner", active: plan === "PREMIUM_BANNER" },
  ];
}

export default function MerchantPortalAdmin({
  merchantId,
  members,
  subscription,
  placements,
}: {
  merchantId: string;
  members: MemberRow[];
  subscription: SubscriptionRow;
  placements: PlacementRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(memberId: string, action: "SUSPEND" | "REACTIVATE" | "SEND_LOGIN_LINK") {
    const key = `${memberId}:${action}`;
    setBusy(key);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/admin/merchant/${merchantId}/member`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Η ενέργεια απέτυχε.");

      if (action === "SEND_LOGIN_LINK") setMessage(`Login link στάλθηκε στο ${payload.email}.`);
      if (action === "SUSPEND") setMessage("Η πρόσβαση στο portal ανεστάλη άμεσα.");
      if (action === "REACTIVATE") setMessage("Η πρόσβαση στο portal ενεργοποιήθηκε ξανά.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Η ενέργεια απέτυχε.");
    } finally {
      setBusy(null);
    }
  }

  const activePlacement = placements.find((placement) => placement.status === "ACTIVE");

  return (
    <div className="dk-commercial-admin">
      <div className="dk-commercial-section">
        <div className="dk-commercial-sectionhead">
          <div><h3>Subscription</h3><p>Stripe-backed commercial state and public entitlements.</p></div>
          <span className={`dk-status ${(subscription?.status || "none").toLowerCase().replaceAll("_", "-")}`}>
            {(subscription?.status || "NO SUBSCRIPTION").replaceAll("_", " ")}
          </span>
        </div>

        <div className="dk-subscription-hero">
          <div><span>Current plan</span><strong>{planLabel(subscription?.plan)}</strong></div>
          <div><span>Started</span><b>{dateLabel(subscription?.startsAt)}</b></div>
          <div><span>Current period ends</span><b>{dateLabel(subscription?.endsAt)}</b></div>
        </div>

        <div className="dk-benefit-grid">
          {benefitRows(subscription).map((benefit) => (
            <div className={benefit.active ? "is-active" : ""} key={benefit.label}>
              <i>{benefit.active ? "✓" : "–"}</i><span>{benefit.label}</span>
            </div>
          ))}
        </div>

        {subscription ? (
          <div className="dk-stripe-ids">
            <div><span>Customer</span><code>{subscription.stripeCustomerId || "—"}</code></div>
            <div><span>Subscription</span><code>{subscription.stripeSubscriptionId || "—"}</code></div>
            <div><span>Price</span><code>{subscription.stripePriceId || "—"}</code></div>
          </div>
        ) : null}

        {activePlacement ? (
          <div className="dk-premium-placement-summary">
            <div><span>Premium placement</span><b>ACTIVE</b></div>
            <div><span>Impressions</span><b>{activePlacement.impressions.toLocaleString("el-GR")}</b></div>
            <div><span>Clicks</span><b>{activePlacement.clicks.toLocaleString("el-GR")}</b></div>
          </div>
        ) : null}
      </div>

      <div className="dk-commercial-section">
        <div className="dk-commercial-sectionhead">
          <div><h3>Portal access</h3><p>Suspend/reactivate access or send a fresh 15-minute login link.</p></div>
          <b>{members.length} user{members.length === 1 ? "" : "s"}</b>
        </div>

        {members.length ? (
          <div className="dk-member-list">
            {members.map((member) => (
              <div className="dk-member-row" key={member.id}>
                <div className="dk-member-main">
                  <div className="dk-member-avatar">{(member.name || member.email).slice(0, 2).toUpperCase()}</div>
                  <div><strong>{member.name || "Merchant user"}</strong><a href={`mailto:${member.email}`}>{member.email}</a><small>{member.role} · Last access: {dateLabel(member.lastAccess)}</small></div>
                </div>
                <div className="dk-member-actions">
                  <span className={`dk-status ${member.status.toLowerCase().replaceAll("_", "-")}`}>{member.status.replaceAll("_", " ")}</span>
                  {member.status !== "SUSPENDED" ? (
                    <button disabled={Boolean(busy)} onClick={() => run(member.id, "SEND_LOGIN_LINK")}>{busy === `${member.id}:SEND_LOGIN_LINK` ? "Sending…" : "Send login link"}</button>
                  ) : null}
                  {member.status === "SUSPENDED" ? (
                    <button className="good" disabled={Boolean(busy)} onClick={() => run(member.id, "REACTIVATE")}>{busy === `${member.id}:REACTIVATE` ? "Working…" : "Reactivate"}</button>
                  ) : (
                    <button className="danger" disabled={Boolean(busy)} onClick={() => run(member.id, "SUSPEND")}>{busy === `${member.id}:SUSPEND` ? "Working…" : "Suspend"}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="dk-commercial-empty">No portal account is attached to this merchant. Approve a Merchant Lead to create access.</div>}

        <p className="dk-commercial-note">Suspending portal access signs the user out and revokes unused login links. It does not cancel Stripe billing.</p>
        {message ? <div className="dk-commercial-message good">{message}</div> : null}
        {error ? <div className="dk-commercial-message bad">{error}</div> : null}
      </div>
    </div>
  );
}
