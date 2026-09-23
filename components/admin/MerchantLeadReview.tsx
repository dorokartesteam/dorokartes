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
        <button
          className="dk-btn primary"
          type="button"
          onClick={approve}
          disabled={state.type === "busy"}
        >
          Approve & create portal access
        </button>
        <button
          className="dk-btn"
          type="button"
          onClick={reject}
          disabled={state.type === "busy"}
        >
          Reject
        </button>
      </div>

      {state.type === "success" ? (
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: "#ecfdf5",
            border: "1px solid #86efac",
            color: "#14532d",
            boxShadow: "0 8px 24px rgba(20, 83, 45, 0.08)",
          }}
        >
          <b
            style={{
              display: "block",
              color: "#14532d",
              fontSize: 15,
              marginBottom: 6,
            }}
          >
            Portal invitation created.
          </b>

          <p
            style={{
              margin: "0 0 12px",
              color: "#166534",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {state.emailSent
              ? "Το invitation email στάλθηκε."
              : "Το email service δεν είναι ρυθμισμένο — αντέγραψε το link."}
          </p>

          <input
            readOnly
            value={state.inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%",
              minHeight: 42,
              boxSizing: "border-box",
              padding: "0 12px",
              border: "1px solid #a7f3d0",
              borderRadius: 10,
              background: "#ffffff",
              color: "#16324a",
              fontSize: 12,
              fontFamily: "monospace",
              outline: "none",
            }}
          />
        </div>
      ) : null}

      {state.type === "error" ? (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#fff1f2",
            color: "#a51f32",
          }}
        >
          {state.message}
        </div>
      ) : null}
    </div>
  );
}
