"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function tone(score:number){
  if(score>=90)return "excellent";
  if(score>=80)return "good";
  if(score>=60)return "warn";
  return "bad";
}

export default function ReadinessTable({items}:{items:any[]}) {
  const [q,setQ]=useState("");
  const [bucket,setBucket]=useState("all");

  const filtered=useMemo(()=>{
    const query=q.toLowerCase().trim();
    return items.filter((x:any)=>{
      const text=`${x.merchantName} ${x.title}`.toLowerCase();
      if(query && !text.includes(query)) return false;
      if(bucket==="ready" && !x.launchReady) return false;
      if(bucket==="90" && x.score<90) return false;
      if(bucket==="80" && (x.score<80 || x.score>=90)) return false;
      if(bucket==="60" && (x.score<60 || x.score>=80)) return false;
      if(bucket==="low" && x.score>=60) return false;
      if(bucket==="media" && x.checks.media) return false;
      if(bucket==="category" && x.checks.category) return false;
      if(bucket==="seo" && x.checks.seo) return false;
      return true;
    });
  },[items,q,bucket]);

  return <section className="dk-editor">
    <div className="dk-readinessbar">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search merchant / gift card…"/>
      <select value={bucket} onChange={e=>setBucket(e.target.value)}>
        <option value="all">All cards</option>
        <option value="ready">Launch ready</option>
        <option value="90">90–100%</option>
        <option value="80">80–89%</option>
        <option value="60">60–79%</option>
        <option value="low">Below 60%</option>
        <option value="media">Missing media</option>
        <option value="category">Missing category</option>
        <option value="seo">Missing SEO</option>
      </select>
      <b>{filtered.length} results</b>
    </div>

    <div className="dk-readinesstable">
      <div className="dk-readinesshead">
        <span>Merchant / Card</span><span>Score</span><span>Launch</span><span>Top issues</span><span/>
      </div>
      {filtered.map((x:any)=><div className="dk-readinessrow" key={x.id}>
        <div><b>{x.merchantName}</b><small>{x.title}</small></div>
        <div className="dk-scorecell">
          <div className={`dk-score ${tone(x.score)}`}><strong>{x.score}</strong><span>%</span></div>
          <div className="dk-scorebar"><i style={{width:`${x.score}%`}}/></div>
        </div>
        <div>{x.launchReady?<span className="dk-ready yes">READY</span>:<span className="dk-ready no">NOT READY</span>}</div>
        <div className="dk-issues">{x.issues.slice(0,3).map((i:string)=><span key={i}>{i}</span>)}{x.issues.length>3&&<em>+{x.issues.length-3}</em>}</div>
        <Link href={`/admin/gift-cards/${x.id}`}>Fix →</Link>
      </div>)}
    </div>
  </section>
}
