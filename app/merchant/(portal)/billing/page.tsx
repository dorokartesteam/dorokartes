import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { MERCHANT_PLAN_DETAILS, planLabel } from "@/lib/merchant/plans";
import { premiumSlotsAvailable } from "@/lib/merchant/stripe-billing";
import MerchantBillingActions, { MerchantBillingPortalButton } from "@/components/merchant/MerchantBillingActions";

type FeatureIconName =
  | "store"
  | "gift"
  | "badge"
  | "analytics"
  | "layers"
  | "sparkles"
  | "map"
  | "calendar"
  | "crown"
  | "banner"
  | "palette"
  | "rotate";

const plans = [
  {
    key: "PARTNER",
    kicker: "ESSENTIAL",
    features: [
      { icon: "store", text: "Ενεργή συνεργαζόμενη παρουσία" },
      { icon: "gift", text: "Δωροκάρτες & direct links" },
      { icon: "badge", text: "Partner badge" },
      { icon: "analytics", text: "Βασικά analytics" },
    ],
  },
  {
    key: "FEATURED",
    kicker: "GROWTH",
    features: [
      { icon: "layers", text: "Όλα του Partner" },
      { icon: "sparkles", text: "Αυξημένη προβολή σε κατηγορίες" },
      { icon: "map", text: "Προτεραιότητα σε περιοχές" },
      { icon: "calendar", text: "Προβολή σε σχετικές περιστάσεις" },
    ],
  },
  {
    key: "PREMIUM_BANNER",
    kicker: "MAXIMUM VISIBILITY",
    features: [
      { icon: "crown", text: "Όλα του Featured" },
      { icon: "banner", text: "Μεγάλο κεντρικό homepage banner" },
      { icon: "palette", text: "Premium creative" },
      { icon: "rotate", text: "Προβολή σε rotation" },
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

function FeatureIcon({ name }: { name: FeatureIconName }) {
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

  switch (name) {
    case "store":
      return <svg {...common}><path d="M4 10.5V20h16v-9.5"/><path d="M3 4h18l-2 6H5L3 4Z"/><path d="M8 20v-6h8v6"/></svg>;
    case "gift":
      return <svg {...common}><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8v12M3 12h18"/><path d="M12 8H8.5A2.5 2.5 0 1 1 11 5.5V8ZM12 8h3.5A2.5 2.5 0 1 0 13 5.5V8Z"/></svg>;
    case "badge":
      return <svg {...common}><path d="M12 3l2.1 2.2 3-.3.7 2.9 2.5 1.6-1.1 2.8 1.1 2.8-2.5 1.6-.7 2.9-3-.3L12 21l-2.1-2.2-3 .3-.7-2.9-2.5-1.6 1.1-2.8-1.1-2.8 2.5-1.6.7-2.9 3 .3L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "analytics":
      return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20V8"/></svg>;
    case "layers":
      return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
    case "sparkles":
      return <svg {...common}><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="m5 14 .6 1.6 1.6.6-1.6.6L5 18.4l-.6-1.6-1.6-.6 1.6-.6L5 14Z"/></svg>;
    case "map":
      return <svg {...common}><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>;
    case "crown":
      return <svg {...common}><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z"/><path d="M6 21h12"/></svg>;
    case "banner":
      return <svg {...common}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h10M7 12h6M9 22l3-4 3 4"/></svg>;
    case "palette":
      return <svg {...common}><path d="M12 3a9 9 0 0 0 0 18h1.2a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>;
    case "rotate":
      return <svg {...common}><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 7A7 7 0 0 1 18.7 9.5L20 12M4 12l1.3 2.5A7 7 0 0 0 17.9 17"/></svg>;
  }
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

      <section className="dkm-pricing dkm-v2-pricing dkm-pricing-icons">
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

              <ul className="dkm-plan-feature-list">
                {plan.features.map((feature) => (
                  <li key={feature.text}>
                    <span className="dkm-feature-icon"><FeatureIcon name={feature.icon} /></span>
                    <span className="dkm-feature-copy">{feature.text}</span>
                  </li>
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

      <div className="dkm-info-strip dkm-billing-info">
        <span>🔒</span>
        <p>Οι πληρωμές και η αποθήκευση κάρτας πραγματοποιούνται από το Stripe. Το Dorokartes δεν αποθηκεύει στοιχεία κάρτας.</p>
      </div>
    </div>
  );
}
