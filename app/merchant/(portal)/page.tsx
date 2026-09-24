import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { planLabel } from "@/lib/merchant/plans";

function statusLabel(status: string) {
  if (status === "ACTIVE") return "Ενεργή";
  if (status === "PAST_DUE") return "Χρειάζεται προσοχή";
  if (status === "CANCELED") return "Ακυρωμένη";
  return "Σε αναμονή";
}

export default async function MerchantDashboardPage() {
  const member = await requireMerchantMember();
  const merchantId = member.merchantId;
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [cardCount, activeCards, clicks30, recentCards] = await Promise.all([
    prisma.giftCard.count({ where: { merchantId } }),
    prisma.giftCard.count({ where: { merchantId, status: "ACTIVE" } }),
    prisma.outboundClick.count({ where: { merchantId, clickedAt: { gte: since } } }),
    prisma.giftCard.findMany({
      where: { merchantId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        verificationStatus: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const subscription = member.merchant.subscription;
  const currentPlan = subscription?.plan || "PARTNER";
  const currentStatus = subscription?.status || "PENDING";

  return (
    <div className="dkm-page-stack">
      <section className="dkm-hero dkm-v2-hero">
        <div className="dkm-hero-copy">
          <span className="dkm-eyebrow">MERCHANT DASHBOARD</span>
          <h1>Καλώς ήρθες, {member.name || member.merchant.name}.</h1>
          <p>
            Διαχειρίσου την παρουσία του brand σου στο Dorokartes, παρακολούθησε
            τις δωροκάρτες σου και δες το πραγματικό traffic που στέλνουμε προς την επιχείρησή σου.
          </p>
          <div className="dkm-hero-actions">
            <Link href="/merchant/gift-cards" className="dkm-primary-link">Δες τις δωροκάρτες</Link>
            <Link href="/merchant/analytics" className="dkm-secondary-link">Άνοιξε Analytics</Link>
          </div>
        </div>

        <div className="dkm-plan-card dkm-v2-plan-card">
          <div className="dkm-plan-card-top">
            <small>ΤΡΕΧΟΝ ΠΑΚΕΤΟ</small>
            <span className={`dkm-status-pill ${currentStatus.toLowerCase().replaceAll("_", "-")}`}>
              {statusLabel(currentStatus)}
            </span>
          </div>
          <b>{planLabel(currentPlan)}</b>
          <p>
            {currentStatus === "ACTIVE"
              ? "Η συνδρομή σου είναι ενεργή και το brand σου έχει εμπορική παρουσία στο Dorokartes."
              : "Ολοκλήρωσε την ενεργοποίηση για να ξεκλειδώσεις την πλήρη εμπορική παρουσία."}
          </p>
          <Link href="/merchant/billing">Διαχείριση πακέτου <span>→</span></Link>
        </div>
      </section>

      <section className="dkm-metrics dkm-v2-metrics">
        <article>
          <div className="dkm-metric-icon cards">▣</div>
          <div><small>ΔΩΡΟΚΑΡΤΕΣ</small><b>{cardCount}</b><span>συνολικά προγράμματα</span></div>
        </article>
        <article>
          <div className="dkm-metric-icon active">✓</div>
          <div><small>ACTIVE</small><b>{activeCards}</b><span>ενεργές στο Dorokartes</span></div>
        </article>
        <article>
          <div className="dkm-metric-icon clicks">↗</div>
          <div><small>CLICKS 30 ΗΜΕΡΩΝ</small><b>{clicks30}</b><span>προς τις σελίδες αγοράς</span></div>
        </article>
      </section>

      <section className="dkm-panel dkm-v2-panel">
        <div className="dkm-panel-head">
          <div>
            <small>ΠΡΟΣΦΑΤΕΣ ΕΓΓΡΑΦΕΣ</small>
            <h2>Οι δωροκάρτες σου</h2>
            <p>Τα πιο πρόσφατα προγράμματα που είναι συνδεδεμένα με το brand σου.</p>
          </div>
          <Link href="/merchant/gift-cards" className="dkm-text-action">Δες όλες →</Link>
        </div>

        <div className="dkm-list dkm-card-list">
          {recentCards.length ? recentCards.map((card) => (
            <div className="dkm-list-row" key={card.id}>
              <div className="dkm-list-main">
                <div className="dkm-list-icon">G</div>
                <div>
                  <b>{card.title}</b>
                  <div className="dkm-inline-statuses">
                    <span className={`dkm-mini-pill ${card.status.toLowerCase()}`}>{card.status}</span>
                    <span className="dkm-mini-pill neutral">{card.verificationStatus}</span>
                  </div>
                </div>
              </div>
              <Link href={`/gift-cards/${card.slug}`} target="_blank" className="dkm-row-action">Προβολή ↗</Link>
            </div>
          )) : (
            <div className="dkm-empty dkm-v2-empty">
              <div>▣</div>
              <b>Δεν υπάρχουν ακόμη δωροκάρτες</b>
              <span>Μόλις συνδεθούν προγράμματα με το brand σου θα εμφανιστούν εδώ.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
