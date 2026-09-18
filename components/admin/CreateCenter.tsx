"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateCenter({ merchants }: { merchants:any[] }) {
  const router=useRouter();
  const [merchantMsg,setMerchantMsg]=useState("");
  const [cardMsg,setCardMsg]=useState("");

  async function createMerchant(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const res=await fetch("/api/admin/merchant",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(fd.entries()))});
    const j=await res.json();
    if(res.ok){setMerchantMsg("Created"); router.push(`/admin/merchants/${j.row.id}`)}
    else setMerchantMsg(j.error||"Create failed");
  }

  async function createCard(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const res=await fetch("/api/admin/gift-card",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(fd.entries()))});
    const j=await res.json();
    if(res.ok){setCardMsg("Created"); router.push(`/admin/gift-cards/${j.row.id}`)}
    else setCardMsg(j.error||"Create failed");
  }

  return <div className="dk-grid2 cms">
    <section className="dk-editor">
      <div className="dk-editorheading"><h3>New Merchant</h3><p>Create a production merchant manually.</p></div>
      <form onSubmit={createMerchant} className="dk-formgrid">
        <label><span>Name</span><input required name="name"/></label>
        <label><span>Website URL</span><input required name="websiteUrl" placeholder="https://…"/></label>
        <label><span>Country</span><input name="country" defaultValue="GR"/></label>
        <label><span>Status</span><select name="status" defaultValue="ACTIVE"><option>ACTIVE</option><option>NEEDS_REVIEW</option><option>INACTIVE</option></select></label>
        <div className="dk-editorfooter"><span>{merchantMsg}</span><button className="dk-btn primary">Create merchant</button></div>
      </form>
    </section>

    <section className="dk-editor">
      <div className="dk-editorheading"><h3>New Gift Card</h3><p>Create a gift-card program under an existing merchant.</p></div>
      <form onSubmit={createCard} className="dk-formgrid">
        <label><span>Merchant</span><select required name="merchantId" defaultValue=""><option value="" disabled>Select merchant…</option>{merchants.map((m:any)=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
        <label><span>Title</span><input required name="title"/></label>
        <label><span>Official URL</span><input required name="officialUrl" placeholder="https://…"/></label>
        <label><span>Status</span><select name="status" defaultValue="ACTIVE"><option>ACTIVE</option><option>DRAFT</option><option>HIDDEN</option></select></label>
        <label><span>Verification</span><select name="verificationStatus" defaultValue="VERIFIED"><option>VERIFIED</option><option>PENDING</option><option>NEEDS_REVIEW</option></select></label>
        <div className="dk-editorfooter"><span>{cardMsg}</span><button className="dk-btn primary">Create gift card</button></div>
      </form>
    </section>
  </div>
}
