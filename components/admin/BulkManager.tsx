"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function BulkManager({cards,categories,occasions}:{cards:any[];categories:any[];occasions:any[]}) {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]);
  const [q,setQ]=useState("");
  const [busy,setBusy]=useState(false);
  const filtered=useMemo(()=>cards.filter((c:any)=>`${c.merchant?.name} ${c.title}`.toLowerCase().includes(q.toLowerCase())),[cards,q]);
  const all=filtered.length>0 && filtered.every((c:any)=>selected.includes(c.id));

  function toggle(id:string){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}
  function toggleAll(){setSelected(s=>all?s.filter(id=>!filtered.some((c:any)=>c.id===id)):[...new Set([...s,...filtered.map((c:any)=>c.id)])])}

  async function run(action:string,value?:string){
    if(!selected.length)return alert("Select gift cards first.");
    setBusy(true);
    const res=await fetch("/api/admin/bulk",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({giftCardIds:selected,action,value})});
    setBusy(false);
    const j=await res.json();
    if(!res.ok)return alert(j.error||"Bulk action failed");
    alert(`Updated ${j.updated ?? selected.length} gift cards.`);
    router.refresh();
  }

  return <div className="dk-bulk">
    <div className="dk-bulktoolbar">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search merchant or gift card…"/>
      <b>{selected.length} selected</b>
      <select defaultValue="" onChange={e=>{if(e.target.value)run("status",e.target.value);e.currentTarget.value=""}} disabled={busy}>
        <option value="">Set status…</option><option>ACTIVE</option><option>HIDDEN</option><option>DRAFT</option><option>ARCHIVED</option>
      </select>
      <select defaultValue="" onChange={e=>{if(e.target.value)run("verification",e.target.value);e.currentTarget.value=""}} disabled={busy}>
        <option value="">Set verification…</option><option>VERIFIED</option><option>NEEDS_REVIEW</option><option>PENDING</option>
      </select>
      <button onClick={()=>run("featured","true")} disabled={busy}>Feature</button>
      <button onClick={()=>run("featured","false")} disabled={busy}>Unfeature</button>
    </div>

    <div className="dk-grid2 cms">
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Mass taxonomy</h3><p>Add category/occasion to every selected card.</p></div>
        <div className="dk-bulkselects">
          <select defaultValue="" onChange={e=>{if(e.target.value)run("addCategory",e.target.value);e.currentTarget.value=""}}><option value="">+ Category…</option>{categories.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select defaultValue="" onChange={e=>{if(e.target.value)run("addOccasion",e.target.value);e.currentTarget.value=""}}><option value="">+ Occasion…</option>{occasions.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
      </section>
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Selection safety</h3><p>Bulk mutations never delete cards or merchants. Only explicit status/feature/taxonomy fields are changed.</p></div>
        <button className="dk-btn" onClick={()=>setSelected([])}>Clear selection</button>
      </section>
    </div>

    <section className="dk-editor">
      <div className="dk-bulkhead"><label><input type="checkbox" checked={all} onChange={toggleAll}/> Select visible</label><span>{filtered.length} visible</span></div>
      <div className="dk-bulklist">
        {filtered.map((c:any)=><label key={c.id} className={`dk-bulkrow ${selected.includes(c.id)?"selected":""}`}>
          <input type="checkbox" checked={selected.includes(c.id)} onChange={()=>toggle(c.id)}/>
          <div><b>{c.merchant?.name}</b><small>{c.title}</small></div>
          <span>{c.status}</span><span>{c.verificationStatus}</span>{c.featured&&<em>★</em>}
        </label>)}
      </div>
    </section>
  </div>
}
