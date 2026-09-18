import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";

const registrationEmail =
  "mailto:info@dorokartes.gr?subject=" +
  encodeURIComponent("Εγγραφή καταστήματος στο Dorokartes.gr");

export const metadata: Metadata = {
  title: "Εγγραφή καταστήματος",
  description:
    "Πρόσθεσε το κατάστημά σου και τις επίσημες δωροκάρτες του στον κατάλογο του Dorokartes.gr.",
  alternates: { canonical: "/register-store" },
  openGraph: {
    title: "Εγγραφή καταστήματος στο Dorokartes.gr",
    description:
      "Στείλε τα επίσημα στοιχεία του καταστήματος και της δωροκάρτας σου για έλεγχο και καταχώριση.",
    url: "/register-store",
  },
};

export default function RegisterStorePage() {
  return (
    <div className="dk-public">
      <PublicHeader />
      <main className="dk30-register">
        <div className="dk20-shell">
          <section className="dk30-register-hero" aria-labelledby="register-store-title">
            <div className="dk30-register-copy">
              <span className="dk30-register-kicker">ΓΙΑ ΚΑΤΑΣΤΗΜΑΤΑ &amp; BRANDS</span>
              <h1 id="register-store-title">
                Βάλε τη δωροκάρτα σου εκεί που την αναζητούν.
              </h1>
              <p>
                Στείλε μας τα επίσημα στοιχεία του καταστήματος και της
                δωροκάρτας σου. Η ομάδα του Dorokartes.gr ελέγχει κάθε
                καταχώριση πριν δημοσιευτεί στον κατάλογο.
              </p>
              <div className="dk30-register-actions">
                <a className="dk30-register-primary" href={registrationEmail}>
                  Ξεκίνα την εγγραφή <span aria-hidden="true">→</span>
                </a>
                <Link className="dk30-register-secondary" href="/browse">
                  Δες τον κατάλογο
                </Link>
              </div>
              <small>
                Δεν εκδίδουμε ούτε πωλούμε δωροκάρτες. Καταχωρίζουμε μόνο
                στοιχεία που μπορούν να επιβεβαιωθούν από επίσημη πηγή.
              </small>
            </div>

            <aside
              className="dk30-register-panel"
              aria-labelledby="register-details-title"
            >
              <span className="dk30-register-panel-label">
                ΤΙ ΝΑ ΜΑΣ ΣΤΕΙΛΕΙΣ
              </span>
              <h2 id="register-details-title">
                Τα βασικά στοιχεία για γρήγορο έλεγχο
              </h2>
              <ul>
                <li>
                  <span aria-hidden="true">01</span>
                  <p><b>Επωνυμία</b> καταστήματος ή brand</p>
                </li>
                <li>
                  <span aria-hidden="true">02</span>
                  <p><b>Επίσημο website</b> και σύνδεσμο δωροκάρτας</p>
                </li>
                <li>
                  <span aria-hidden="true">03</span>
                  <p><b>Λογότυπο</b> και διαθέσιμες αξίες</p>
                </li>
                <li>
                  <span aria-hidden="true">04</span>
                  <p><b>Περιοχές</b> και στοιχεία επικοινωνίας</p>
                </li>
              </ul>
              <div className="dk30-register-email">
                <span>EMAIL ΕΠΙΚΟΙΝΩΝΙΑΣ</span>
                <a href={registrationEmail}>info@dorokartes.gr</a>
              </div>
            </aside>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
