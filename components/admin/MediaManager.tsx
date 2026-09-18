"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MediaManager({ cardId, media }: { cardId:string; media:any[] }) {
  const router=useRouter(); const [busy,setBusy]=useState(false);
  async function add(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);
    const fd=new FormData(e.currentTarget);
    const res=await fetch(`/api/admin/gift-card/${cardId}/media`,{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(fd.entries()))
    });
    setBusy(false);
    if(!res.ok){const j=await res.json();alert(j.error||"Media add failed");return}
    (e.currentTarget as HTMLFormElement).reset();router.refresh();
  }
  async function remove(id:string){
    const res=await fetch(`/api/admin/gift-card/${cardId}/media?id=${encodeURIComponent(id)}`,{method:"DELETE"});
    if(!res.ok){const j=await res.json();alert(j.error||"Delete failed");return}
    router.refresh();
  }
  return <section className="dk-editor">
    <div className="dk-editorheading"><h3>Media</h3><p>Logo / card artwork / lifestyle image URLs. Upload provider can be connected later without changing the CMS model.</p></div>
    <div className="dk-mediagrid">
      {(media||[]).map((m:any)=><div className="dk-mediacard" key={m.id}>
        <div className="dk-mediapreview" style={{backgroundImage:`url("${m.url}")`}}/>
        <div><b>{m.altText || m.type || "Media"}</b><small>{m.url}</small></div>
        <button onClick={()=>remove(m.id)}>Remove</button>
      </div>)}
    </div>
    <form className="dk-inlineform media" onSubmit={add}>
      <input name="url" required placeholder="https://… image URL"/>
      <input name="altText" placeholder="Alt text"/>
      <input name="type" placeholder="CARD / LOGO / HERO"/>
      <button className="dk-btn primary" disabled={busy}>Add media</button>
    </form>
  </section>
}
