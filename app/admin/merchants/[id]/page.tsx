import Link from "next/link";
import { notFound } from "next/navigation";
import { getMerchantCms } from "@/lib/admin/cms";
import MerchantEditor from "@/components/admin/MerchantEditor";
import { Panel, Status } from "@/components/admin/AdminUI";

function host(value?: string | null) {
  if (!value) return "No website";
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return value; }
}

export default async function MerchantDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const m=await getMerchantCms(id);
  if(!m) notFound();

  const cards = m.giftCards || [];
  const active = cards.filter((c:any)=>c.status === "ACTIVE").length;
  const verified = cards.filter((c:any)=>c.verificationStatus === "VERIFIED").length;
  const review = cards.filter((c:any)=>c.verificationStatus === "NEEDS_REVIEW").length;

  return <>
    <div className="dk-detailhead dk-detailhead-v41">
      <div><Link href="/admin/merchants">← Merchants</Link><h2>{m.name}</h2><p>{host(m.websiteUrl)} · {m.country || "GR"}</p></div>
      <div className="dk-detail-actions-v41"><Status value={m.status}/>{m.websiteUrl ? <a className="dk-btn" href={m.websiteUrl} target="_blank" rel="noreferrer">Website ↗</a> : null}</div>
    </div>

    <div className="dk-merchant-stats-v41">
      <div><strong>{cards.length}</strong><span>Gift cards</span></div>
      <div><strong>{active}</strong><span>Active</span></div>
      <div><strong>{verified}</strong><span>Verified</span></div>
      <div className={review ? "warn" : ""}><strong>{review}</strong><span>Needs review</span></div>
    </div>

    <div className="dk-grid2 cms dk-merchant-layout-v41">
      <Panel title="Merchant profile" subtitle="Business identity, main website and publication state"><MerchantEditor merchant={m}/></Panel>
      <Panel title={`Gift cards (${cards.length})`} subtitle="Programs attached to this merchant">
        <div className="dk-list dk-merchant-card-list-v41">
          {cards.length ? cards.map((c:any)=><Link className="dk-cardlink" href={`/admin/gift-cards/${c.id}`} key={c.id}>
            <div className="grow"><b>{c.title}</b><small>{host(c.officialUrl)} · {c._count?.categories || 0} categories · {c._count?.occasions || 0} occasions</small></div>
            <div><Status value={c.status}/><Status value={c.verificationStatus}/></div>
          </Link>) : <div className="dk-empty-state">No gift-card program is attached to this merchant yet.</div>}
        </div>
      </Panel>
    </div>
  </>;
}
