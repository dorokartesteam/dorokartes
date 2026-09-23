import Image from "next/image";
import Link from "next/link";
import HeroSearch from "@/components/public/HeroSearch";

const orbitCards = [
  {
    key: "beauty",
    title: "Ομορφιά",
    subtitle: "ΠΕΡΙΠΟΙΗΣΗ",
    icon: "💄",
  },
  {
    key: "travel",
    title: "Ταξίδια",
    subtitle: "ΑΠΟΔΡΑΣΕΙΣ",
    icon: "✈",
  },
  {
    key: "gaming",
    title: "Gaming",
    subtitle: "ΠΑΙΧΝΙΔΙΑ",
    icon: "🎮",
  },
  {
    key: "home",
    title: "Σπίτι",
    subtitle: "ΔΙΑΚΟΣΜΗΣΗ",
    icon: "⌂",
  },
  {
    key: "dining",
    title: "Εστίαση",
    subtitle: "ΓΕΥΣΕΙΣ",
    icon: "🍴",
  },
  {
    key: "experience",
    title: "Εμπειρίες",
    subtitle: "ΓΙΑ ΚΑΘΕ ΣΤΙΓΜΗ",
    icon: "🎟",
  },
] as const;

const heroCategories = [
  { label: "Αγορές", icon: "👕", href: "/categories/fashion", tone: "pink" },
  {
    label: "Φαγητό & ποτό",
    icon: "🍽",
    href: "/categories/food-delivery",
    tone: "orange",
  },
  {
    label: "Gaming",
    icon: "🎮",
    href: "/categories/technology",
    tone: "blue",
  },
  { label: "Ταξίδια", icon: "✈", href: "/categories/travel", tone: "cyan" },
  {
    label: "Άθληση",
    icon: "🏋",
    href: "/categories/sports",
    tone: "mint",
  },
  {
    label: "Ψυχαγωγία",
    icon: "🎬",
    href: "/categories/experiences",
    tone: "purple",
  },
] as const;

export default function PublicHero({ totalCards }: { totalCards: number }) {
  return (
    <>
      {/* Existing mobile hero remains intentionally separate. */}
      <section className="dk29-mobile-hero" aria-labelledby="mobile-hero-title">
        <div className="dk29-mobile-hero-card">
          <div className="dk29-mobile-kicker">
            <span aria-hidden="true">✦</span>
            {totalCards.toLocaleString("el-GR")} ενεργές δωροκάρτες
          </div>

          <div
            id="mobile-hero-title"
            className="dk29-mobile-title"
            role="heading"
            aria-level={1}
          >
            Το ιδανικό δώρο,
            <br />
            <span>σε μία κάρτα.</span>
          </div>

          <p>
            Βρες την κατάλληλη δωροκάρτα, σύγκρινε επιλογές και συνέχισε
            στον ιστότοπο του εμπόρου.
          </p>

          <HeroSearch />

          <div className="dk29-mobile-quicklinks" aria-label="Γρήγορη εξερεύνηση">
            <Link href="/categories">
              Κατηγορίες <b aria-hidden="true">→</b>
            </Link>
            <Link href="/regions">
              Κοντά μου <b aria-hidden="true">⌖</b>
            </Link>
          </div>

          <div className="dk29-mobile-trust">
            <span>
              <b aria-hidden="true">✓</b> Χωρίς αγορά μέσα από το Dorokartes
            </span>
            <span>
              <b aria-hidden="true">↗</b> Συνέχεια στον έμπορο
            </span>
          </div>
        </div>
      </section>

      <section className="dk35-hero" aria-labelledby="desktop-hero-title">
        <div className="dk35-panel">
          <div className="dk35-stage">
            <div className="dk35-copy">
              <div className="dk35-brandline">
                <div className="dk35-mark">
                  <Image
                    src="/brand/dorokartes-mark.png"
                    alt=""
                    width={58}
                    height={58}
                    priority
                  />
                </div>
                <div>
                  <strong>Dorokartes</strong>
                  <span>ΚΑΤΑΛΟΓΟΣ ΔΩΡΟΚΑΡΤΩΝ</span>
                </div>
              </div>

              <div className="dk35-kicker">ΟΛΕΣ ΟΙ ΔΩΡΟΚΑΡΤΕΣ ΤΗΣ ΕΛΛΑΔΑΣ</div>

              <h1 id="desktop-hero-title">
                Το ιδανικό δώρο,
                <span>σε μία κάρτα.</span>
              </h1>

              <p>
                Βρες δωροκάρτες για κάθε άνθρωπο και κάθε περίσταση.
                Σύγκρινε επιλογές και συνέχισε στο επίσημο site του εμπόρου.
              </p>

              <div className="dk35-search">
                <HeroSearch />
              </div>

              <div className="dk35-benefits">
                <div>
                  <i className="green">⚡</i>
                  <span>
                    <b>Άμεση εύρεση</b>
                    <small>Χωρίς ψάξιμο σε δεκάδες sites</small>
                  </span>
                </div>

                <div>
                  <i className="purple">✓</i>
                  <span>
                    <b>Σύνδεσμοι εμπόρων</b>
                    <small>Η αγορά γίνεται στο site τους</small>
                  </span>
                </div>

                <div>
                  <i className="orange">🎁</i>
                  <span>
                    <b>{totalCards.toLocaleString("el-GR")}+ επιλογές</b>
                    <small>Και συνεχώς προσθέτουμε νέες</small>
                  </span>
                </div>
              </div>
            </div>

            <div className="dk35-art" aria-hidden="true">
              <div className="dk35-orbit orbit-one" />
              <div className="dk35-orbit orbit-two" />

              <div className="dk35-orb orb-a" />
              <div className="dk35-orb orb-b" />
              <div className="dk35-orb orb-c" />
              <div className="dk35-orb orb-d" />
              <div className="dk35-orb orb-e" />

              {orbitCards.map((card) => (
                <div
                  key={card.key}
                  className={`dk35-orbit-card ${card.key}`}
                >
                  <div className="dk35-card-icon">{card.icon}</div>
                  <div>
                    <b>{card.title}</b>
                    <span>{card.subtitle}</span>
                  </div>
                </div>
              ))}

              <div className="dk35-phone">
                <div className="dk35-phone-notch" />

                <div className="dk35-phone-screen">
                  <div className="dk35-phone-head">
                    <div>
                      <Image
                        src="/brand/dorokartes-mark.png"
                        alt=""
                        width={24}
                        height={24}
                      />
                      <b>Dorokartes</b>
                    </div>
                    <span>☰</span>
                  </div>

                  <div className="dk35-phone-search">
                    Αναζήτηση δωροκάρτας...
                    <b>⌕</b>
                  </div>

                  <div className="dk35-phone-banner">
                    <span>Βρες τη δωροκάρτα</span>
                    <b>που ταιριάζει!</b>
                    <em>🎁</em>
                  </div>

                  <div className="dk35-phone-section-title">
                    Δημοφιλείς κατηγορίες
                  </div>

                  <div className="dk35-phone-grid">
                    <div><i>🛍</i><span>Μόδα</span></div>
                    <div><i>🍴</i><span>Εστίαση</span></div>
                    <div><i>🎮</i><span>Gaming</span></div>
                    <div><i>✈</i><span>Ταξίδια</span></div>
                    <div><i>🏋</i><span>Άθληση</span></div>
                    <div><i>🎬</i><span>Ψυχαγωγία</span></div>
                  </div>
                </div>
              </div>

              <div className="dk35-gift">
                <div className="dk35-gift-lid" />
                <div className="dk35-gift-body" />
                <div className="dk35-gift-ribbon-v" />
                <div className="dk35-gift-ribbon-h" />
                <div className="dk35-bow left" />
                <div className="dk35-bow right" />
              </div>

              <div className="dk35-note">
                Περισσότερες επιλογές
                <br />
                για κάθε στιγμή
                <b>↙</b>
              </div>
            </div>
          </div>

          <div className="dk35-category-strip">
            {heroCategories.map((category) => (
              <Link
                key={category.label}
                href={category.href}
                className="dk35-category-link"
              >
                <span
                  className={`dk35-category-icon ${category.tone}`}
                  aria-hidden="true"
                >
                  {category.icon}
                </span>
                <b>{category.label}</b>
              </Link>
            ))}

            <Link href="/categories" className="dk35-category-link more">
              <span className="dk35-category-icon more-icon" aria-hidden="true">
                +
              </span>
              <b>Περισσότερα</b>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
