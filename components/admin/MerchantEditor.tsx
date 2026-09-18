"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MerchantEditor({ merchant }: { merchant: any }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setMessage("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());

    const res = await fetch(`/api/admin/merchant/${merchant.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    setSaving(false);
    setMessage(res.ok ? "Saved" : json.error || "Save failed");
    if (res.ok) router.refresh();
  }

  return <form className="dk-editor dk-editor-v41" onSubmit={submit}>
    <div className="dk-editor-section-v41">
      <div className="dk-editorheading"><h3>Identity</h3><p>Canonical merchant record used across all attached gift cards.</p></div>
      <div className="dk-formgrid two">
        <label><span>Name</span><input name="name" defaultValue={merchant.name || ""}/></label>
        <label><span>Slug</span><input name="slug" defaultValue={merchant.slug || ""}/></label>
        <label className="full"><span>Merchant website</span><input name="websiteUrl" defaultValue={merchant.websiteUrl || ""}/><small>General merchant website only. Gift-card-specific URLs belong on each Gift Card.</small></label>
        <label className="full"><span>Logo URL</span><input name="logoUrl" defaultValue={merchant.logoUrl || ""}/></label>
        <label><span>Country</span><input name="country" defaultValue={merchant.country || "GR"}/></label>
        <label><span>Status</span><select name="status" defaultValue={merchant.status || "ACTIVE"}><option>ACTIVE</option><option>INACTIVE</option><option>NEEDS_REVIEW</option><option>ARCHIVED</option></select></label>
      </div>
    </div>

    <div className="dk-editor-section-v41">
      <div className="dk-editorheading"><h3>Profile & SEO</h3><p>Merchant landing-page content for Dorokartes.</p></div>
      <div className="dk-formgrid two">
        <label className="full"><span>Description</span><textarea name="description" rows={6} defaultValue={merchant.description || ""}/></label>
        <label className="full"><span>SEO Title</span><input name="seoTitle" defaultValue={merchant.seoTitle || ""}/></label>
        <label className="full"><span>Meta Description</span><textarea name="metaDescription" rows={3} defaultValue={merchant.metaDescription || ""}/></label>
      </div>
    </div>

    <div className="dk-editorfooter"><span className={message === "Saved" ? "goodtext":"badtext"}>{message}</span><button className="dk-btn primary" disabled={saving}>{saving ? "Saving…" : "Save merchant"}</button></div>
  </form>;
}
