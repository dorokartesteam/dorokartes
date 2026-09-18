"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const REVIEW_REASONS = [
  "Wrong URL",
  "Homepage only",
  "Gift card not found",
  "Broken page",
  "Wrong country / locale",
  "Merchant unclear",
  "Possible duplicate",
  "Other",
];

export default function VerificationActions({
  cardId,
  officialUrl,
  verificationStatus,
}: {
  cardId: string;
  officialUrl?: string | null;
  verificationStatus?: string | null;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const [reason, setReason] = useState(REVIEW_REASONS[0]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function act(action: "verify" | "review", notes?: string) {
    if (action === "verify" && !officialUrl) {
      setError("Official URL required");
      return;
    }

    setBusy(action);
    setError("");

    const res = await fetch(`/api/admin/gift-card/${cardId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, notes }),
    });

    const json = await res.json().catch(() => ({}));
    setBusy("");

    if (!res.ok) {
      setError(json.error || "Action failed");
      return;
    }

    setReviewModal(false);
    setMenu(false);
    router.refresh();
  }

  async function copyUrl() {
    if (!officialUrl) return;
    await navigator.clipboard.writeText(officialUrl).catch(() => {});
    setMenu(false);
  }

  return (
    <>
      <div className="dk-ver-actions-v42">
        {officialUrl ? (
          <a href={officialUrl} target="_blank" rel="noreferrer" className="dk-ver-open-v42">
            Open ↗
          </a>
        ) : (
          <button className="dk-ver-open-v42 disabled" disabled>No URL</button>
        )}

        <button
          className="dk-ver-approve-v42"
          disabled={!!busy || verificationStatus === "VERIFIED" || !officialUrl}
          onClick={() => act("verify")}
        >
          {busy === "verify" ? "Saving…" : verificationStatus === "VERIFIED" ? "Verified ✓" : "Verify ✓"}
        </button>

        <div className="dk-ver-morewrap-v42" ref={menuRef}>
          <button
            className="dk-ver-more-v42"
            onClick={() => setMenu((v) => !v)}
            aria-label="More verification actions"
            aria-expanded={menu}
          >
            •••
          </button>

          {menu && (
            <div className="dk-ver-menu-v42">
              <Link href={`/admin/gift-cards/${cardId}`} onClick={() => setMenu(false)}>
                <span>Open card</span><small>View/edit full record</small>
              </Link>

              {officialUrl && (
                <button onClick={copyUrl}>
                  <span>Copy official URL</span><small>Copy destination to clipboard</small>
                </button>
              )}

              {verificationStatus !== "NEEDS_REVIEW" && (
                <button className="warning" onClick={() => { setMenu(false); setReviewModal(true); }}>
                  <span>Needs review…</span><small>Move back to manual queue</small>
                </button>
              )}
            </div>
          )}
        </div>

        {error ? <small className="dk-ver-error-v42">{error}</small> : null}
      </div>

      {reviewModal && (
        <div className="dk-ver-modalbackdrop-v42" onMouseDown={() => setReviewModal(false)}>
          <div className="dk-ver-modal-v42" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dk-ver-modal-head-v42">
              <div>
                <b>Move to Needs review</b>
                <span>Record why this card needs another human check.</span>
              </div>
              <button onClick={() => setReviewModal(false)}>×</button>
            </div>

            <label>
              Review reason
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {REVIEW_REASONS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>

            <div className="dk-ver-modal-actions-v42">
              <button onClick={() => setReviewModal(false)}>Cancel</button>
              <button className="primary" disabled={!!busy} onClick={() => act("review", reason)}>
                {busy === "review" ? "Saving…" : "Move to review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
