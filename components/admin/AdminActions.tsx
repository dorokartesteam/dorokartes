"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DiscoveryActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  async function act(action: string) {
    setBusy(action);
    await fetch(`/api/admin/discovery/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy("");
    router.refresh();
  }
  return <div className="dk-rowactions">
    <button disabled={!!busy} onClick={() => act("accept")}>{busy === "accept" ? "…" : "Accept"}</button>
    <button disabled={!!busy} onClick={() => act("review")}>Review</button>
    <button className="danger" disabled={!!busy} onClick={() => act("reject")}>Reject</button>
  </div>;
}

export function ToggleGiftCard({ id, featured, status }: { id: string; featured: boolean; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function patch(body: any) {
    setBusy(true);
    await fetch(`/api/admin/gift-card/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }
  return <div className="dk-rowactions">
    <button disabled={busy} onClick={() => patch({ featured: !featured })}>{featured ? "Unfeature" : "Feature"}</button>
    <button disabled={busy} onClick={() => patch({ status: status === "ACTIVE" ? "HIDDEN" : "ACTIVE" })}>{status === "ACTIVE" ? "Hide" : "Activate"}</button>
  </div>;
}
