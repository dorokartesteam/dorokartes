"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function MergeCenter({merchants}:{merchants:any[]}) {
  const router=useRouter();
  const [keep,setKeep]=useState("");
  const [merge,setMerge]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const a=useMemo(()=>merchants.find((m:any)=>m.id===keep),[keep,merchants]);
  const b=useMemo(()=>merchants.find((m:any)=>m.id===merge),[merge,merchants]);

  async function execute(){
    if(!keep||!merge||keep===merge)return alert("Choose two different merchants.");
    if(confirm!=="MERGE")return alert('Type MERGE to confirm.');
    setBusy(true);
    const res=await fetch("/api/admin/merge",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({keepId:keep,mergeId:merge,confirm})});
    setBusy(false);
    const j=await res.json();
    if(!res.ok)return alert(j.error||"Merge failed");
    alert(`Merged. Reassigned ${j.reassignedCards} gift cards.`);
    router.push(`/admin/merchants/${keep}`);
    router.refresh();
  }

  return <div className="dk-grid2 cms">
    <section className="dk-editor">
      <div className="dk-editorheading"><h3>Canonical merchant</h3><p>This merchant survives and receives all gift cards.</p></div>
      <select className="dk-bigselect" value={keep} onChange={e=>setKeep(e.target.value)}><option value="">Select canonical merchant…</option>{merchants.map((m:any)=><option key={m.id} value={m.id}>{m.name} · {m._count?.giftCards||0} cards</option>)}</select>
      {a&&<div className="dk-mergepreview"><b>{a.name}</b><small>{a.websiteUrl}</small><span>{a._count?.giftCards||0} cards</span></div>}
    </section>
    <section className="dk-editor">
      <div className="dk-editorheading"><h3>Duplicate merchant</h3><p>Gift cards move to canonical. Duplicate is archived, not hard-deleted.</p></div>
      <select className="dk-bigselect" value={merge} onChange={e=>setMerge(e.target.value)}><option value="">Select duplicate merchant…</option>{merchants.map((m:any)=><option key={m.id} value={m.id}>{m.name} · {m._count?.giftCards||0} cards</option>)}</select>
      {b&&<div className="dk-mergepreview danger"><b>{b.name}</b><small>{b.websiteUrl}</small><span>{b._count?.giftCards||0} cards</span></div>}
      <div className="dk-dangerzone"><p>Type <b>MERGE</b> to enable.</p><input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="MERGE"/><button onClick={execute} disabled={busy||confirm!=="MERGE"}>{busy?"Merging…":"Merge merchants"}</button></div>
    </section>
  </div>
}
