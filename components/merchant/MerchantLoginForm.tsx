"use client";

import { FormEvent, useState } from "react";

export default function MerchantLoginForm() {
  const [state, setState] = useState<
    | { type: "idle" }
    | { type: "busy" }
    | { type: "success" }
    | { type: "error"; message: string }
  >({ type: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();

    setState({ type: "busy" });

    const response = await fetch("/api/merchant/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setState({
        type: "error",
        message: data?.error || "Δεν ήταν δυνατή η αποστολή του link.",
      });
      return;
    }

    setState({ type: "success" });
  }

  if (state.type === "success") {
    return (
      <div className="dkm-auth-success">
        <b>Έλεγξε το email σου.</b>
        <span>
          Αν υπάρχει ενεργός merchant λογαριασμός για αυτό το email, το link
          σύνδεσης έχει σταλεί.
        </span>
      </div>
    );
  }

  return (
    <form className="dkm-auth-form" onSubmit={submit}>
      <label>
        <span>Επαγγελματικό email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@company.gr"
        />
      </label>

      {state.type === "error" ? (
        <div className="dkm-alert error">{state.message}</div>
      ) : null}

      <button disabled={state.type === "busy"}>
        {state.type === "busy" ? "Αποστολή..." : "Στείλε link σύνδεσης →"}
      </button>
    </form>
  );
}
