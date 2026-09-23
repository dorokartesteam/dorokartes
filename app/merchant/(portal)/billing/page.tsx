import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";
import {
  MERCHANT_PLAN_DETAILS,
  planLabel,
} from "@/lib/merchant/plans";
import { premiumSlotsAvailable } from "@/lib/merchant/stripe-billing";
import MerchantBillingActions, {
  MerchantBillingPortalButton,
} from "@/components/merchant/MerchantBillingActions";

const plans = [
  {
    key: "PARTNER",
    features: [
      "Ενεργή συνεργαζόμενη παρουσία",
      "Δωροκάρτες & direct links",
      "Partner badge",
      "Βασικά analytics",
    ],
  },
  {
    key: "FEATURED",
    features: [
      "Όλα του Partner",
      "Αυξημένη προβολή σε κατηγορίες",
      "Προτεραιότητα σε περιοχές",
      "Προβολή σε σχετικές περιστάσεις",
    ],
  },
  {
    key: "PREMIUM_BANNER",
    features: [
      "Όλα του Featured",
      "Μεγάλο κεντρικό homepage banner",
      "Premium creative",
      "Προβολή σε rotation",
    ],
  },
] as const;

export const dynamic = "force-dynamic";

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
  const stripeManaged =
    Boolean(subscription?.stripeCustomerId) &&
    (status === "ACTIVE" || status === "PAST_DUE");

  return (
    <>
      <section className="dkm-panel">
        <div className="dkm-panel-head">
          <div>
            <small>SUBSCRIPTION</small>
            <h1>Πακέτο & Billing</h1>
          </div>
        </div>

        {p.canceled ? (
          <div className="dkm-billing-notice">
            Το Stripe Checkout ακυρώθηκε. Δεν έγινε χρέωση.
          </div>
        ) : null}

        <div className="dkm-current-plan">
          <small>ΤΡΕΧΟΥΣΑ ΕΠΙΛΟΓΗ</small>
          <b>{planLabel(currentPlan)}</b>
          <span>Status: {status}</span>

          <p>
            {status === "ACTIVE"
              ? "Η συνδρομή σου είναι ενεργή και συγχρονίζεται αυτόματα με το Stripe."
              : status === "PAST_DUE"
                ? "Υπάρχει θέμα με την πληρωμή της συνδρομής. Άνοιξε το Stripe για ενημέρωση μεθόδου πληρωμής."
                : "Επίλεξε πακέτο και ολοκλήρωσε την πληρωμή στο ασφαλές Stripe Checkout."}
          </p>

          {stripeManaged ? <MerchantBillingPortalButton /> : null}
        </div>
      </section>

      <section className="dkm-pricing">
        {plans.map((plan) => {
          const details = MERCHANT_PLAN_DETAILS[plan.key];
          const premium = plan.key === "PREMIUM_BANNER";

          return (
            <article className={premium ? "premium" : ""} key={plan.key}>
              <small>
                {premium
                  ? `${premiumAvailable} / 4 ΘΕΣΕΙΣ ΔΙΑΘΕΣΙΜΕΣ ΤΩΡΑ`
                  : "DOROKARTES"}
              </small>

              <h2>{details.label}</h2>

              <div className="dkm-price">
                <b>{details.price}</b>
                <span>/ μήνα</span>
              </div>

              <p>{details.description}</p>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
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

      <p className="dkm-footnote" style={{ marginTop: 14 }}>
        Οι πληρωμές και η αποθήκευση κάρτας πραγματοποιούνται από το Stripe.
        Το Dorokartes δεν αποθηκεύει στοιχεία κάρτας.
      </p>
    </>
  );
}
