import Link from "next/link";
import { notFound } from "next/navigation";
import { getMerchantCms } from "@/lib/admin/cms";
import MerchantEditor from "@/components/admin/MerchantEditor";
import MerchantDeleteDangerZone from "@/components/admin/MerchantDeleteDangerZone";
import MerchantPortalAdmin from "@/components/admin/MerchantPortalAdmin";
import { Panel, Status } from "@/components/admin/AdminUI";

function host(value?: string | null) {
  if (!value) return "No website";
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return value; }
}

function portalStatus(members: Array<{ status?: string | null }> = []) {
  if (!members.length) return null;
  if (members.some((member) => member.status === "ACTIVE")) return "ACTIVE";
  if (members.some((member) => member.status === "INVITED")) return "INVITED";
  if (members.every((member) => member.status === "SUSPENDED")) return "SUSPENDED";
  return members[0]?.status || "UNKNOWN";
}

function planLabel(plan?: string | null) {
  if (plan === "PREMIUM_BANNER") return "Premium Banner";
  if (plan === "FEATURED") return "Featured";
  if (plan === "PARTNER") return "Partner";
  return "—";
}

export default async function MerchantDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const m=await getMerchantCms(id);
  if(!m) notFound();

  const cards = m.giftCards || [];
  const active = cards.filter((c:any)=>c.status === "ACTIVE").length;
  const verified = cards.filter((c:any)=>c.verificationStatus === "VERIFIED").length;
  const review = cards.filter((c:any)=>c.verificationStatus === "NEEDS_REVIEW").length;
  const portal = portalStatus(m.members || []);

  const members = (m.members || []).map((member:any) => {
    const session = member.sessions?.[0];
    const lastAccess = session?.lastSeenAt || session?.createdAt || null;
    return {
      id: member.id,
      email: member.email,
      name: member.name || null,
      role: member.role,
      status: member.status,
      lastAccess: lastAccess ? new Date(lastAccess).toISOString() : null,
    };
  });

  const subscription = m.subscription ? {
    plan: m.subscription.plan,
    status: m.subscription.status,
    startsAt: m.subscription.startsAt ? new Date(m.subscription.startsAt).toISOString() : null,
    endsAt: m.subscription.endsAt ? new Date(m.subscription.endsAt).toISOString() : null,
    stripeCustomerId: m.subscription.stripeCustomerId || null,
    stripeSubscriptionId: m.subscription.stripeSubscriptionId || null,
    stripePriceId: m.subscription.stripePriceId || null,
  } : null;

  const placements = (m.premiumPlacements || []).map((placement:any) => ({
    id: placement.id,
    status: placement.status,
    startsAt: new Date(placement.startsAt).toISOString(),
    endsAt: new Date(placement.endsAt).toISOString(),
    impressions: placement.impressions || 0,
    clicks: placement.clicks || 0,
  }));

  return <>
    <div className="dk-detailhead dk-detailhead-v41">
      <div><Link href="/admin/merchants">← Merchants</Link><h2>{m.name}</h2><p>{host(m.websiteUrl)} · {m.country || "GR"}</p></div>
      <div className="dk-detail-actions-v41"><Status value={m.status}/>{m.websiteUrl ? <a className="dk-btn" href={m.websiteUrl} target="_blank" rel="noreferrer">Website ↗</a> : null}</div>
    </div>

    <div className="dk-merchant-stats-v41 dk-merchant-stats-commercial">
      <div><strong>{cards.length}</strong><span>Gift cards</span></div>
      <div><strong>{portal || "—"}</strong><span>Portal</span></div>
      <div><strong>{planLabel(m.subscription?.plan)}</strong><span>Plan</span></div>
      <div className={m.subscription?.status === "PAST_DUE" ? "warn" : ""}><strong>{m.subscription?.status || "—"}</strong><span>Subscription</span></div>
    </div>

    <div className="dk-grid2 cms dk-merchant-layout-v41 dk-merchant-commercial-layout">
      <Panel title="Merchant profile" subtitle="Business identity, main website and publication state"><MerchantEditor merchant={m}/></Panel>
      <Panel title="Commercial account" subtitle="Portal access, Stripe state and public plan benefits">
        <MerchantPortalAdmin merchantId={m.id} members={members} subscription={subscription} placements={placements}/>
      </Panel>
    </div>

    <Panel title={`Gift cards (${cards.length})`} subtitle={`${active} active · ${verified} verified · ${review} need review`} className="dk-merchant-giftcards-panel">
      <div className="dk-list dk-merchant-card-list-v41">
        {cards.length ? cards.map((c:any)=><Link className="dk-cardlink" href={`/admin/gift-cards/${c.id}`} key={c.id}>
          <div className="grow"><b>{c.title}</b><small>{host(c.officialUrl)} · {c._count?.categories || 0} categories · {c._count?.occasions || 0} occasions</small></div>
          <div><Status value={c.status}/><Status value={c.verificationStatus}/></div>
        </Link>) : <div className="dk-empty-state">No gift-card program is attached to this merchant yet.</div>}
      </div>
    </Panel>

    <MerchantDeleteDangerZone
      merchantId={m.id}
      merchantName={m.name}
      giftCardCount={cards.length}
    />
  </>;
}
