"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GiftCardEditor({ card, categories, occasions }: { card:any; categories:any[]; occasions:any[] }) {
  const router = useRouter();
  const [saving,setSaving] = useState(false);
  const [msg,setMsg] = useState("");

  async function save(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setMsg("");
    const fd = new FormData(e.currentTarget);
    const body:any = Object.fromEntries(fd.entries());
    body.featured = fd.get("featured") === "on";
    body.corporateAvailable = fd.get("corporateAvailable") === "on";
    body.personalizationAvailable = fd.get("personalizationAvailable") === "on";

    const res = await fetch(`/api/admin/gift-card/${card.id}`, {
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false); setMsg(res.ok ? "Saved" : json.error || "Save failed");
    if(res.ok) router.refresh();
  }

  async function relation(kind:string,id:string,action:"add"|"remove") {
    const res = await fetch(`/api/admin/gift-card/${card.id}/relation`, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({kind,id,action}),
    });
    if(!res.ok) {
      const j=await res.json(); alert(j.error || "Relation update failed"); return;
    }
    router.refresh();
  }

  const catIds = new Set((card.categories||[]).map((x:any)=>x.categoryId || x.category?.id));
  const occIds = new Set((card.occasions||[]).map((x:any)=>x.occasionId || x.occasion?.id));

  return <div className="dk-cmsstack dk-editor-v41">
    <form className="dk-editor" onSubmit={save}>
      <div className="dk-editor-section-v41">
        <div className="dk-editorheading"><h3>Core program</h3><p>Public title, official destination and publication state.</p></div>
        <div className="dk-formgrid two">
          <label className="full"><span>Title</span><input name="title" defaultValue={card.title || ""}/></label>
          <label className="full important-url"><span>Official Gift Card URL</span><input name="officialUrl" defaultValue={card.officialUrl || ""} placeholder="https://merchant.gr/gift-card"/><small>Specific gift-card purchase/info destination — not the merchant homepage.</small></label>
          <label><span>Status</span><select name="status" defaultValue={card.status}><option>DRAFT</option><option>ACTIVE</option><option>HIDDEN</option><option>EXPIRED</option><option>ARCHIVED</option></select></label>
          <label><span>Verification</span><select name="verificationStatus" defaultValue={card.verificationStatus}><option>DISCOVERED</option><option>PENDING</option><option>VERIFIED</option><option>NEEDS_REVIEW</option><option>EXPIRED</option><option>REJECTED</option></select></label>
        </div>
      </div>

      <div className="dk-editor-section-v41">
        <div className="dk-editorheading"><h3>Content</h3><p>Useful customer-facing information, without pretending Dorokartes is the seller.</p></div>
        <div className="dk-formgrid two">
          <label className="full"><span>Short description</span><textarea name="shortDescription" rows={2} defaultValue={card.shortDescription || ""}/></label>
          <label className="full"><span>Full description</span><textarea name="description" rows={6} defaultValue={card.description || ""}/></label>
          <label><span>Validity months</span><input type="number" min="1" name="validityMonths" defaultValue={card.validityMonths ?? ""}/></label>
          <label><span>Validity text</span><input name="validityText" defaultValue={card.validityText || ""} placeholder="e.g. 12 months from purchase"/></label>
          <label className="full"><span>Terms URL</span><input name="termsUrl" defaultValue={card.termsUrl || ""}/></label>
        </div>
      </div>

      <div className="dk-editor-section-v41">
        <div className="dk-editorheading"><h3>SEO</h3><p>Indexable page title and description for the Dorokartes landing page.</p></div>
        <div className="dk-formgrid two">
          <label className="full"><span>SEO Title</span><input name="seoTitle" defaultValue={card.seoTitle || ""}/></label>
          <label className="full"><span>Meta Description</span><textarea name="metaDescription" rows={3} defaultValue={card.metaDescription || ""}/></label>
        </div>
      </div>

      <div className="dk-switchrow">
        <label><input type="checkbox" name="featured" defaultChecked={!!card.featured}/> Featured</label>
        <label><input type="checkbox" name="corporateAvailable" defaultChecked={!!card.corporateAvailable}/> Corporate available</label>
        <label><input type="checkbox" name="personalizationAvailable" defaultChecked={!!card.personalizationAvailable}/> Personalization</label>
      </div>

      <div className="dk-editorfooter"><span className={msg==="Saved"?"goodtext":"badtext"}>{msg}</span><button className="dk-btn primary" disabled={saving}>{saving?"Saving…":"Save gift card"}</button></div>
    </form>

    <div className="dk-grid2">
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Categories <em>{catIds.size}</em></h3><p>What kind of gift / merchant is this?</p></div>
        <div className="dk-chipgrid">
          {categories.map((x:any)=> {
            const on=catIds.has(x.id);
            return <button type="button" key={x.id} className={`dk-chip ${on?"on":""}`} onClick={()=>relation("category",x.id,on?"remove":"add")}>{on?"✓ ":""}{x.name}</button>
          })}
        </div>
      </section>
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Occasions <em>{occIds.size}</em></h3><p>When / for whom would a visitor choose it?</p></div>
        <div className="dk-chipgrid">
          {occasions.map((x:any)=> {
            const on=occIds.has(x.id);
            return <button type="button" key={x.id} className={`dk-chip ${on?"on":""}`} onClick={()=>relation("occasion",x.id,on?"remove":"add")}>{on?"✓ ":""}{x.name}</button>
          })}
        </div>
      </section>
    </div>
  </div>;
}
