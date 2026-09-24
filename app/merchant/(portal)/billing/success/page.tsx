import Link from "next/link";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { syncStripeSubscription } from "@/lib/merchant/stripe-billing";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function MerchantBillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await requireMerchantMember();
  const p = await searchParams;
  const sessionId = typeof p.session_id === "string" ? p.session_id.trim() : "";

  if (!sessionId) redirect("/merchant/billing");

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const sessionMerchantId = session.metadata?.merchantId || session.client_reference_id;

  if (sessionMerchantId !== member.merchantId) redirect("/merchant/billing?error=session-owner");

  let synced = false;
  if (session.status === "complete" && session.mode === "subscription" && session.subscription) {
    const subscription = typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : (session.subscription as Stripe.Subscription);
    await syncStripeSubscription(subscription);
    synced = true;
  }

  return (
    <section className="dkm-panel dkm-v2-panel dkm-success-panel">
      <div className="dkm-payment-success dkm-v2-payment-success">
        <div className="dkm-payment-check">✓</div>
        <small>STRIPE CHECKOUT COMPLETE</small>
        <h1>{synced ? "Η συνδρομή ενεργοποιήθηκε." : "Η πληρωμή καταχωρήθηκε."}</h1>
        <p>
          {synced
            ? "Το Dorokartes επιβεβαίωσε τη συνδρομή σου και το billing status έχει συγχρονιστεί."
            : "Η πληρωμή έχει ολοκληρωθεί και η κατάσταση της συνδρομής συγχρονίζεται μέσω Stripe webhook."}
        </p>
        <div className="dkm-success-actions">
          <Link href="/merchant" className="dkm-primary-link">Πήγαινε στο Dashboard</Link>
          <Link href="/merchant/billing" className="dkm-secondary-link">Επιστροφή στο Billing</Link>
        </div>
      </div>
    </section>
  );
}
