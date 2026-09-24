"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MerchantProfile = {
  name: string;
  legalName: string | null;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function MerchantProfileForm({ merchant }: { merchant: MerchantProfile }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [uploadState, setUploadState] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [logoUrl, setLogoUrl] = useState(merchant.logoUrl);

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError("");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadState("error");
      setUploadError("Χρησιμοποίησε JPG, PNG ή WEBP.");
      event.target.value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadState("error");
      setUploadError("Η εικόνα πρέπει να είναι έως 3 MB.");
      event.target.value = "";
      return;
    }

    setUploadState("busy");
    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch("/api/merchant/logo", { method: "POST", body: form });
      const data = (await response.json().catch(() => null)) as { logoUrl?: string; error?: string } | null;
      if (!response.ok || !data?.logoUrl) throw new Error(data?.error || "Upload failed");
      setLogoUrl(data.logoUrl);
      setUploadState("success");
      router.refresh();
    } catch (error) {
      setUploadState("error");
      setUploadError(error instanceof Error ? error.message : "Η μεταφόρτωση απέτυχε.");
    } finally {
      event.target.value = "";
    }
  }

  async function removeLogo() {
    setUploadError("");
    setUploadState("busy");
    const response = await fetch("/api/merchant/logo", { method: "DELETE" });
    if (response.ok) {
      setLogoUrl(null);
      setUploadState("success");
      router.refresh();
    } else {
      setUploadState("error");
      setUploadError("Δεν ήταν δυνατή η αφαίρεση της εικόνας.");
    }
  }

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
    if (response.ok) router.refresh();
  }

  return (
    <form className="dkm-form dkm-profile-form-v4" onSubmit={submit}>
      <section className="dkm-profile-image-editor">
        <div className="dkm-profile-image-preview">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${merchant.name} logo`} />
          ) : (
            <span>{initials(merchant.name) || "D"}</span>
          )}
        </div>

        <div className="dkm-profile-image-copy">
          <strong>Logo / εικόνα προφίλ</strong>
          <p>Ανέβασε τετράγωνη εικόνα JPG, PNG ή WEBP έως 3 MB.</p>
          <div className="dkm-profile-image-actions">
            <input
              ref={fileInput}
              className="dkm-visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={uploadLogo}
            />
            <button
              type="button"
              className="dkm-upload-button"
              disabled={uploadState === "busy"}
              onClick={() => fileInput.current?.click()}
            >
              {uploadState === "busy" ? "Ανέβασμα..." : logoUrl ? "Αλλαγή εικόνας" : "Ανέβασμα εικόνας"}
            </button>
            {logoUrl ? (
              <button type="button" className="dkm-remove-image" disabled={uploadState === "busy"} onClick={removeLogo}>
                Αφαίρεση
              </button>
            ) : null}
          </div>
          {uploadState === "success" ? <span className="dkm-upload-success">Η εικόνα ενημερώθηκε ✓</span> : null}
          {uploadState === "error" ? <span className="dkm-upload-error">{uploadError || "Η μεταφόρτωση απέτυχε."}</span> : null}
        </div>
      </section>

      <div className="dkm-profile-fields-grid">
        <label>
          <span>Brand name</span>
          <input value={merchant.name} disabled />
          <small>Η αλλαγή του public brand name γίνεται μετά από έλεγχο.</small>
        </label>

        <label>
          <span>Νομική επωνυμία</span>
          <input name="legalName" defaultValue={merchant.legalName || ""} maxLength={180} />
        </label>

        <label className="dkm-profile-field-wide">
          <span>Website</span>
          <input name="websiteUrl" type="url" defaultValue={merchant.websiteUrl || ""} maxLength={300} />
        </label>

        <label className="dkm-profile-field-wide">
          <span>Περιγραφή</span>
          <textarea name="description" rows={7} maxLength={2000} defaultValue={merchant.description || ""} />
        </label>
      </div>

      <div className="dkm-form-actions">
        <button disabled={state === "busy"}>{state === "busy" ? "Αποθήκευση..." : "Αποθήκευση αλλαγών"}</button>
        {state === "success" ? <span className="success">Αποθηκεύτηκε ✓</span> : null}
        {state === "error" ? <span className="error">Η αποθήκευση απέτυχε.</span> : null}
      </div>
    </form>
  );
}
