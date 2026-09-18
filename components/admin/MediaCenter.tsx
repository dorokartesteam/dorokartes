"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function MediaCenter({rows}:{rows:any[]}) {
  const router = useRouter();
  const [q,setQ] = useState("");
  const [filter,setFilter] = useState("all");
  const [selected,setSelected] = useState<any|null>(null);
  const [url,setUrl] = useState("");
  const [alt,setAlt] = useState("");
  const [busy,setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((x:any) => {
      const match = !needle || `${x.merchant?.name} ${x.title}`.toLowerCase().includes(needle);
      if(!match) return false;
      if(filter==="missing" && x.hasMedia) return false;
      if(filter==="with" && !x.hasMedia) return false;
      if(filter==="alt" && (!x.hasMedia || x.hasAlt)) return false;
      return true;
    });
  },[rows,q,filter]);

  async function addMedia(e:React.FormEvent){
    e.preventDefault();
    if(!selected) return;
    setBusy(true);
    const res = await fetch("/api/admin/media", {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({giftCardId:selected.id,url,altText:alt}),
    });
    const j = await res.json();
    setBusy(false);
    if(!res.ok) return alert(j.error || "Could not add media");
    setUrl(""); setAlt("");
    router.refresh();
  }

  async function removeMedia(id:string){
    if(!confirm("Remove this media asset?")) return;
    const res = await fetch(`/api/admin/media?id=${encodeURIComponent(id)}`, {method:"DELETE"});
    const j = await res.json();
    if(!res.ok) return alert(j.error || "Could not remove media");
    router.refresh();
  }

  return <div className="dk-mediacenter">
    <section className="dk-editor">
      <div className="dk-mediatoolbar">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search merchant / gift card…"/>
        <select value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All cards</option>
          <option value="missing">Missing media</option>
          <option value="with">With media</option>
          <option value="alt">Missing alt text</option>
        </select>
        <b>{filtered.length} cards</b>
      </div>

      <div className="dk-mediagrid">
        {filtered.slice(0,600).map((x:any)=>{
          const primary = x.mediaAssets?.[0];
          return <button key={x.id} className={`dk-mediacard ${selected?.id===x.id?"selected":""}`} onClick={()=>setSelected(x)}>
            <div className="dk-mediaimage">
              {primary?.url ? (
                <img src={primary.url} alt={primary.altText || x.title} />
              ) : (
                <div className="dk-mediaempty">NO MEDIA</div>
              )}
              <span>{x.mediaCount}</span>
            </div>
            <b>{x.merchant?.name}</b>
            <small>{x.title}</small>
            <div className="dk-mediastatus">
              <em className={x.hasMedia?"ok":"bad"}>{x.hasMedia?"MEDIA":"MISSING"}</em>
              {x.hasMedia && <em className={x.hasAlt?"ok":"warn"}>{x.hasAlt?"ALT":"NO ALT"}</em>}
            </div>
          </button>
        })}
      </div>
    </section>

    <aside className={`dk-mediainspector ${selected?"open":""}`}>
      {selected ? <>
        <div className="dk-inspectorhead">
          <div><span>MEDIA INSPECTOR</span><h3>{selected.merchant?.name}</h3><p>{selected.title}</p></div>
          <button onClick={()=>setSelected(null)}>×</button>
        </div>

        <div className="dk-existingmedia">
          <h4>Existing assets</h4>
          {selected.mediaAssets?.length ? selected.mediaAssets.map((m:any)=><div className="dk-mediaasset" key={m.id}>
            <div className="dk-mediaassetpreview">{m.url?<img src={m.url} alt={m.altText||""}/>:null}</div>
            <div><b>"MEDIA"</b><small>{m.altText||"No alt text"}</small><a href={m.url} target="_blank" rel="noreferrer">Open asset ↗</a></div>
            <button onClick={()=>removeMedia(m.id)}>Delete</button>
          </div>) : <div className="dk-noassets">No media attached.</div>}
        </div>

        <form className="dk-addmedia" onSubmit={addMedia}>
          <h4>Add media asset</h4>
          <label><span>Image URL</span><input required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label>
          <label><span>Alt text</span><input value={alt} onChange={e=>setAlt(e.target.value)} placeholder="Merchant gift card"/></label>
          <button disabled={busy}>{busy?"Saving…":"Add asset"}</button>
        </form>

        <Link className="dk-openeditor" href={`/admin/gift-cards/${selected.id}`}>Open full gift-card editor →</Link>
      </> : <div className="dk-inspectorempty">Select a gift card to manage its media.</div>}
    </aside>
  </div>;
}
