import type Stripe from "stripe";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { getStripe } from "@/lib/stripe";
import { planLabel } from "@/lib/merchant/plans";
import MerchantRenewalControl from "@/components/merchant/MerchantRenewalControl";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  number: string;
  created: number;
  amount: number;
  currency: string;
  status: Stripe.Invoice.Status | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
};

function formatDate(seconds: number | null | undefined) {
  if (!seconds) return "—";
  return new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(seconds * 1000));
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

function invoiceStatus(status: Stripe.Invoice.Status | null) {
  if (status === "paid") return { label: "Πληρώθηκε", className: "paid" };
  if (status === "open") return { label: "Ανοιχτή", className: "open" };
  if (status === "void") return { label: "Ακυρώθηκε", className: "void" };
  if (status === "uncollectible") return { label: "Ανεξόφλητη", className: "failed" };
  return { label: status || "Άγνωστη", className: "neutral" };
}

export default async function MerchantOrdersPage() {
  const member = await requireMerchantMember();
  const subscription = member.merchant.subscription;

  let invoices: InvoiceRow[] = [];
  let renewalMode: "AUTO" | "MANUAL" = "AUTO";
  let periodEnd: number | null = null;
  let stripeError = false;

  if (subscription?.stripeCustomerId) {
    try {
      const stripe = getStripe();

      const invoiceList = await stripe.invoices.list({
        customer: subscription.stripeCustomerId,
        limit: 50,
      });

      invoices = invoiceList.data.map((invoice) => ({
        id: invoice.id,
        number: invoice.number || invoice.id,
        created: invoice.created,
        amount: invoice.amount_paid > 0 ? invoice.amount_paid : invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
       hostedUrl: invoice.hosted_invoice_url ?? null,
       pdfUrl: invoice.invoice_pdf ?? null,
      }));

      if (subscription.stripeSubscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        renewalMode = stripeSubscription.cancel_at_period_end ? "MANUAL" : "AUTO";

        const raw = stripeSubscription as Stripe.Subscription & { current_period_end?: number };
        const firstItem = stripeSubscription.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number };
        periodEnd = raw.current_period_end ?? firstItem.current_period_end ?? null;
      }
    } catch (error) {
      stripeError = true;
      console.error("Merchant orders Stripe history failed", error);
    }
  }

  const totalPaid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const currency = invoices[0]?.currency || "eur";
  const periodEndLabel = periodEnd ? formatDate(periodEnd) : subscription?.endsAt
    ? new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "short", year: "numeric" }).format(subscription.endsAt)
    : null;

  const renewalDisabledReason = !subscription?.stripeSubscriptionId
    ? "Η επιλογή ανανέωσης ενεργοποιείται μόλις δημιουργηθεί η Stripe συνδρομή."
    : stripeError
      ? "Δεν ήταν δυνατή η σύνδεση με το Stripe αυτή τη στιγμή."
      : null;

  return (
    <div className="dkm41-orders-page">
      <section className="dkm41-orders-head">
        <div>
          <span>ORDERS & BILLING</span>
          <h1>Παραγγελίες</h1>
          <p>Ιστορικό πληρωμών, παραστατικά και τρόπος ανανέωσης της συνδρομής σου.</p>
        </div>
        <a href="/merchant/billing">Διαχείριση πακέτου →</a>
      </section>

      <section className="dkm41-order-stats">
        <article>
          <span>ΤΡΕΧΟΝ ΠΑΚΕΤΟ</span>
          <b>{planLabel(subscription?.plan || "PARTNER")}</b>
          <small>{subscription?.status === "ACTIVE" ? "Ενεργή συνδρομή" : subscription?.status || "PENDING"}</small>
        </article>
        <article>
          <span>ΣΥΝΟΛΙΚΕΣ ΠΛΗΡΩΜΕΣ</span>
          <b>{formatAmount(totalPaid, currency)}</b>
          <small>{invoices.filter((invoice) => invoice.status === "paid").length} ολοκληρωμένες πληρωμές</small>
        </article>
        <article>
          <span>ΕΠΟΜΕΝΗ ΑΝΑΝΕΩΣΗ</span>
          <b>{periodEndLabel || "—"}</b>
          <small>{renewalMode === "AUTO" ? "Αυτόματη ανανέωση" : "Χειροκίνητη ανανέωση"}</small>
        </article>
      </section>

      <section className="dkm41-renewal-card">
        <div className="dkm41-section-heading">
          <div>
            <span>RENEWAL</span>
            <h2>Τρόπος ανανέωσης</h2>
          </div>
          <p>Μπορείς να αλλάξεις τη ρύθμιση μέχρι τη λήξη της τρέχουσας περιόδου.</p>
        </div>

        <MerchantRenewalControl
          initialMode={renewalMode}
          disabledReason={renewalDisabledReason}
          periodEndLabel={periodEndLabel}
        />
      </section>

      <section className="dkm41-history-card">
        <div className="dkm41-section-heading">
          <div>
            <span>PAYMENT HISTORY</span>
            <h2>Ιστορικό πληρωμών</h2>
          </div>
          <p>Τα στοιχεία προέρχονται απευθείας από το Stripe.</p>
        </div>

        {stripeError ? (
          <div className="dkm41-empty-state">
            <b>Δεν ήταν δυνατή η φόρτωση του ιστορικού.</b>
            <span>Δοκίμασε ξανά σε λίγο ή έλεγξε τη σύνδεση Stripe.</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="dkm41-empty-state">
            <b>Δεν υπάρχουν ακόμη πληρωμές.</b>
            <span>Οι ολοκληρωμένες συνδρομές και τα παραστατικά θα εμφανίζονται εδώ.</span>
          </div>
        ) : (
          <div className="dkm41-history-table-wrap">
            <table className="dkm41-history-table">
              <thead>
                <tr>
                  <th>Παραγγελία</th>
                  <th>Ημερομηνία</th>
                  <th>Ποσό</th>
                  <th>Κατάσταση</th>
                  <th>Παραστατικό</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const state = invoiceStatus(invoice.status);
                  return (
                    <tr key={invoice.id}>
                      <td><b>{invoice.number}</b><small>{invoice.id}</small></td>
                      <td>{formatDate(invoice.created)}</td>
                      <td><strong>{formatAmount(invoice.amount, invoice.currency)}</strong></td>
                      <td><span className={`dkm41-invoice-status ${state.className}`}>{state.label}</span></td>
                      <td>
                        {invoice.hostedUrl ? <a href={invoice.hostedUrl} target="_blank" rel="noreferrer">Προβολή</a> : null}
                        {invoice.pdfUrl ? <a href={invoice.pdfUrl} target="_blank" rel="noreferrer">PDF</a> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
