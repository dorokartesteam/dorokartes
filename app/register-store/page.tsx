import type { Metadata } from "next";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import MerchantInterestForm from "@/components/public/MerchantInterestForm";
import styles from "./register-store.module.css";

export const metadata: Metadata = {
  title: "Για επιχειρήσεις | Dorokartes",
  description:
    "Εκδήλωσε ενδιαφέρον για να προστεθεί η επιχείρησή σου στο Dorokartes και να παρουσιάσεις τις δωροκάρτες σου σε νέο κοινό.",
  robots: {
    index: true,
    follow: true,
  },
};

const benefits = [
  {
    icon: "◎",
    title: "Νέα προβολή",
    text: "Παρουσίασε τις δωροκάρτες σου σε ανθρώπους που ψάχνουν ήδη το επόμενο δώρο.",
  },
  {
    icon: "↗",
    title: "Κίνηση προς το κατάστημά σου",
    text: "Το Dorokartes οδηγεί τον επισκέπτη στο επίσημο site ή στη σελίδα αγοράς σου.",
  },
  {
    icon: "✦",
    title: "Premium παρουσία",
    text: "Δυνατότητα για καλύτερη προβολή, προτεινόμενες θέσεις και μελλοντικές merchant υπηρεσίες.",
  },
] as const;

export default function RegisterStorePage() {
  return (
    <div className={styles.site}>
      <PublicHeader />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.shell}>
            <div className={styles.grid}>
              <div className={styles.copy}>
                <span className={styles.eyebrow}>DOROKARTES ΓΙΑ ΕΠΙΧΕΙΡΗΣΕΙΣ</span>

                <h1>
                  Οι δωροκάρτες σου,
                  <span> μπροστά στο σωστό κοινό.</span>
                </h1>

                <p className={styles.lead}>
                  Έχεις επιχείρηση που διαθέτει — ή θέλει να διαθέσει —
                  δωροκάρτες; Εκδήλωσε ενδιαφέρον και θα επικοινωνήσουμε μαζί
                  σου για την παρουσία σου στο Dorokartes.
                </p>

                <div className={styles.benefits}>
                  {benefits.map((benefit) => (
                    <div className={styles.benefit} key={benefit.title}>
                      <div className={styles.benefitIcon} aria-hidden="true">
                        {benefit.icon}
                      </div>
                      <div>
                        <b>{benefit.title}</b>
                        <span>{benefit.text}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.note}>
                  <span aria-hidden="true">✓</span>
                  <p>
                    Η εκδήλωση ενδιαφέροντος δεν σε δεσμεύει σε κάποια
                    συνδρομή ή υπηρεσία.
                  </p>
                </div>
              </div>

              <div className={styles.formColumn}>
                <MerchantInterestForm />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.after}>
          <div className={styles.afterInner}>
            <div>
              <span>ΤΙ ΓΙΝΕΤΑΙ ΜΕΤΑ;</span>
              <h2>Απλή διαδικασία, χωρίς περιττά βήματα.</h2>
            </div>

            <div className={styles.steps}>
              <div>
                <i>01</i>
                <b>Στέλνεις το ενδιαφέρον σου</b>
                <p>Μας δίνεις τα βασικά στοιχεία της επιχείρησης.</p>
              </div>
              <div>
                <i>02</i>
                <b>Ελέγχουμε την επιχείρηση</b>
                <p>Βλέπουμε το brand, τις δωροκάρτες και τον τρόπο αγοράς.</p>
              </div>
              <div>
                <i>03</i>
                <b>Επικοινωνούμε μαζί σου</b>
                <p>Σου παρουσιάζουμε τα επόμενα βήματα και τις επιλογές προβολής.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
