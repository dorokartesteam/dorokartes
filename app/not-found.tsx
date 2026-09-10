import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";

export default function NotFound() {
  return (
    <div className="dk-public">
      <PublicHeader />
      <main className="dk29-state">
        <section className="dk29-state-card" aria-labelledby="not-found-title">
          <span className="dk29-state-icon" aria-hidden="true">404</span>
          <h1 id="not-found-title">Αυτή η σελίδα δεν βρέθηκε.</h1>
          <p>Η δωροκάρτα ή η σελίδα που ψάχνεις μπορεί να έχει αλλάξει. Ο πλήρης κατάλογος είναι ένα βήμα μακριά.</p>
          <div className="dk29-state-actions">
            <Link href="/browse">Όλες οι δωροκάρτες</Link>
            <Link href="/">Αρχική σελίδα</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
