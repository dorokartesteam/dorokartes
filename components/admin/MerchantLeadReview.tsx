"use client";

import { useMemo, useState } from "react";

type MerchantOption = {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
};

export default function MerchantLeadReview({
  lead,
  merchants,
}: {
  lead: { id: string; status: string; matchedMerchantId: string | null };
  merchants: MerchantOption[];
}) {
  const [merchantId, setMerchantId] = useState(lead.matchedMerchantId || "");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { type: "idle" }
    | { type: "busy" }
    | { type: "success"; inviteUrl: string; emailSent: boolean }
    | { type: "followup"; message: string }
    | { type: "error"; message: string }
  >({ type: "idle" });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merchants.slice(0, 40);

    return merchants
      .filter((m) =>
        `${m.name} ${m.slug} ${m.websiteUrl || ""}`.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [merchants, query]);

  async function approve() {
    if (!merchantId) {
      setState({ type: "error", message: "Επίλεξε merchant πριν την έγκριση." });
      return;
    }

    setState({ type: "busy" });

    const response = await fetch(`/api/admin/merchant-leads/${lead.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchantId }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setState({
        type: "error",
        message: data?.error || "Η έγκριση απέτυχε.",
      });
      return;
    }

    setState({
      type: "success",
      inviteUrl: data.inviteUrl,
      emailSent: Boolean(data.emailSent),
    });
  }

  async function reject() {
    if (!confirm("Να απορριφθεί αυτό το lead;")) return;

    setState({ type: "busy" });

    const response = await fetch(`/api/admin/merchant-leads/${lead.id}/reject`, {
      method: "POST",
    });

    if (!response.ok) {
      setState({ type: "error", message: "Η απόρριψη απέτυχε." });
      return;
    }

    window.location.reload();
  }

  async function sendFollowUp() {
    setState({ type: "busy" });

    const response = await fetch(`/api/admin/merchant-leads/${lead.id}/follow-up`, {
      method: "POST",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setState({
        type: "error",
        message: data?.error || "Το follow-up email απέτυχε.",
      });
      return;
    }

    setState({
      type: "followup",
      message: data?.message || "Το follow-up email στάλθηκε.",
    });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <label style={{ display: "grid", gap: 7 }}>
          <b>Search merchant</b>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, slug or domain…"
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 7 }}>
        <b>Match existing merchant</b>
        <select
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          size={Math.min(10, Math.max(filtered.length, 4))}
        >
          <option value="">— Select merchant —</option>
          {filtered.map((merchant) => (
            <option key={merchant.id} value={merchant.id}>
              {merchant.name} · {merchant.slug}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="dk-btn primary" type="button" onClick={approve} disabled={state.type === "busy"}>
          Approve & create portal access
        </button>
        <button className="dk-btn" type="button" onClick={reject} disabled={state.type === "busy"}>
          Reject
        </button>
        {lead.status !== "REJECTED" ? (
          <button className="dk-btn" type="button" onClick={sendFollowUp} disabled={state.type === "busy"}>
            Send follow-up email
          </button>
        ) : null}
      </div>

      {state.type === "success" ? (
        <div style={{ padding: 14, borderRadius: 12, background: "#eefbf6", border: "1px solid #bfead8" }}>
          <b>Portal invitation created.</b>
          <p style={{ margin: "7px 0" }}>
            {state.emailSent ? "Το invitation email στάλθηκε." : "Το email service δεν είναι ρυθμισμένο — αντέγραψε το link."}
          </p>
          <input
            readOnly
            value={state.inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: "100%" }}
          />
        </div>
      ) : null}

      {state.type === "followup" ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#eefbf6", color: "#176a4d" }}>
          {state.message}
        </div>
      ) : null}

      {state.type === "error" ? (
        <div style={{ padding: 12, borderRadius: 10, background: "#fff1f2", color: "#a51f32" }}>
          {state.message}
        </div>
      ) : null}
    </div>
  );
}
