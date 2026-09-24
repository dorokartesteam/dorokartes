import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { MERCHANT_PLAN_DETAILS, planLabel } from "@/lib/merchant/plans";
import { premiumSlotsAvailable } from "@/lib/merchant/stripe-billing";
import MerchantBillingActions, { MerchantBillingPortalButton } from "@/components/merchant/MerchantBillingActions";

type FeatureIconName = "store" | "gift" | "badge" | "analytics" | "layers" | "sparkles" | "map" | "calendar" | "crown" | "banner" | "palette" | "rotate";

const plans = [
  { key: "PARTNER", kicker: "ESSENTIAL", features: [
    { icon: "store", text: "Ενεργή συνεργαζόμενη παρουσία" },
    { icon: "gift", text: "Δωροκάρτες & direct links" },
    { icon: "badge", text: "Partner badge" },
    { icon: "analytics", text: "Βασικά analytics" },
  ] },
  { key: "FEATURED", kicker: "GROWTH", features: [
    { icon: "layers", text: "Όλα του Partner" },
    { icon: "sparkles", text: "Αυξημένη προβολή σε κατηγορίες" },
    { icon: "map", text: "Προτεραιότητα σε περιοχές" },
    { icon: "calendar", text: "Προβολή σε σχετικές περιστάσεις" },
  ] },
  { key: "PREMIUM_BANNER", kicker: "MAXIMUM VISIBILITY", features: [
    { icon: "crown", text: "Όλα του Featured" },
    { icon: "banner", text: "Μεγάλο κεντρικό homepage banner" },
    { icon: "palette", text: "Premium creative" },
    { icon: "rotate", text: "Προβολή σε rotation" },
  ] },
] as const;

export const dynamic = "force-dynamic";

function statusText(status: string) {
  if (status === "ACTIVE") return "ΕΝΕΡΓΗ";
  if (status === "PAST_DUE") return "ΠΡΟΣΟΧΗ";
  if (status === "CANCELED") return "ΑΚΥΡΩΜΕΝΗ";
  return "ΑΝΑΜΟΝΗ";
}

function FeatureIcon({ name }: { name: FeatureIconName }) {
  const c = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "store": return <svg {...c}><path d="M4 10.5V20h16v-9.5"/><path d="M3 4h18l-2 6H5L3 4Z"/><path d="M8 20v-6h8v6"/></svg>;
    case "gift": return <svg {...c}><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8v12M3 12h18"/><path d="M12 8H8.5A2.5 2.5 0 1 1 11 5.5V8ZM12 8h3.5A2.5 2.5 0 1 0 13 5.5V8Z"/></svg>;
    case "badge": return <svg {...c}><path d="M12 3l2.1 2.2 3-.3.7 2.9 2.5 1.6-1.1 2.8 1.1 2.8-2.5 1.6-.7 2.9-3-.3L12 21l-2.1-2.2-3 .3-.7-2.9-2.5-1.6 1.1-2.8-1.1-2.8 2.5-1.6.7-2.9 3 .3L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "analytics": return <svg {...c}><path d="M4 20V10M10 20V4M16 20v-7M22 20V8"/></svg>;
    case "layers": return <svg {...c}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
    case "sparkles": return <svg {...c}><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>;
    case "map": return <svg {...c}><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></svg>;
    case "calendar": return <svg {...c}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m9 15 2 2 4-4"/></svg>;
    case "crown": return <svg {...c}><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z"/><path d="M6 21h12"/></svg>;
    case "banner": return <svg {...c}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h10M7 12h6M9 22l3-4 3 4"/></svg>;
    case "palette": return <svg {...c}><path d="M12 3a9 9 0 0 0 0 18h1.2a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="6.8" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>;
    case "rotate": return <svg {...c}><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 7A7 7 0 0 1 18.7 9.5L20 12M4 12l1.3 2.5A7 7 0 0 0 17.9 17"/></svg>;
  }
}

function HeroIcon({ type }: { type: "gift" | "chart" }) {
  const c = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  return type === "gift"
    ? <svg {...c}><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8v12M3 12h18"/><path d="M12 8H8.5A2.5 2.5 0 1 1 11 5.5V8ZM12 8h3.5A2.5 2.5 0 1 0 13 5.5V8Z"/></svg>
    : <svg {...c}><path d="M4 20V10M10 20V4M16 20v-7M22 20V8"/></svg>;
}

export default async function MerchantBillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const member = await requireMerchantMember();
  const p = await searchParams;
  const subscription = await prisma.merchantSubscription.findUnique({ where: { merchantId: member.merchantId } });
  const premiumAvailable = await premiumSlotsAvailable(member.merchantId);
  const currentPlan = subscription?.plan || "PARTNER";
  const status = subscription?.status || "PENDING";
  const stripeManaged = Boolean(subscription?.stripeCustomerId) && (status === "ACTIVE" || status === "PAST_DUE");
  const displayName = member.name || member.merchant.name;

  return (
    <div className="dkm-page-stack dkm4-page-stack dkm4-billing-page">
      <section className="dkm4-hero dkm4-billing-hero">
        <div className="dkm4-hero-glow" />
        <div className="dkm4-hero-copy">
          <span className="dkm4-eyebrow">MERCHANT DASHBOARD</span>
          <h1>Καλώς ήρθες, {displayName}.</h1>
          <p>Διαχειρίσου την παρουσία του brand σου στο Dorokartes, παρακολούθησε τις δωροκάρτες σου και επίλεξε το επίπεδο προβολής που ταιριάζει στην επιχείρησή σου.</p>
          <div className="dkm4-hero-actions">
            <Link href="/merchant/gift-cards" className="dkm4-button dkm4-button-primary"><HeroIcon type="gift" /> Δες τις δωροκάρτες</Link>
            <Link href="/merchant/analytics" className="dkm4-button dkm4-button-ghost"><HeroIcon type="chart" /> Άνοιξε Analytics</Link>
          </div>
        </div>

        <div className="dkm4-current-plan-card">
          <div className="dkm4-current-plan-top">
            <small>ΤΡΕΧΟΝ ΠΑΚΕΤΟ</small>
            <span className={`dkm4-status-pill ${status.toLowerCase().replaceAll("_", "-")}`}><i /> {statusText(status)}</span>
          </div>
          <h2>{planLabel(currentPlan)}</h2>
          <p>{status === "ACTIVE" ? "Η συνδρομή σου είναι ενεργή και το brand σου έχει εμπορική παρουσία στο Dorokartes." : "Επίλεξε πακέτο και ολοκλήρωσε την ενεργοποίηση μέσω Stripe."}</p>
          <div className="dkm4-plan-divider" />
          {stripeManaged ? <MerchantBillingPortalButton /> : <span className="dkm4-plan-hint">Η διαχείριση Stripe ενεργοποιείται μετά την πληρωμή.</span>}
        </div>
      </section>

      {p.canceled ? <div className="dkm-billing-notice">Το Stripe Checkout ακυρώθηκε. Δεν έγινε χρέωση.</div> : null}

      <section className="dkm4-pricing-heading">
        <div>
          <h2>Επίλεξε το κατάλληλο πακέτο για την επιχείρησή σου</h2>
          <p>Αναβάθμισε την παρουσία σου στο Dorokartes και προσέγγισε περισσότερους πελάτες.</p>
        </div>
        <span className="dkm4-stripe-secure">🔒 Ασφαλείς πληρωμές μέσω <b>stripe</b></span>
      </section>

      <section className="dkm-pricing dkm-v2-pricing dkm-pricing-icons dkm4-pricing">
        {plans.map((plan) => {
          const details = MERCHANT_PLAN_DETAILS[plan.key];
          const premium = plan.key === "PREMIUM_BANNER";
          const current = currentPlan === plan.key;

          return (
            <article className={`${premium ? "premium" : ""} ${current ? "is-current" : ""}`} key={plan.key}>
              <div className="dkm4-plan-topline">
                <small>{plan.kicker}</small>
                {current ? <span className="dkm4-current-badge">♛ ΤΡΕΧΟΝ ΠΑΚΕΤΟ</span> : null}
              </div>

              <h2>{details.label}</h2>
              <div className="dkm4-price"><b>{details.price}</b><span>/ μήνα</span></div>
              <p className="dkm4-plan-description">{details.description}</p>

              {premium ? (
                <div className={`dkm4-premium-capacity ${premiumAvailable <= 1 ? "low" : ""}`}>
                  <span><i /> {premiumAvailable} / 4 θέσεις διαθέσιμες</span>
                  <small>Περιορισμένη διαθεσιμότητα</small>
                </div>
              ) : null}

              <ul className="dkm-plan-feature-list dkm4-feature-list">
                {plan.features.map((feature) => (
                  <li key={feature.text}>
                    <span className="dkm-feature-icon dkm4-feature-icon"><FeatureIcon name={feature.icon} /></span>
                    <span className="dkm-feature-copy dkm4-feature-copy">{feature.text}</span>
                    <span className="dkm4-feature-check">✓</span>
                  </li>
                ))}
              </ul>

              <div className="dkm4-action-wrap">
                <MerchantBillingActions plan={plan.key} currentPlan={currentPlan} subscriptionStatus={status} premiumAvailable={premiumAvailable} />
              </div>
            </article>
          );
        })}
      </section>

      <div className="dkm4-billing-footnote">
        <span>🔒</span>
        <p>Οι πληρωμές και η αποθήκευση κάρτας πραγματοποιούνται από το Stripe. Το Dorokartes δεν αποθηκεύει στοιχεία κάρτας.</p>
        <b>stripe</b>
      </div>
    </div>
  );
}
