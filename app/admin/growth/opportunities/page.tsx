import Link from "next/link";
import { getSearchConsoleEvidence } from "@/lib/admin/search-console";
import styles from "./opportunities.module.css";

export const dynamic = "force-dynamic";

function number(value: number) {
  return value.toLocaleString("el-GR");
}

function pathOnly(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function label(type: "CTR_OPPORTUNITY" | "POSITION_4_10" | "POSITION_11_20") {
  if (type === "CTR_OPPORTUNITY") return "CTR";
  if (type === "POSITION_4_10") return "POS 4–10";
  return "POS 11–20";
}

export default async function SeoOpportunityActionCenterPage() {
  const gsc = await getSearchConsoleEvidence();

  if (!gsc.connected) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span>SEO OPPORTUNITY ACTION CENTER</span>
            <h2>Search Console is not connected</h2>
            <p>{gsc.reason}</p>
          </div>
          <Link href="/admin/growth">← Growth dashboard</Link>
        </section>
      </div>
    );
  }

  const ctr = gsc.actionRows.filter((row) => row.actionType === "CTR_OPPORTUNITY");
  const pageOne = gsc.actionRows.filter((row) => row.actionType === "POSITION_4_10");
  const nearPageOne = gsc.actionRows.filter((row) => row.actionType === "POSITION_11_20");

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span>SEO OPPORTUNITY ACTION CENTER</span>
          <h2>Πραγματικές οργανικές ευκαιρίες από Search Console</h2>
          <p>
            Δεν χρησιμοποιείται αυθαίρετο SEO score και δεν προβλέπονται clicks.
            Οι γραμμές προκύπτουν μόνο από πραγματικά query + landing-page δεδομένα
            των τελευταίων 30 ημερών.
          </p>
        </div>
        <Link href="/admin/growth">← Growth dashboard</Link>
      </section>

      <section className={styles.summary}>
        <article>
          <span>Actionable rows</span>
          <b>{number(gsc.actionRows.length)}</b>
          <small>30-day query + page evidence</small>
        </article>
        <article>
          <span>CTR opportunities</span>
          <b>{number(ctr.length)}</b>
          <small>Page 1, CTR below 3%</small>
        </article>
        <article>
          <span>Positions 4–10</span>
          <b>{number(pageOne.length)}</b>
          <small>Already on page 1</small>
        </article>
        <article>
          <span>Positions 11–20</span>
          <b>{number(nearPageOne.length)}</b>
          <small>Close to page 1</small>
        </article>
      </section>

      <section className={styles.panel}>
        <header>
          <div>
            <span>30D · QUERY + LANDING PAGE</span>
            <h3>Opportunity queue</h3>
          </div>
          <small>Data through {gsc.dataThrough}</small>
        </header>

        {gsc.actionRows.length ? (
          <div className={styles.table}>
            <div className={styles.head}>
              <span>Signal</span>
              <span>Query / landing page</span>
              <span>Clicks</span>
              <span>Impr.</span>
              <span>CTR</span>
              <span>Pos.</span>
            </div>

            {gsc.actionRows.map((row, index) => (
              <article className={styles.row} key={`${row.query}-${row.page}-${index}`}>
                <div>
                  <strong className={styles.badge}>{label(row.actionType)}</strong>
                </div>
                <div className={styles.subject}>
                  <b>{row.query}</b>
                  <a href={row.page} target="_blank" rel="noreferrer" title={row.page}>
                    {pathOnly(row.page)} ↗
                  </a>
                  <small>
                    <strong>{row.actionLabel}.</strong> {row.rationale}
                  </small>
                </div>
                <b>{number(row.clicks)}</b>
                <b>{number(row.impressions)}</b>
                <b>{row.ctr}%</b>
                <b>{row.averagePosition}</b>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            Δεν υπάρχουν ακόμη query/page rows που να περνούν τα evidence thresholds.
          </div>
        )}

        <footer>
          <p>
            CTR opportunity: ≥10 impressions, position ≤10, CTR &lt;3%.
            Position buckets require ≥10 impressions and positions 4–20.
          </p>
          <p>
            Η λίστα είναι για prioritization και manual review. Δεν υποθέτει ότι κάθε
            query χρειάζεται νέα σελίδα και δεν υπόσχεται συγκεκριμένη αύξηση traffic.
          </p>
        </footer>
      </section>
    </div>
  );
}
