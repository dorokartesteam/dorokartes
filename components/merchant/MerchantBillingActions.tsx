"use client";

import { useState } from "react";

type Plan = "PARTNER" | "FEATURED" | "PREMIUM_BANNER";

export default function MerchantBillingActions({
  plan,
  currentPlan,
  subscriptionStatus,
  premiumAvailable,
}: {
  plan: Plan;
  currentPlan: string;
  subscriptionStatus: string;
  premiumAvailable: number;
}) {
  const [state, setState] = useState<
    | { type: "idle" }
    | { type: "busy" }
    | { type: "error"; message: string }
  >({ type: "idle" });

  const stripeManaged =
    subscriptionStatus === "ACTIVE" || subscriptionStatus === "PAST_DUE";

  const current = currentPlan === plan;
  const premiumSoldOut =
    plan === "PREMIUM_BANNER" && premiumAvailable <= 0 && !current;

  async function openPortal() {
    setState({ type: "busy" });

    const response = await fetch("/api/merchant/billing-portal", {
      method: "POST",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.url) {
      setState({
        type: "error",
        message:
          data?.error ||
          "Δεν ήταν δυνατό να ανοίξει η διαχείριση της συνδρομής.",
      });
      return;
    }

    window.location.href = data.url;
  }

  async function checkout() {
    if (stripeManaged) {
      await openPortal();
      return;
    }

    setState({ type: "busy" });

    const response = await fetch("/api/merchant/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan }),
    });

    const data = await response.json().catch(() => null);

    if (response.status === 409 && data?.manageSubscription) {
      await openPortal();
      return;
    }

    if (!response.ok || !data?.url) {
      setState({
        type: "error",
        message: data?.error || "Δεν ήταν δυνατό να ξεκινήσει το Checkout.",
      });
      return;
    }

    window.location.href = data.url;
  }

  return (
    <div className="dkm-plan-action">
      <button
        type="button"
        onClick={checkout}
        disabled={state.type === "busy" || premiumSoldOut}
      >
        {state.type === "busy"
          ? "Άνοιγμα Stripe..."
          : premiumSoldOut
            ? "Μη διαθέσιμο"
            : stripeManaged
              ? current
                ? "Διαχείριση συνδρομής"
                : "Αλλαγή μέσω Stripe"
              : current
                ? "Ενεργοποίηση & πληρωμή"
                : "Επιλογή πακέτου"}
      </button>

      {state.type === "error" ? (
        <span className="dkm-plan-error">{state.message}</span>
      ) : null}
    </div>
  );
}

export function MerchantBillingPortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setBusy(true);
    setError("");

    const response = await fetch("/api/merchant/billing-portal", {
      method: "POST",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.url) {
      setBusy(false);
      setError(data?.error || "Δεν ήταν δυνατό να ανοίξει το Stripe portal.");
      return;
    }

    window.location.href = data.url;
  }

  return (
    <div className="dkm-manage-subscription">
      <button type="button" onClick={openPortal} disabled={busy}>
        {busy ? "Άνοιγμα..." : "Διαχείριση συνδρομής στο Stripe →"}
      </button>
      {error ? <span>{error}</span> : null}
    </div>
  );
}
