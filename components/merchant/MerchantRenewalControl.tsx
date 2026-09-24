"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RenewalMode = "AUTO" | "MANUAL";

export default function MerchantRenewalControl({
  initialMode,
  disabledReason,
  periodEndLabel,
}: {
  initialMode: RenewalMode;
  disabledReason?: string | null;
  periodEndLabel?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<RenewalMode>(initialMode);
  const [busy, setBusy] = useState<RenewalMode | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function changeMode(nextMode: RenewalMode) {
    if (disabledReason || busy || nextMode === mode) return;

    setBusy(nextMode);
    setMessage("");
    setError("");

    const response = await fetch("/api/merchant/renewal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setBusy(null);
      setError(data?.error || "Δεν ήταν δυνατό να αλλάξει ο τρόπος ανανέωσης.");
      return;
    }

    setMode(data?.renewalMode === "MANUAL" ? "MANUAL" : "AUTO");
    setBusy(null);
    setMessage(
      data?.renewalMode === "MANUAL"
        ? "Η αυτόματη ανανέωση απενεργοποιήθηκε."
        : "Η αυτόματη ανανέωση ενεργοποιήθηκε.",
    );
    router.refresh();
  }

  return (
    <div className="dkm41-renewal-control">
      <button
        type="button"
        className={mode === "AUTO" ? "is-active" : undefined}
        disabled={Boolean(disabledReason) || Boolean(busy)}
        onClick={() => changeMode("AUTO")}
      >
        <span className="dkm41-renewal-icon" aria-hidden>↻</span>
        <span>
          <b>Αυτόματη ανανέωση</b>
          <small>Το Stripe χρεώνει αυτόματα την αποθηκευμένη μέθοδο πληρωμής.</small>
        </span>
        <i>{mode === "AUTO" ? "ΕΝΕΡΓΗ" : ""}</i>
      </button>

      <button
        type="button"
        className={mode === "MANUAL" ? "is-active" : undefined}
        disabled={Boolean(disabledReason) || Boolean(busy)}
        onClick={() => changeMode("MANUAL")}
      >
        <span className="dkm41-renewal-icon" aria-hidden>◷</span>
        <span>
          <b>Χειροκίνητη ανανέωση</b>
          <small>
            Δεν θα γίνει νέα αυτόματη χρέωση{periodEndLabel ? ` μετά τις ${periodEndLabel}` : " στο τέλος της περιόδου"}.
          </small>
        </span>
        <i>{mode === "MANUAL" ? "ΕΝΕΡΓΗ" : ""}</i>
      </button>

      {disabledReason ? <p className="dkm41-renewal-note">{disabledReason}</p> : null}
      {message ? <p className="dkm41-renewal-success">{message}</p> : null}
      {error ? <p className="dkm41-renewal-error">{error}</p> : null}
    </div>
  );
}
