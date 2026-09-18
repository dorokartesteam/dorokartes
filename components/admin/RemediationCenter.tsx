"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const queueOptions = [
  ["priority", "Priority queue"],
  ["almost-ready", "Quick wins"],
  ["critical", "Critical <60%"],
  ["media", "Missing media"],
  ["category", "Missing category"],
  ["occasion", "Missing occasion"],
  ["variant", "Missing variant"],
  ["description", "Missing description"],
  ["seo", "Missing SEO"],
  ["verification", "Needs verification"],
];

function scoreTone(score:number){
  if(score>=90)return "excellent";
  if(score>=80)return "good";
  if(score>=60)return "warn";
  return "bad";
}

export default function RemediationCenter({
  priority,
  queues,
  counts,
}:{
  priority:any[];
  queues:Record<string,any[]>;
  counts:Record<string,number>;
}){
  const [queue,setQueue]=useState("priority");
  const [q,setQ]=useState("");

  const source=queue==="priority" ? priority : (queues[queue] || []);
  const rows=useMemo(()=>{
    const needle=q.trim().toLowerCase();
    if(!needle)return source;
    return source.filter((x:any)=>`${x.merchantName} ${x.title} ${x.issues.join(" ")}`.toLowerCase().includes(needle));
  },[source,q]);

  return <div className="dk-remediation">
    <div className="dk-queuecards">
      <button onClick={()=>setQueue("almost-ready")} className={queue==="almost-ready"?"active":""}>
        <span>QUICK WINS</span><strong>{counts["almost-ready"]||0}</strong><small>70%+ but blocked</small>
      </button>
      <button onClick={()=>setQueue("media")} className={queue==="media"?"active":""}>
        <span>MEDIA</span><strong>{counts.media||0}</strong><small>missing imagery</small>
      </button>
      <button onClick={()=>setQueue("category")} className={queue==="category"?"active":""}>
        <span>CATEGORY</span><strong>{counts.category||0}</strong><small>taxonomy gap</small>
      </button>
      <button onClick={()=>setQueue("seo")} className={queue==="seo"?"active":""}>
        <span>SEO</span><strong>{counts.seo||0}</strong><small>metadata gap</small>
      </button>
      <button onClick={()=>setQueue("verification")} className={queue==="verification"?"active":""}>
        <span>VERIFY</span><strong>{counts.verification||0}</strong><small>not verified</small>
      </button>
    </div>

    <section className="dk-editor">
      <div className="dk-remtoolbar">
        <div>
          <b>Remediation queue</b>
          <small>Work the highest-impact catalog gaps without hunting manually.</small>
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search queue…"/>
        <select value={queue} onChange={e=>setQueue(e.target.value)}>
          {queueOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}
        </select>
        <span>{rows.length} cards</span>
      </div>

      <div className="dk-remhead">
        <span>Merchant / Gift card</span><span>Score</span><span>Blocking issues</span><span>Action</span>
      </div>

      <div className="dk-remlist">
        {rows.slice(0,500).map((x:any)=><div className="dk-remrow" key={x.id}>
          <div>
            <b>{x.merchantName}</b>
            <small>{x.title}</small>
          </div>

          <div className={`dk-score compact ${scoreTone(x.score)}`}>
            <strong>{x.score}</strong><span>%</span>
          </div>

          <div className="dk-issues">
            {x.issues.slice(0,5).map((issue:string)=><span key={issue}>{issue}</span>)}
            {x.issues.length>5&&<em>+{x.issues.length-5}</em>}
          </div>

          <Link href={`/admin/gift-cards/${x.id}`}>Open →</Link>
        </div>)}
      </div>
    </section>
  </div>;
}
