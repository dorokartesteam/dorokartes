"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function VariantManager({ cardId, variants }: { cardId:string; variants:any[] }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);

  async function create(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true);
    const fd=new FormData(e.currentTarget);
    const body=Object.fromEntries(fd.entries());
    const res=await fetch(`/api/admin/gift-card/${cardId}/variant`,{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
    });
    setBusy(false);
    if(!res.ok){const j=await res.json();alert(j.error||"Create failed");return}
    (e.currentTarget as HTMLFormElement).reset(); router.refresh();
  }

  async function remove(id:string){
    if(!confirm("Delete this variant?")) return;
    const res=await fetch(`/api/admin/gift-card/${cardId}/variant?id=${encodeURIComponent(id)}`,{method:"DELETE"});
    if(!res.ok){const j=await res.json();alert(j.error||"Delete failed");return}
    router.refresh();
  }

  return <section className="dk-editor">
    <div className="dk-editorheading"><h3>Variants / values</h3><p>One gift-card program can have many purchasable values.</p></div>
    <div className="dk-variantlist">
      {(variants||[]).map((v:any)=><div className="dk-variantrow" key={v.id}>
        <div><b>{v.label || v.amount || "Variant"}</b><small>{v.currency || "EUR"} · {v.type || "UNKNOWN"}</small></div>
        <code>{v.purchaseUrl || "uses card URL"}</code>
        <button onClick={()=>remove(v.id)}>Delete</button>
      </div>)}
      {!variants?.length && <div className="dk-empty">No variants yet.</div>}
    </div>
    <form onSubmit={create} className="dk-inlineform">
      <input name="label" placeholder="Label e.g. €50"/>
      <input name="amount" type="number" step="0.01" placeholder="Amount"/>
      <input name="currency" defaultValue="EUR" placeholder="Currency"/>
      <select name="type" defaultValue="DIGITAL"><option>DIGITAL</option><option>PHYSICAL</option><option>DIGITAL_AND_PHYSICAL</option><option>CORPORATE</option><option>EXPERIENCE</option><option>THIRD_PARTY_PREPAID</option></select>
      <input name="purchaseUrl" placeholder="Specific purchase URL"/>
      <button className="dk-btn primary" disabled={busy}>{busy?"Adding…":"Add variant"}</button>
    </form>
  </section>
}
