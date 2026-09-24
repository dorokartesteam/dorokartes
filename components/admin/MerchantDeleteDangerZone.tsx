"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type MerchantDeleteDangerZoneProps = {
  merchantId: string;
  merchantName: string;
  giftCardCount: number;
};

export default function MerchantDeleteDangerZone({
  merchantId,
  merchantName,
  giftCardCount,
}: MerchantDeleteDangerZoneProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const ready = confirmation.trim() === merchantName;

  async function deleteMerchant() {
    if (!ready || deleting) return;

    const approved = window.confirm(
      `Οριστική διαγραφή του merchant “${merchantName}”;\n\n` +
        `Θα διαγραφούν επίσης ${giftCardCount} gift card(s), portal users, sessions, subscription data, premium placements και συνδεδεμένα tracking/source records.\n\n` +
        `Αν υπάρχει ενεργή Stripe συνδρομή, θα γίνει ακύρωση πριν από τη διαγραφή. Αυτή η ενέργεια δεν αναιρείται.`,
    );

    if (!approved) return;

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/merchant/${merchantId}/delete`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmPermanent: true,
          confirmName: confirmation.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Δεν ήταν δυνατή η οριστική διαγραφή.");
      }

      router.push("/admin/merchants");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Δεν ήταν δυνατή η οριστική διαγραφή.");
      setDeleting(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 24,
        border: "1px solid rgba(220,38,38,.28)",
        background: "rgba(254,242,242,.65)",
        borderRadius: 18,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "20px 22px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: "#991b1b",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              marginBottom: 5,
            }}
          >
            Danger zone
          </div>
          <h3 style={{ margin: 0, color: "#111827", fontSize: 18 }}>
            Οριστική διαγραφή merchant
          </h3>
          <p style={{ margin: "6px 0 0", color: "#6b7280", lineHeight: 1.55 }}>
            Διαγράφει το merchant και όλα τα άμεσα συνδεδεμένα δεδομένα του από το Dorokartes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setError("");
          }}
          style={{
            minHeight: 42,
            border: "1px solid #dc2626",
            color: "#b91c1c",
            background: "#fff",
            borderRadius: 10,
            padding: "0 16px",
            fontWeight: 750,
            cursor: "pointer",
          }}
        >
          {open ? "Ακύρωση" : "Διαγραφή merchant"}
        </button>
      </div>

      {open ? (
        <div
          style={{
            borderTop: "1px solid rgba(220,38,38,.18)",
            padding: "20px 22px 22px",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            {[
              ["Gift cards", String(giftCardCount)],
              ["Portal access", "Θα διαγραφεί"],
              ["Subscription", "Θα ακυρωθεί/διαγραφεί"],
              ["Clicks & sources", "Θα διαγραφούν"],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  border: "1px solid #fee2e2",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "#fffafa",
                }}
              >
                <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                  {label}
                </div>
                <div style={{ marginTop: 4, color: "#7f1d1d", fontWeight: 800 }}>{value}</div>
              </div>
            ))}
          </div>

          <label style={{ display: "block", maxWidth: 560 }}>
            <span style={{ display: "block", fontWeight: 700, color: "#374151", marginBottom: 7 }}>
              Γράψε ακριβώς <strong>{merchantName}</strong> για επιβεβαίωση
            </span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 44,
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "0 12px",
                fontSize: 15,
                outline: "none",
              }}
            />
          </label>

          {error ? (
            <div style={{ color: "#b91c1c", marginTop: 12, fontWeight: 650 }}>{error}</div>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              disabled={!ready || deleting}
              onClick={deleteMerchant}
              style={{
                minHeight: 44,
                border: 0,
                borderRadius: 10,
                padding: "0 18px",
                fontWeight: 800,
                color: "#fff",
                background: !ready || deleting ? "#fca5a5" : "#dc2626",
                cursor: !ready || deleting ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "Διαγραφή…" : "Οριστική διαγραφή"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
