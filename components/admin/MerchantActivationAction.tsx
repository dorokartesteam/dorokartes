"use client";

import { useState } from "react";

export function MerchantActivationAction({
  leadId,
  disabled = false,
}: {
  leadId: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function send() {
    setState("busy");
    setMessage("");

    const response = await fetch(`/api/admin/merchant-activation/${leadId}/send`, {
      method: "POST",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setState("error");
      setMessage(data?.error || "Το reminder απέτυχε.");
      return;
    }

    setState("done");
    setMessage("Στάλθηκε.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <div className="dk-activation-action">
      <button
        type="button"
        className="dk-btn"
        onClick={send}
        disabled={disabled || state === "busy" || state === "done"}
      >
        {state === "busy" ? "Sending…" : state === "done" ? "Sent ✓" : "Send reminder"}
      </button>
      {state === "error" ? <small className="is-error">{message}</small> : null}
    </div>
  );
}

export function MerchantActivationRunDue({ count }: { count: number }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    if (!count) return;
    if (!confirm(`Να σταλούν τώρα ${count} follow-up email(s) που είναι due;`)) return;

    setState("busy");
    const response = await fetch("/api/admin/merchant-activation/run", { method: "POST" });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setState("error");
      setMessage(data?.error || "Η εκτέλεση απέτυχε.");
      return;
    }

    setState("done");
    setMessage(`${data.sent || 0} sent · ${data.failed || 0} failed`);
    window.setTimeout(() => window.location.reload(), 900);
  }

  return (
    <div className="dk-activation-run">
      <button className="dk-btn primary" type="button" onClick={run} disabled={!count || state === "busy"}>
        {state === "busy" ? "Sending due reminders…" : `Send due now (${count})`}
      </button>
      {message ? <small className={state === "error" ? "is-error" : ""}>{message}</small> : null}
    </div>
  );
}
