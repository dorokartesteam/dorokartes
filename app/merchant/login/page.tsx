import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import MerchantLoginForm from "@/components/merchant/MerchantLoginForm";

export const metadata: Metadata = {
  title: "Merchant Login",
  robots: { index: false, follow: false },
};

export default async function MerchantLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;

  return (
    <main className="dkm-auth-page dkm-v2-auth-page">
      <section className="dkm-auth-shell">
        <div className="dkm-auth-visual">
          <Link href="/" className="dkm-auth-logo">
            <Image src="/brand/dorokartes-mark.png" alt="Dorokartes" width={48} height={48} priority />
            <div><b>Dorokartes</b><small>MERCHANT PORTAL</small></div>
          </Link>

          <div className="dkm-auth-message">
            <span>ΓΙΑ ΣΥΝΕΡΓΑΤΕΣ</span>
            <h1>Η παρουσία του brand σου, σε ένα μέρος.</h1>
            <p>Δωροκάρτες, πραγματικό outbound traffic, προβολή και billing σε ένα καθαρό merchant workspace.</p>
          </div>

          <div className="dkm-auth-points">
            <div><i>✓</i><span>Διαχείριση merchant profile</span></div>
            <div><i>✓</i><span>Πραγματικά click analytics</span></div>
            <div><i>✓</i><span>Stripe subscription billing</span></div>
          </div>
        </div>

        <div className="dkm-auth-card dkm-v2-auth-card">
          <div className="dkm-auth-card-head">
            <span className="dkm-kicker">SECURE ACCESS</span>
            <h2>Σύνδεση στο Merchant Portal</h2>
            <p>Βάλε το επαγγελματικό email που έχει εγκριθεί για την επιχείρησή σου. Θα σου στείλουμε ασφαλές magic link σύνδεσης.</p>
          </div>

          {p.error ? <div className="dkm-alert error">Ο σύνδεσμος δεν είναι πλέον έγκυρος. Ζήτησε νέο link σύνδεσης.</div> : null}

          <MerchantLoginForm />

          <div className="dkm-auth-footer">
            <small>Δεν έχεις ακόμη πρόσβαση;</small>
            <Link href="/register-store">Εκδήλωση ενδιαφέροντος →</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
