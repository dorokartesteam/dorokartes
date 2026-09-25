import Link from "next/link";
import { getGrowthEvidenceData } from "@/lib/admin/growth";
import styles from "./growth.module.css";

export const dynamic = "force-dynamic";

function number(value: number) {
  return value.toLocaleString("el-GR");
}

function eur(cents: number) {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function Change({
  value,
  suffix,
}: {
  value: number | null;
  suffix: string;
}) {
  if (value === null) {
    return <span className={`${styles.change} ${styles.up}`}>Νέα δραστηριότητα</span>;
  }
  const cls = value > 0 ? styles.up : value < 0 ? styles.down : styles.flat;
  return (
    <span className={`${styles.change} ${cls}`}>
      {value > 0 ? "+" : ""}
      {value}% vs προηγ. {suffix}
    </span>
  );
}

function PeriodRow({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta: number | null;
}) {
  return (
    <div className={styles.periodRow}>
      <span>{label}</span>
      <b>{number(value)}</b>
      <Change value={delta} suffix={label.toLowerCase()} />
    </div>
  );
}

function QueryList({
  rows,
  empty,
}: {
  rows: { query: string; count: number; zeroResults: number }[];
  empty: string;
}) {
  if (!rows.length) return <div className={styles.empty}>{empty}</div>;
  return (
    <div className={styles.queryList}>
      {rows.map((row, index) => (
        <div className={styles.queryRow} key={`${row.query}-${index}`}>
          <div>
            <b>{row.query}</b>
            <small>
              {row.zeroResults
                ? `${row.zeroResults} zero-result`
                : "Με αποτελέσματα"}
            </small>
          </div>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}

function FunnelStep({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className={styles.funnelStep}>
      <span>{label}</span>
      <b>{number(value)}</b>
      <small>{detail}</small>
    </div>
  );
}

function GscPeriod({
  label,
  period,
}: {
  label: string;
  period:
    | {
        clicks: number;
        impressions: number;
        ctr: number;
        averagePosition: number;
        clickDelta: number | null;
        impressionDelta: number | null;
      }
    | null;
}) {
  if (!period) {
    return (
      <div className={styles.gscPeriod}>
        <strong>{label}</strong>
        <span>—</span>
        <small>Not connected</small>
      </div>
    );
  }

  return (
    <div className={styles.gscPeriod}>
      <strong>{label}</strong>
      <span>{number(period.clicks)} clicks</span>
      <small>
        {number(period.impressions)} impressions · {period.ctr}% CTR · pos.{" "}
        {period.averagePosition}
      </small>
      <Change value={period.clickDelta} suffix={label.toLowerCase()} />
    </div>
  );
}

export default async function GrowthPage() {
  const d = await getGrowthEvidenceData();
  const gsc = d.integrations.searchConsole;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span>GROWTH / SEO EVIDENCE</span>
          <h2>Απόδειξη ανάπτυξης του Dorokartes</h2>
          <p>
            Πραγματικά catalog, traffic, acquisition και revenue signals.
            Outbound clicks δεν παρουσιάζονται ως πωλήσεις και sitemap URLs
            δεν παρουσιάζονται ως Google-indexed pages.
          </p>
        </div>
        <div className={styles.heroActions}>
          <a href="/sitemap.xml" target="_blank" rel="noreferrer">
            Sitemap ↗
          </a>
          <a href="/robots.txt" target="_blank" rel="noreferrer">
            Robots ↗
          </a>
        </div>
      </section>

      <section className={styles.kpis}>
        <article>
          <span>Indexable pages</span>
          <strong>{number(d.catalog.indexablePages)}</strong>
          <small>Current sitemap-eligible footprint</small>
        </article>
        <article>
          <span>Verified cards</span>
          <strong>{number(d.catalog.verifiedCards)}</strong>
          <small>
            {d.catalog.verifiedCoverage}% of {number(d.catalog.activeCards)} active
          </small>
        </article>
        <article>
          <span>Active merchants</span>
          <strong>{number(d.catalog.activeMerchants)}</strong>
          <small>{number(d.catalog.indexableMerchants)} indexable brand pages</small>
        </article>
        <article>
          <span>Paid merchants</span>
          <strong>{number(d.acquisition.paidMerchants)}</strong>
          <small>{number(d.acquisition.activeSubscriptions)} active subscriptions</small>
        </article>
        <article>
          <span>MRR</span>
          <strong>{eur(d.revenue.mrrCents)}</strong>
          <small>ARR {eur(d.revenue.arrCents)}</small>
        </article>
      </section>

      <div className={styles.grid3}>
        <section className={styles.panel}>
          <header>
            <div>
              <span>FIRST-PARTY TRAFFIC</span>
              <h3>Catalog views</h3>
            </div>
          </header>
          <div className={styles.periods}>
            <PeriodRow label="7d" value={d.traffic.views.d7} delta={d.traffic.views.delta7} />
            <PeriodRow label="30d" value={d.traffic.views.d30} delta={d.traffic.views.delta30} />
            <PeriodRow label="90d" value={d.traffic.views.d90} delta={d.traffic.views.delta90} />
          </div>
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <span>OUTBOUND TRAFFIC</span>
              <h3>Merchant clicks</h3>
            </div>
          </header>
          <div className={styles.periods}>
            <PeriodRow label="7d" value={d.traffic.clicks.d7} delta={d.traffic.clicks.delta7} />
            <PeriodRow label="30d" value={d.traffic.clicks.d30} delta={d.traffic.clicks.delta30} />
            <PeriodRow label="90d" value={d.traffic.clicks.d90} delta={d.traffic.clicks.delta90} />
          </div>
          <p className={styles.microNote}>Clicks προς merchant destinations — όχι sales/conversions.</p>
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <span>INTERNAL DEMAND</span>
              <h3>Search events</h3>
            </div>
          </header>
          <div className={styles.periods}>
            <PeriodRow label="7d" value={d.traffic.searches.d7} delta={d.traffic.searches.delta7} />
            <PeriodRow label="30d" value={d.traffic.searches.d30} delta={d.traffic.searches.delta30} />
            <PeriodRow label="90d" value={d.traffic.searches.d90} delta={d.traffic.searches.delta90} />
          </div>
          <p className={styles.microNote}>
            {number(d.traffic.zeroResultSearches)} zero-result / 30d · {d.traffic.zeroResultRate}%
          </p>
        </section>
      </div>

      <section className={styles.panel}>
        <header>
          <div>
            <span>GOOGLE SEARCH CONSOLE</span>
            <h3>Organic search evidence</h3>
          </div>
          <strong className={gsc.connected ? styles.gscConnected : styles.gscDisconnected}>
            {gsc.connected ? "CONNECTED" : "NOT CONNECTED"}
          </strong>
        </header>

        <div className={styles.gscPeriods}>
          <GscPeriod label="7d" period={gsc.periods.d7} />
          <GscPeriod label="30d" period={gsc.periods.d30} />
          <GscPeriod label="90d" period={gsc.periods.d90} />
        </div>

        <div className={styles.gscSummary}>
          <div>
            <span>30d organic clicks</span>
            <b>{gsc.clicks === null ? "—" : number(gsc.clicks)}</b>
          </div>
          <div>
            <span>30d impressions</span>
            <b>{gsc.impressions === null ? "—" : number(gsc.impressions)}</b>
          </div>
          <div>
            <span>30d CTR</span>
            <b>{gsc.ctr === null ? "—" : `${gsc.ctr}%`}</b>
          </div>
          <div>
            <span>30d avg. position</span>
            <b>{gsc.averagePosition === null ? "—" : gsc.averagePosition}</b>
          </div>
        </div>

        <p className={styles.microNote}>
          {gsc.connected
            ? `Property: ${gsc.siteUrl} · data through ${gsc.dataThrough} · ${gsc.lagDays}d reporting lag.`
            : gsc.reason}
        </p>
      </section>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <header>
            <div>
              <span>MERCHANT ACQUISITION</span>
              <h3>Lead → paid funnel</h3>
            </div>
            <Link href="/admin/revenue">Revenue →</Link>
          </header>
          <div className={styles.funnel}>
            <FunnelStep
              label="Leads"
              value={d.acquisition.leadsTotal}
              detail={`${number(d.acquisition.leads30)} new / 30d`}
            />
            <FunnelStep
              label="Approved"
              value={d.acquisition.leadsApproved}
              detail={`${d.acquisition.funnel.leadToApproved}% of leads`}
            />
            <FunnelStep
              label="Portal active"
              value={d.acquisition.portalActiveMerchants}
              detail={`${d.acquisition.funnel.approvedToPortal}% vs approved`}
            />
            <FunnelStep
              label="Paid merchants"
              value={d.acquisition.paidMerchants}
              detail={`${d.acquisition.funnel.portalToPaid}% vs portal active`}
            />
          </div>
          <div className={styles.funnelFooter}>
            <span>Lead → paid</span>
            <b>{d.acquisition.funnel.leadToPaid}%</b>
            <Change value={d.acquisition.leadsChange30} suffix="30d leads" />
          </div>
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <span>PREMIUM INVENTORY</span>
              <h3>Measured placement performance</h3>
            </div>
          </header>
          <div className={styles.premiumGrid}>
            <div><span>Placements</span><b>{number(d.premium.placements)}</b></div>
            <div><span>Impressions</span><b>{number(d.premium.impressions)}</b></div>
            <div><span>Clicks</span><b>{number(d.premium.clicks)}</b></div>
            <div><span>CTR</span><b>{d.premium.impressions ? `${d.premium.ctr}%` : "—"}</b></div>
          </div>
          <p className={styles.microNote}>
            Lifetime counters from PremiumPlacement. Δεν εμφανίζεται date trend επειδή το υπάρχον model δεν κρατά event-level premium history.
          </p>
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <header>
            <div>
              <span>SEO FOOTPRINT</span>
              <h3>Indexable ≠ indexed</h3>
            </div>
            <Link href="/admin/seo">SEO admin →</Link>
          </header>
          <div className={styles.seoGrid}>
            <div>
              <span>Indexable pages</span>
              <b>{number(d.catalog.indexablePages)}</b>
              <small>Matches current sitemap eligibility logic</small>
            </div>
            <div>
              <span>Google indexed pages</span>
              <b>N/A</b>
              <small>Not fabricated from Search Analytics traffic data</small>
            </div>
            <div>
              <span>Category landings</span>
              <b>{number(d.catalog.indexableCategories)}</b>
              <small>Active + sitemap eligible</small>
            </div>
            <div>
              <span>Occasion landings</span>
              <b>{number(d.catalog.indexableOccasions)}</b>
              <small>Ready for indexing + active catalog</small>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <span>MEASUREMENT SOURCES</span>
              <h3>Evidence status</h3>
            </div>
          </header>
          <div className={styles.statusList}>
            <div>
              <i className={styles.ok} />
              <div>
                <b>First-party catalog views</b>
                <small>CatalogViewEvent · Analytics V2</small>
              </div>
              <strong>ACTIVE</strong>
            </div>
            <div>
              <i className={d.integrations.gaConfigured ? styles.ok : styles.warn} />
              <div>
                <b>Google Analytics</b>
                <small>NEXT_PUBLIC_GA_MEASUREMENT_ID</small>
              </div>
              <strong>{d.integrations.gaConfigured ? "CONFIGURED" : "MISSING"}</strong>
            </div>
            <div>
              <i className={gsc.connected ? styles.ok : styles.warn} />
              <div>
                <b>Google Search Console</b>
                <small>{gsc.siteUrl || "Search Analytics API"}</small>
              </div>
              <strong>{gsc.connected ? "LIVE" : "CONFIGURE"}</strong>
            </div>
          </div>
          <p className={styles.note}>
            Search Console organic metrics come only from Google Search Analytics API.
            Site-wide indexed-page totals stay N/A rather than being inferred from clicks or sitemap size.
          </p>
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.panel}>
          <header>
            <div>
              <span>SEARCH DEMAND · 30D</span>
              <h3>Top searches</h3>
            </div>
            <Link href="/admin/analytics">Analytics →</Link>
          </header>
          <QueryList
            rows={d.topQueries}
            empty="Δεν υπάρχουν ακόμη search events στο διάστημα."
          />
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <span>CONTENT OPPORTUNITIES</span>
              <h3>Zero-result searches</h3>
            </div>
            <Link href="/admin/gift-cards">Catalog →</Link>
          </header>
          <QueryList
            rows={d.zeroResultQueries}
            empty="Δεν υπάρχουν zero-result searches στο διάστημα."
          />
        </section>
      </div>

      <footer className={styles.footer}>
        Generated {d.generatedAt.toLocaleString("el-GR")} · Search Console uses
        a configurable reporting lag to avoid treating incomplete recent data
        as a full period.
      </footer>
    </div>
  );
}
