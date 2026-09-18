import Link from "next/link";
import { safeFindMany } from "@/lib/admin/data";
import { PageIntro, Panel, Status } from "@/components/admin/AdminUI";

function host(url?: string | null) {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function normalizeName(name?: string | null) {
  return (name || "").toLowerCase().replace(/[^a-z0-9α-ω]+/gi, "");
}

export default async function DuplicatesPage() {
  const merchants: any[] = await safeFindMany("merchant", {
    take: 5000,
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, slug: true, websiteUrl: true, status: true,
      _count: { select: { giftCards: true } }
    }
  });

  const domainMap = new Map<string, any[]>();
  const nameMap = new Map<string, any[]>();

  for (const m of merchants) {
    const h = host(m.websiteUrl);
    if (h) domainMap.set(h, [...(domainMap.get(h) || []), m]);
    const n = normalizeName(m.name);
    if (n) nameMap.set(n, [...(nameMap.get(n) || []), m]);
  }

  const domainClusters = [...domainMap.entries()].filter(([, rows]) => rows.length > 1);
  const nameClusters = [...nameMap.entries()]
    .filter(([, rows]) => rows.length > 1)
    .filter(([key]) => !domainClusters.some(([, rows]) => rows.some((m: any) => normalizeName(m.name) === key)));

  return <>
    <PageIntro
      title="Duplicate Center"
      text="Potential duplicate merchants surfaced from production data. Nothing is auto-merged here."
    />

    <div className="dk-metricgrid small">
      <div className="dk-metric purple"><div className="dk-metriclabel">Merchants scanned</div><div className="dk-metricvalue">{merchants.length}</div><div className="dk-metricdetail">production rows</div></div>
      <div className="dk-metric warn"><div className="dk-metriclabel">Domain clusters</div><div className="dk-metricvalue">{domainClusters.length}</div><div className="dk-metricdetail">same website host</div></div>
      <div className="dk-metric"><div className="dk-metriclabel">Name clusters</div><div className="dk-metricvalue">{nameClusters.length}</div><div className="dk-metricdetail">same normalized name</div></div>
    </div>

    <div className="dk-grid2">
      <Panel title="Same-domain candidates" subtitle="Highest-confidence duplicate signal">
        {domainClusters.length ? <div className="dk-duplicate-list">
          {domainClusters.slice(0, 50).map(([domain, rows]) => (
            <div className="dk-duplicate-cluster" key={domain}>
              <div className="dk-duplicate-head"><b>{domain}</b><span>{rows.length} records</span></div>
              {rows.map((m: any) => (
                <Link key={m.id} href={`/admin/merchants/${m.id}`}>
                  <div><b>{m.name}</b><small>{m.slug} · {m._count?.giftCards || 0} cards</small></div>
                  <Status value={m.status} />
                </Link>
              ))}
            </div>
          ))}
        </div> : <div className="dk-empty-state">No same-domain duplicate clusters found.</div>}
      </Panel>

      <Panel title="Same-name candidates" subtitle="Needs human inspection before merge">
        {nameClusters.length ? <div className="dk-duplicate-list">
          {nameClusters.slice(0, 50).map(([name, rows]) => (
            <div className="dk-duplicate-cluster" key={name}>
              <div className="dk-duplicate-head"><b>{rows[0]?.name}</b><span>{rows.length} records</span></div>
              {rows.map((m: any) => (
                <Link key={m.id} href={`/admin/merchants/${m.id}`}>
                  <div><b>{host(m.websiteUrl) || "No domain"}</b><small>{m.slug} · {m._count?.giftCards || 0} cards</small></div>
                  <Status value={m.status} />
                </Link>
              ))}
            </div>
          ))}
        </div> : <div className="dk-empty-state">No same-name duplicate clusters found.</div>}
      </Panel>
    </div>

    <div className="dk-admin-note">
      <div><b>Safe merge only</b><span>Review both merchant records first. Use the manual merge workflow only after choosing the canonical merchant.</span></div>
      <Link href="/admin/merge">Open manual merge →</Link>
    </div>
  </>;
}
