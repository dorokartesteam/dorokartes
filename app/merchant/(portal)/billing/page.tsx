import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { MERCHANT_PLAN_DETAILS, planLabel } from "@/lib/merchant/plans";
import { premiumSlotsAvailable } from "@/lib/merchant/stripe-billing";
import MerchantBillingActions, { MerchantBillingPortalButton } from "@/components/merchant/MerchantBillingActions";

const plans = [
  {
    key: "PARTNER",
    kicker: "ESSENTIAL",
    features: [
      "Ενεργή συνεργαζόμενη παρουσία",
      "Δωροκάρτες & direct links",
      "Partner badge",
      "Βασικά analytics",
    ],
  },
  {
    key: "FEATURED",
    kicker: "GROWTH",
    features: [
      "Όλα του Partner",
      "Αυξημένη προβολή σε κατηγορίες",
      "Προτεραιότητα σε περιοχές",
      "Προβολή σε σχετικές περιστάσεις",
    ],
  },
  {
    key: "PREMIUM_BANNER",
    kicker: "MAXIMUM VISIBILITY",
    features: [
      "Όλα του Featured",
      "Μεγάλο κεντρικό homepage banner",
      "Premium creative",
      "Προβολή σε rotation",
    ],
  },
] as const;

export const dynamic = "force-dynamic";

function statusText(status: string) {
  if (status === "ACTIVE") return "Ενεργή συνδρομή";
  if (status === "PAST_DUE") return "Απαιτείται ενέργεια";
  if (status === "CANCELED") return "Ακυρωμένη";
  return "Αναμονή ενεργοποίησης";
}

export default async function MerchantBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const member = await requireMerchantMember();
  const p = await searchParams;

  const subscription = await prisma.merchantSubscription.findUnique({
    where: { merchantId: member.merchantId },
  });

  const premiumAvailable = await premiumSlotsAvailable(member.merchantId);
  const currentPlan = subscription?.plan || "PARTNER";
  const status = subscription?.status || "PENDING";
  const stripeManaged = Boolean(subscription?.stripeCustomerId) && (status === "ACTIVE" || status === "PAST_DUE");

  return (
    <div className="dkm-page-stack">
      <section className="dkm-page-heading">
        <div>
          <span className="dkm-eyebrow">SUBSCRIPTION</span>
          <h1>Πακέτο & Billing</h1>
          <p>Διαχειρίσου τη συνδρομή και το επίπεδο προβολής της επιχείρησής σου στο Dorokartes.</p>
        </div>
        <div className="dkm-secure-badge"><span>✓</span> Secure billing by Stripe</div>
      </section>

      {p.canceled ? <div className="dkm-billing-notice">Το Stripe Checkout ακυρώθηκε. Δεν έγινε χρέωση.</div> : null}

      <section className="dkm-current-subscription-card">
        <div className="dkm-current-subscription-copy">
          <div className="dkm-current-subscription-top">
            <span className="dkm-eyebrow">ΤΡΕΧΟΥΣΑ ΣΥΝΔΡΟΜΗ</span>
            <span className={`dkm-status-pill ${status.toLowerCase().replaceAll("_", "-")}`}>{statusText(status)}</span>
          </div>
          <h2>{planLabel(currentPlan)}</h2>
          <p>
            {status === "ACTIVE"
              ? "Η συνδρομή σου είναι ενεργή και συγχρονίζεται αυτόματα με το Stripe."
              : status === "PAST_DUE"
                ? "Υπάρχει θέμα με την πληρωμή. Άνοιξε το Stripe Portal για να ενημερώσεις τη μέθοδο πληρωμής."
                : "Επίλεξε πακέτο και ολοκλήρωσε την πληρωμή στο ασφαλές Stripe Checkout."}
          </p>
        </div>
        {stripeManaged ? <MerchantBillingPortalButton /> : null}
      </section>

      <section className="dkm-pricing dkm-v2-pricing">
        {plans.map((plan) => {
          const details = MERCHANT_PLAN_DETAILS[plan.key];
          const premium = plan.key === "PREMIUM_BANNER";
          const current = currentPlan === plan.key;

          return (
            <article className={`${premium ? "premium" : ""} ${current ? "is-current" : ""}`} key={plan.key}>
              <div className="dkm-plan-header-row">
                <small>{plan.kicker}</small>
                {current ? <span className="dkm-current-badge">ΤΡΕΧΟΝ</span> : null}
              </div>

              <h2>{details.label}</h2>
              <div className="dkm-price"><b>{details.price}</b><span>/ μήνα</span></div>
              <p>{details.description}</p>

              {premium ? (
                <div className={`dkm-premium-capacity ${premiumAvailable <= 1 ? "low" : ""}`}>
                  <span><i /> {premiumAvailable} / 4 θέσεις διαθέσιμες</span>
                  <small>Περιορισμένη διαθεσιμότητα</small>
                </div>
              ) : null}

              <ul>
                {plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}
              </ul>

              <MerchantBillingActions
                plan={plan.key}
                currentPlan={currentPlan}
                subscriptionStatus={status}
                premiumAvailable={premiumAvailable}
              />
            </article>
          );
        })}
      </section>

      <div className="dkm-info-strip dkm-billing-info">
        <span>🔒</span>
        <p>Οι πληρωμές και η αποθήκευση κάρτας πραγματοποιούνται από το Stripe. Το Dorokartes δεν αποθηκεύει στοιχεία κάρτας.</p>
      </div>
    </div>
  );
}
