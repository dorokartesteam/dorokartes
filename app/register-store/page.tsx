import type { Metadata } from "next";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import MerchantInterestForm from "@/components/public/MerchantInterestForm";
import { prisma } from "@/lib/prisma";
import styles from "./register-store.module.css";

export const metadata: Metadata = {
  title: "Συνεργασία για επιχειρήσεις",
  description:
    "Συνεργάσου με το Dorokartes. Partner 9,99€/μήνα, Featured 19,99€/μήνα και Premium Banner 39,99€/μήνα.",
  alternates: { canonical: "/register-store" },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Συνεργασία με το Dorokartes για επιχειρήσεις",
    description:
      "Ενεργή εμπορική παρουσία και επιλογές αυξημένης προβολής για brands και καταστήματα με δωροκάρτες.",
    url: "/register-store",
  },
};

const benefits = [
  {
    icon: "◎",
    title: "Στείλε traffic στις δωροκάρτες σου",
    text: "Οι επισκέπτες σε ανακαλύπτουν στο Dorokartes και συνεχίζουν στο επίσημο site σου.",
  },
  {
    icon: "↗",
    title: "Περισσότερη προβολή",
    text: "Με Featured ή Premium εμφανίζεσαι πιο έντονα στα σημεία με μεγαλύτερη εμπορική αξία.",
  },
  {
    icon: "✦",
    title: "Μετρήσιμη παρουσία",
    text: "Βλέπεις βασικά στοιχεία προβολών και clicks για την παρουσία σου στο Dorokartes.",
  },
] as const;

const plans = [
  {
    slug: "partner",
    name: "Partner",
    price: "9,99€",
    description:
      "Η βασική συνεργασία για ενεργή εμπορική παρουσία στο Dorokartes.",
    features: [
      "Ενεργό συνεργαζόμενο προφίλ",
      "Προβολή δωροκαρτών",
      "Direct links προς αγορά",
      "Partner badge",
      "Βασικά impressions & clicks",
    ],
    tag: null,
    premium: false,
  },
  {
    slug: "featured",
    name: "Featured",
    price: "19,99€",
    description:
      "Για brands που θέλουν να εμφανίζονται περισσότερο εκεί που ψάχνει το κοινό.",
    features: [
      "Όλα του Partner",
      "Αυξημένη προβολή σε κατηγορίες",
      "Προτεραιότητα σε περιοχές",
      "Προβολή σε σχετικές περιστάσεις",
      "Featured ένδειξη",
    ],
    tag: "ΠΡΟΤΕΙΝΟΜΕΝΟ",
    premium: false,
  },
  {
    slug: "premium-banner",
    name: "Premium Banner",
    price: "39,99€",
    description:
      "Η μεγάλη βιτρίνα: προβολή στο κεντρικό banner της αρχικής του Dorokartes.",
    features: [
      "Όλα του Featured",
      "Κεντρικό homepage banner",
      "Premium creative / visual",
      "Προβολή σε rotation",
      "Περιορισμένες διαθέσιμες θέσεις",
    ],
    tag: "ΠΕΡΙΟΡΙΣΜΕΝΕΣ ΘΕΣΕΙΣ",
    premium: true,
  },
] as const;

export default async function RegisterStorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const claimSlug = Array.isArray(params.claim) ? params.claim[0] : params.claim;
  const claimMerchant = claimSlug
    ? await prisma.merchant.findFirst({
        where: { slug: claimSlug, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          members: { select: { id: true }, take: 1 },
        },
      })
    : null;

  const claimAvailable = Boolean(claimMerchant && claimMerchant.members.length === 0);

  return (
    <div className={styles.site}>
      <PublicHeader />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.shell}>
            <div className={styles.grid}>
              <div className={styles.copy}>
                <span className={styles.eyebrow}>
                  {claimAvailable ? "ΔΙΕΚΔΙΚΗΣΗ ΕΠΙΧΕΙΡΗΣΗΣ" : "DOROKARTES ΓΙΑ ΕΠΙΧΕΙΡΗΣΕΙΣ"}
                </span>

                <h1>
                  {claimAvailable ? (
                    <>
                      Διεκδίκησε το προφίλ
                      <span> {claimMerchant?.name}.</span>
                    </>
                  ) : (
                    <>
                      Οι δωροκάρτες σου,
                      <span> μπροστά στο σωστό κοινό.</span>
                    </>
                  )}
                </h1>

                <p className={styles.lead}>
                  {claimAvailable
                    ? "Το προφίλ υπάρχει ήδη στον κατάλογο. Συμπλήρωσε τα στοιχεία επικοινωνίας και, μετά τον έλεγχο, θα αποκτήσεις πρόσβαση στο Merchant Portal."
                    : "Η επιχείρησή σου μπορεί ήδη να εμφανίζεται στο Dorokartes. Ως συνεργάτης αποκτάς ενεργή εμπορική παρουσία, δυνατότητες προβολής και direct traffic προς τις δωροκάρτες σου."}
                </p>

                <div className={styles.priceHint}>
                  <b>Πακέτα συνεργασίας από 9,99€/μήνα</b>
                  <span>
                    Χωρίς δέσμευση. Επιλέγεις πακέτο μετά την έγκριση της
                    επιχείρησής σου.
                  </span>
                </div>

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
              </div>

              <div className={styles.formColumn} id="interest-form">
                <MerchantInterestForm
                  initialBusinessName={claimAvailable ? claimMerchant?.name || "" : ""}
                  initialWebsite={claimAvailable ? claimMerchant?.websiteUrl || "" : ""}
                  claimMerchantId={claimAvailable ? claimMerchant?.id || "" : ""}
                />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.pricingSection} aria-labelledby="plans-title">
          <div className={styles.pricingInner}>
            <div className={styles.pricingHead}>
              <span>ΠΑΚΕΤΑ ΣΥΝΕΡΓΑΣΙΑΣ</span>
              <h2 id="plans-title">Διάλεξε πόσο μπροστά θέλεις να βγεις.</h2>
              <p>
                Τρία καθαρά επίπεδα συνεργασίας. Από ενεργή παρουσία μέχρι
                κεντρική προβολή στην αρχική.
              </p>
            </div>

            <div className={styles.planGrid}>
              {plans.map((plan) => (
                <article
                  className={`${styles.planCard} ${
                    plan.tag === "ΠΡΟΤΕΙΝΟΜΕΝΟ" ? styles.planFeatured : ""
                  } ${plan.premium ? styles.planPremium : ""}`}
                  key={plan.slug}
                >
                  <div className={styles.planTop}>
                    <div>
                      {plan.tag ? (
                        <span
                          className={
                            plan.premium
                              ? styles.planBadgePremium
                              : styles.planBadge
                          }
                        >
                          {plan.tag}
                        </span>
                      ) : (
                        <span className={styles.planSpacer}>DOROKARTES</span>
                      )}

                      <h3>{plan.name}</h3>
                    </div>

                    <div className={styles.planPrice}>
                      <b>{plan.price}</b>
                      <span>/ μήνα</span>
                    </div>
                  </div>

                  <p className={styles.planDescription}>{plan.description}</p>

                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <span aria-hidden="true">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <a className={styles.planCta} href="#interest-form">
                    Εκδήλωση ενδιαφέροντος <span aria-hidden="true">→</span>
                  </a>
                </article>
              ))}
            </div>

            <p className={styles.planFootnote}>
              Η εκδήλωση ενδιαφέροντος δεν αποτελεί αγορά ή αυτόματη χρέωση.
              Η ενεργοποίηση γίνεται μετά τον έλεγχο της επιχείρησης.
            </p>
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
                <p>Μας δίνεις τα βασικά στοιχεία και το πακέτο που σε ενδιαφέρει.</p>
              </div>
              <div>
                <i>02</i>
                <b>Ελέγχουμε την επιχείρηση</b>
                <p>Επιβεβαιώνουμε το brand, τις δωροκάρτες και τον τρόπο αγοράς.</p>
              </div>
              <div>
                <i>03</i>
                <b>Επικοινωνούμε μαζί σου</b>
                <p>Οριστικοποιούμε την επιλογή σου και προχωράμε στην ενεργοποίηση.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
