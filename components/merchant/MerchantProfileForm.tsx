"use client";

import { FormEvent, useState } from "react";

type MerchantProfile = {
  name: string;
  legalName: string | null;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
};

export default function MerchantProfileForm({
  merchant,
}: {
  merchant: MerchantProfile;
}) {
  const [state, setState] = useState<"idle" | "busy" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("busy");

    const form = new FormData(event.currentTarget);
    const body = {
      legalName: String(form.get("legalName") || ""),
      description: String(form.get("description") || ""),
      websiteUrl: String(form.get("websiteUrl") || ""),
    };

    const response = await fetch("/api/merchant/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    setState(response.ok ? "success" : "error");
  }

  return (
    <form className="dkm-form" onSubmit={submit}>
      <label>
        <span>Brand name</span>
        <input value={merchant.name} disabled />
        <small>Η αλλαγή του public brand name γίνεται μετά από έλεγχο.</small>
      </label>

      <label>
        <span>Νομική επωνυμία</span>
        <input name="legalName" defaultValue={merchant.legalName || ""} maxLength={180} />
      </label>

      <label>
        <span>Website</span>
        <input name="websiteUrl" type="url" defaultValue={merchant.websiteUrl || ""} maxLength={300} />
      </label>

      <label>
        <span>Περιγραφή</span>
        <textarea name="description" rows={7} maxLength={2000} defaultValue={merchant.description || ""} />
      </label>

      {merchant.logoUrl ? (
        <div className="dkm-profile-note">
          Το logo του brand είναι ήδη συνδεδεμένο. Αλλαγές logo θα προστεθούν σε επόμενο βήμα.
        </div>
      ) : null}

      <div className="dkm-form-actions">
        <button disabled={state === "busy"}>
          {state === "busy" ? "Αποθήκευση..." : "Αποθήκευση αλλαγών"}
        </button>
        {state === "success" ? <span className="success">Αποθηκεύτηκε ✓</span> : null}
        {state === "error" ? <span className="error">Η αποθήκευση απέτυχε.</span> : null}
      </div>
    </form>
  );
}
