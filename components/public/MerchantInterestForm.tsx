"use client";

import { FormEvent, useState } from "react";
import styles from "./MerchantInterestForm.module.css";

type SubmitState =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success"; plan: string }
  | { type: "error"; message: string };

const regions = [
  "Αττική",
  "Κεντρική Μακεδονία",
  "Δυτική Μακεδονία",
  "Ανατολική Μακεδονία και Θράκη",
  "Ήπειρος",
  "Θεσσαλία",
  "Ιόνια Νησιά",
  "Δυτική Ελλάδα",
  "Στερεά Ελλάδα",
  "Πελοπόννησος",
  "Βόρειο Αιγαίο",
  "Νότιο Αιγαίο",
  "Κρήτη",
] as const;

const categories = [
  "Μόδα & Αγορές",
  "Ομορφιά & Περιποίηση",
  "Εστίαση & Delivery",
  "Gaming & Τεχνολογία",
  "Ταξίδια & Φιλοξενία",
  "Άθληση & Fitness",
  "Ψυχαγωγία & Εμπειρίες",
  "Σπίτι & Διακόσμηση",
  "Βιβλία & Εκπαίδευση",
  "Υγεία & Ευεξία",
  "Άλλο",
] as const;

const packageLabels: Record<string, string> = {
  undecided: "Δεν έχω αποφασίσει ακόμη",
  partner: "Partner — 9,99€/μήνα",
  featured: "Featured — 19,99€/μήνα",
  premium: "Premium Banner — 39,99€/μήνα",
};

function valueOf(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function buildMailto(form: FormData) {
  const businessName = valueOf(form, "businessName");
  const contactName = valueOf(form, "contactName");
  const email = valueOf(form, "email");
  const phone = valueOf(form, "phone");
  const website = valueOf(form, "website");
  const businessType = valueOf(form, "businessType");
  const region = valueOf(form, "region");
  const category = valueOf(form, "category");
  const giftCardStatus = valueOf(form, "giftCardStatus");
  const giftCardUrl = valueOf(form, "giftCardUrl");
  const plan = valueOf(form, "plan");
  const message = valueOf(form, "message");

  const subject = `Εκδήλωση ενδιαφέροντος Dorokartes — ${businessName}`;

  const body = [
    `Επιχείρηση: ${businessName}`,
    `Υπεύθυνος επικοινωνίας: ${contactName}`,
    `Email: ${email}`,
    `Τηλέφωνο: ${phone}`,
    `Website: ${website || "-"}`,
    `Τύπος επιχείρησης: ${businessType}`,
    `Περιφέρεια: ${region || "-"}`,
    `Κατηγορία: ${category}`,
    `Δωροκάρτες: ${giftCardStatus}`,
    `URL δωροκάρτας: ${giftCardUrl || "-"}`,
    `Πακέτο ενδιαφέροντος: ${packageLabels[plan] || plan || "-"}`,
    "",
    "Μήνυμα:",
    message || "-",
  ].join("\n");

  return `mailto:info@dorokartes.gr?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export default function MerchantInterestForm() {
  const [state, setState] = useState<SubmitState>({ type: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    if (valueOf(form, "website2")) {
      return;
    }

    const selectedPlan = valueOf(form, "plan");
    setState({ type: "sending" });

    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/register-store", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        formElement.reset();
        setState({
          type: "success",
          plan: packageLabels[selectedPlan] || "Θα αποφασιστεί μετά την επικοινωνία",
        });
        return;
      }

      if (response.status === 503) {
        window.location.href = buildMailto(form);
        setState({ type: "idle" });
        return;
      }

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      setState({
        type: "error",
        message:
          data?.error ||
          "Δεν ήταν δυνατή η αποστολή. Δοκίμασε ξανά σε λίγο.",
      });
    } catch {
      window.location.href = buildMailto(form);
      setState({ type: "idle" });
    }
  }

  if (state.type === "success") {
    return (
      <div className={styles.success}>
        <div className={styles.successIcon}>✓</div>
        <span>ΤΟ ΛΑΒΑΜΕ</span>
        <h2>Ευχαριστούμε για το ενδιαφέρον σου.</h2>
        <p>
          Τα στοιχεία σου καταχωρήθηκαν. Θα ελέγξουμε την επιχείρηση και θα
          επικοινωνήσουμε μαζί σου για την ενεργοποίηση της συνεργασίας.
        </p>

        <div className={styles.successPlan}>
          <small>ΕΠΙΛΟΓΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ</small>
          <b>{state.plan}</b>
        </div>

        <button type="button" onClick={() => setState({ type: "idle" })}>
          Νέα εκδήλωση ενδιαφέροντος
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span>ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ</span>
        <h2>Πες μας λίγα για την επιχείρησή σου.</h2>
        <p>Χρειάζονται περίπου 2 λεπτά.</p>
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.hiddenTrap} aria-hidden="true">
          <label>
            Website
            <input name="website2" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className={styles.two}>
          <label>
            <span>Επωνυμία επιχείρησης *</span>
            <input
              name="businessName"
              required
              maxLength={120}
              placeholder="π.χ. Example Store"
            />
          </label>

          <label>
            <span>Ονοματεπώνυμο *</span>
            <input
              name="contactName"
              required
              maxLength={120}
              autoComplete="name"
              placeholder="Υπεύθυνος επικοινωνίας"
            />
          </label>
        </div>

        <div className={styles.two}>
          <label>
            <span>Επαγγελματικό email *</span>
            <input
              name="email"
              type="email"
              required
              maxLength={180}
              autoComplete="email"
              placeholder="name@company.gr"
            />
          </label>

          <label>
            <span>Τηλέφωνο *</span>
            <input
              name="phone"
              type="tel"
              required
              maxLength={40}
              autoComplete="tel"
              placeholder="69... / 21..."
            />
          </label>
        </div>

        <label>
          <span>Website</span>
          <input
            name="website"
            type="url"
            maxLength={240}
            placeholder="https://..."
          />
        </label>

        <div className={styles.two}>
          <label>
            <span>Τύπος επιχείρησης *</span>
            <select name="businessType" required defaultValue="">
              <option value="" disabled>
                Επίλεξε
              </option>
              <option value="Online">Online</option>
              <option value="Φυσικό κατάστημα">Φυσικό κατάστημα</option>
              <option value="Online + φυσικά καταστήματα">
                Online + φυσικά καταστήματα
              </option>
            </select>
          </label>

          <label>
            <span>Περιφέρεια</span>
            <select name="region" defaultValue="">
              <option value="">Πανελλαδικά / Online</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>Κύρια κατηγορία *</span>
          <select name="category" required defaultValue="">
            <option value="" disabled>
              Επίλεξε κατηγορία
            </option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.two}>
          <label>
            <span>Διαθέτεις ήδη δωροκάρτες; *</span>
            <select name="giftCardStatus" required defaultValue="">
              <option value="" disabled>
                Επίλεξε
              </option>
              <option value="Ναι">Ναι</option>
              <option value="Όχι, αλλά μας ενδιαφέρει">
                Όχι, αλλά μας ενδιαφέρει
              </option>
              <option value="Υπό σχεδιασμό">Υπό σχεδιασμό</option>
            </select>
          </label>

          <label>
            <span>URL δωροκάρτας</span>
            <input
              name="giftCardUrl"
              type="url"
              maxLength={300}
              placeholder="https://..."
            />
          </label>
        </div>

        <label className={styles.packageField}>
          <span>Ποιο πακέτο σε ενδιαφέρει περισσότερο;</span>
          <select name="plan" defaultValue="undecided">
            <option value="undecided">Δεν έχω αποφασίσει ακόμη</option>
            <option value="partner">Partner — 9,99€/μήνα</option>
            <option value="featured">Featured — 19,99€/μήνα</option>
            <option value="premium">Premium Banner — 39,99€/μήνα</option>
          </select>
          <small>Προαιρετική επιλογή — δεν αποτελεί αγορά ή χρέωση.</small>
        </label>

        <label>
          <span>Σχόλιο / τι θα ήθελες να συζητήσουμε;</span>
          <textarea
            name="message"
            rows={4}
            maxLength={1600}
            placeholder="Προαιρετικά, γράψε μας λίγες περισσότερες πληροφορίες."
          />
        </label>

        <label className={styles.consent}>
          <input name="consent" type="checkbox" required value="yes" />
          <span>
            Συμφωνώ να επικοινωνήσει μαζί μου η ομάδα του Dorokartes σχετικά
            με την παρούσα εκδήλωση ενδιαφέροντος.
          </span>
        </label>

        {state.type === "error" ? (
          <div className={styles.error}>{state.message}</div>
        ) : null}

        <button
          className={styles.submit}
          type="submit"
          disabled={state.type === "sending"}
        >
          {state.type === "sending" ? (
            "Αποστολή..."
          ) : (
            <>
              Αποστολή ενδιαφέροντος <span aria-hidden="true">→</span>
            </>
          )}
        </button>

        <p className={styles.fallback}>
          Εναλλακτικά: <a href="mailto:info@dorokartes.gr">info@dorokartes.gr</a>
        </p>
      </form>
    </div>
  );
}
