import Link from "next/link";
import { notFound } from "next/navigation";
import { getGiftCardCms, getTaxonomyOptions } from "@/lib/admin/cms";
import GiftCardEditor from "@/components/admin/GiftCardEditor";
import VariantManager from "@/components/admin/VariantManager";
import MediaManager from "@/components/admin/MediaManager";
import VerificationActions from "@/components/admin/VerificationActions";
import { Panel, Status } from "@/components/admin/AdminUI";

function fmt(value?: Date | string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("el-GR");
}

function displayUrl(value?: string | null) {
  if (!value) return "Not set";
  try {
    const u = new URL(value);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return value;
  }
}

function readiness(card: any) {
  const checks = [
    ["Official URL", !!card.officialUrl],
    ["Description", !!(card.shortDescription || card.description)],
    ["Category", (card.categories?.length || 0) > 0],
    ["Occasion", (card.occasions?.length || 0) > 0],
    ["SEO", !!(card.seoTitle && card.metaDescription)],
  ] as const;
  const passed = checks.filter(([, ok]) => ok).length;
  return { checks, passed, pct: Math.round((passed / checks.length) * 100) };
}

export default async function GiftCardDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [card, tax] = await Promise.all([getGiftCardCms(id), getTaxonomyOptions()]);
  if (!card) notFound();

  const ready = readiness(card);

  return <>
    <div className="dk-detailhead dk-detailhead-v41">
      <div>
        <Link href="/admin/gift-cards">← Gift Cards</Link>
        <h2>{card.merchant?.name}</h2>
        <p>{card.title}</p>
      </div>
      <div className="dk-detail-actions-v41">
        <div className="dk-statusstack"><Status value={card.status}/><Status value={card.verificationStatus}/></div>
        <VerificationActions
          cardId={card.id}
          officialUrl={card.officialUrl}
          verificationStatus={card.verificationStatus}
        />
      </div>
    </div>

    <div className="dk-url-compare-v41">
      <section>
        <span>MERCHANT WEBSITE</span>
        <b>{displayUrl(card.merchant?.websiteUrl)}</b>
        <p>General company / store website. This is not the public gift-card redirect.</p>
        {card.merchant?.websiteUrl ? <a href={card.merchant.websiteUrl} target="_blank" rel="noreferrer">Open merchant website ↗</a> : <em>Missing merchant website</em>}
      </section>
      <div className="dk-url-arrow-v41">→</div>
      <section className="primary">
        <span>OFFICIAL GIFT CARD URL</span>
        <b>{displayUrl(card.officialUrl)}</b>
        <p>This is the destination Dorokartes should send the visitor to.</p>
        {card.officialUrl ? <a href={card.officialUrl} target="_blank" rel="noreferrer">Inspect official destination ↗</a> : <em>Official URL required</em>}
      </section>
    </div>

    <div className="dk-card-health-v41">
      <div className="score"><strong>{ready.pct}%</strong><span>content readiness</span></div>
      <div className="checks">
        {ready.checks.map(([label, ok]) => <span className={ok ? "ok" : "missing"} key={label}>{ok ? "✓" : "○"} {label}</span>)}
      </div>
      <div className="dates">
        <span>Last verified <b>{fmt(card.lastVerifiedAt)}</b></span>
        <span>Next review <b>{fmt(card.nextReviewAt)}</b></span>
      </div>
    </div>

    <GiftCardEditor card={card} categories={tax.categories} occasions={tax.occasions}/>
    <VariantManager cardId={card.id} variants={card.variants || []}/>
    <MediaManager cardId={card.id} media={card.mediaAssets || []}/>

    <div className="dk-grid2 cms">
      <Panel title={`Sources (${card.sources?.length || 0})`} subtitle="Discovery / evidence records attached to this program">
        <div className="dk-audit-list-v41">
          {(card.sources || []).length ? (card.sources || []).map((s: any) => <div key={s.id}>
            <div><b>{s.sourceName || s.sourceType}</b><small>{s.sourceType} · last seen {fmt(s.lastSeenAt)}</small></div>
            <a href={s.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
          </div>) : <p className="dk-empty-state">No source records attached.</p>}
        </div>
      </Panel>

      <Panel title={`Verification history (${card.verificationEvents?.length || 0})`} subtitle="Latest manual / automated verification events">
        <div className="dk-audit-list-v41">
          {(card.verificationEvents || []).length ? (card.verificationEvents || []).map((v: any) => <div key={v.id}>
            <div><b>{v.result}</b><small>{fmt(v.checkedAt)}{v.notes ? ` · ${v.notes}` : ""}</small></div>
            {v.url ? <a href={v.url} target="_blank" rel="noreferrer">URL ↗</a> : null}
          </div>) : <p className="dk-empty-state">No verification events yet.</p>}
        </div>
      </Panel>
    </div>

    {(card.reviewFlags?.length || 0) > 0 && <Panel title={`Review flags (${card.reviewFlags.length})`} subtitle="Production changes that still need a human decision">
      <div className="dk-audit-list-v41 flags">
        {card.reviewFlags.map((f: any) => <div key={f.id}>
          <div><b>{f.type} · {f.status}</b><small>{f.reason} · {fmt(f.createdAt)}</small></div>
          <span>{f.newValue || f.oldValue || "—"}</span>
        </div>)}
      </div>
    </Panel>}
  </>;
}
