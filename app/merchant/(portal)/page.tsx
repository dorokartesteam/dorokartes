import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { planLabel } from "@/lib/merchant/plans";

function statusLabel(status: string) {
  if (status === "ACTIVE") return "ΕΝΕΡΓΗ";
  if (status === "PAST_DUE") return "ΠΡΟΣΟΧΗ";
  if (status === "CANCELED") return "ΑΚΥΡΩΜΕΝΗ";
  return "ΑΝΑΜΟΝΗ";
}

function TinyIcon({ kind }: { kind: "gift" | "chart" | "arrow" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (kind === "gift") {
    return (
      <svg {...common}>
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M12 8v12M3 12h18" />
        <path d="M12 8H8.5A2.5 2.5 0 1 1 11 5.5V8ZM12 8h3.5A2.5 2.5 0 1 0 13 5.5V8Z" />
      </svg>
    );
  }

  if (kind === "chart") {
    return (
      <svg {...common}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20V8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}

type OnboardingStep = {
  title: string;
  text: string;
  done: boolean;
  href: string;
  action: string;
};

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
  const displayName = member.name || member.merchant.name;

  const profileComplete = Boolean(
    member.merchant.websiteUrl?.trim() && member.merchant.logoUrl?.trim(),
  );
  const subscriptionActive = currentStatus === "ACTIVE";

  const onboardingSteps: OnboardingStep[] = [
    {
      title: "Merchant account",
      text: "Η πρόσβασή σου στο Merchant Portal είναι ενεργή.",
      done: member.status === "ACTIVE",
      href: "/merchant",
      action: "Έτοιμο",
    },
    {
      title: "Ολοκλήρωσε το προφίλ",
      text: "Πρόσθεσε website και λογότυπο για ολοκληρωμένη εταιρική παρουσία.",
      done: profileComplete,
      href: "/merchant/profile",
      action: "Άνοιξε προφίλ",
    },
    {
      title: "Έλεγξε τις δωροκάρτες",
      text: "Βεβαιώσου ότι τουλάχιστον μία δωροκάρτα είναι συνδεδεμένη με το brand σου.",
      done: cardCount > 0,
      href: "/merchant/gift-cards",
      action: "Δες δωροκάρτες",
    },
    {
      title: "Ενεργοποίησε πακέτο",
      text: "Επίλεξε Partner, Featured ή Premium για να ενεργοποιηθούν τα εμπορικά benefits.",
      done: subscriptionActive,
      href: "/merchant/billing",
      action: "Δες πακέτα",
    },
  ];

  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const onboardingComplete = completedSteps === onboardingSteps.length;
  const onboardingPercent = Math.round((completedSteps / onboardingSteps.length) * 100);

  return (
    <div className="dkm-page-stack dkm4-page-stack">
      <section className="dkm4-hero">
        <div className="dkm4-hero-glow" />
        <div className="dkm4-hero-copy">
          <span className="dkm4-eyebrow">MERCHANT DASHBOARD</span>
          <h1>Καλώς ήρθες, {displayName}.</h1>
          <p>
            Διαχειρίσου την παρουσία του brand σου στο Dorokartes, παρακολούθησε τις δωροκάρτες σου
            και δες το πραγματικό traffic που στέλνουμε προς την επιχείρησή σου.
          </p>
          <div className="dkm4-hero-actions">
            <Link href="/merchant/gift-cards" className="dkm4-button dkm4-button-primary">
              <TinyIcon kind="gift" /> Δες τις δωροκάρτες
            </Link>
            <Link href="/merchant/analytics" className="dkm4-button dkm4-button-ghost">
              <TinyIcon kind="chart" /> Άνοιξε Analytics
            </Link>
          </div>
        </div>

        <div className="dkm4-current-plan-card">
          <div className="dkm4-current-plan-top">
            <small>ΤΡΕΧΟΝ ΠΑΚΕΤΟ</small>
            <span className={`dkm4-status-pill ${currentStatus.toLowerCase().replaceAll("_", "-")}`}>
              <i /> {statusLabel(currentStatus)}
            </span>
          </div>
          <h2>{planLabel(currentPlan)}</h2>
          <p>
            {subscriptionActive
              ? "Η συνδρομή σου είναι ενεργή και το brand σου έχει εμπορική παρουσία στο Dorokartes."
              : "Ολοκλήρωσε την ενεργοποίηση για να ξεκλειδώσεις την πλήρη εμπορική παρουσία."}
          </p>
          <div className="dkm4-plan-divider" />
          <Link href="/merchant/billing">
            {subscriptionActive ? "Διαχείριση πακέτου" : "Ενεργοποίηση πακέτου"} <TinyIcon kind="arrow" />
          </Link>
        </div>
      </section>

      {!onboardingComplete ? (
        <section className="dkm43-onboarding" aria-labelledby="merchant-onboarding-title">
          <div className="dkm43-onboarding-head">
            <div>
              <span>ΓΡΗΓΟΡΗ ΕΚΚΙΝΗΣΗ</span>
              <h2 id="merchant-onboarding-title">Ολοκλήρωσε το setup της επιχείρησής σου</h2>
              <p>Τέσσερα βήματα μέχρι να είναι πλήρως ενεργή η εμπορική παρουσία σου στο Dorokartes.</p>
            </div>
            <div className="dkm43-progress-copy">
              <b>{completedSteps}/{onboardingSteps.length}</b>
              <span>ολοκληρωμένα</span>
            </div>
          </div>

          <div className="dkm43-progress" aria-label={`Onboarding ${onboardingPercent}%`}>
            <span style={{ width: `${onboardingPercent}%` }} />
          </div>

          <div className="dkm43-onboarding-grid">
            {onboardingSteps.map((step, index) => (
              <article className={step.done ? "is-done" : ""} key={step.title}>
                <div className="dkm43-step-number">{step.done ? "✓" : String(index + 1).padStart(2, "0")}</div>
                <div className="dkm43-step-copy">
                  <b>{step.title}</b>
                  <p>{step.text}</p>
                </div>
                {step.done ? (
                  <span className="dkm43-done-label">ΟΛΟΚΛΗΡΩΘΗΚΕ</span>
                ) : (
                  <Link href={step.href}>{step.action} <TinyIcon kind="arrow" /></Link>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dkm4-metrics">
        <article>
          <span className="dkm4-metric-badge blue">G</span>
          <div><small>ΔΩΡΟΚΑΡΤΕΣ</small><b>{cardCount}</b><p>συνολικά προγράμματα</p></div>
        </article>
        <article>
          <span className="dkm4-metric-badge green">✓</span>
          <div><small>ΕΝΕΡΓΕΣ</small><b>{activeCards}</b><p>δημοσιευμένες στο Dorokartes</p></div>
        </article>
        <article>
          <span className="dkm4-metric-badge violet">↗</span>
          <div><small>CLICKS 30 ΗΜΕΡΩΝ</small><b>{clicks30}</b><p>προς τις σελίδες αγοράς</p></div>
        </article>
      </section>

      <section className="dkm-panel dkm-v2-panel dkm4-panel">
        <div className="dkm-panel-head dkm4-panel-head">
          <div>
            <small>ΠΡΟΣΦΑΤΕΣ ΕΓΓΡΑΦΕΣ</small>
            <h2>Οι δωροκάρτες σου</h2>
            <p>Τα πιο πρόσφατα προγράμματα που είναι συνδεδεμένα με το brand σου.</p>
          </div>
          <Link href="/merchant/gift-cards" className="dkm4-text-link">Δες όλες <TinyIcon kind="arrow" /></Link>
        </div>

        <div className="dkm-list dkm-card-list dkm4-card-list">
          {recentCards.length ? recentCards.map((card) => (
            <div className="dkm-list-row dkm4-list-row" key={card.id}>
              <div className="dkm-list-main">
                <div className="dkm-list-icon dkm4-list-icon">G</div>
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
              <div>▣</div><b>Δεν υπάρχουν ακόμη δωροκάρτες</b><span>Μόλις συνδεθούν προγράμματα με το brand σου θα εμφανιστούν εδώ.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
