import Image from "next/image";
import Link from "next/link";
import HeroSearch from "@/components/public/HeroSearch";

const floatingCards = [
  { cls: "amazon", label: "Ομορφιά", sub: "Περιποίηση" },
  { cls: "booking", label: "Ταξίδια", sub: "Αποδράσεις" },
  { cls: "ikea", label: "Σπίτι", sub: "Διακόσμηση" },
  { cls: "playstation", label: "Gaming", sub: "Παιχνίδια" },
  { cls: "spotify", label: "Εστίαση", sub: "Γεύσεις" },
  { cls: "apple", label: "Εμπειρίες", sub: "Για κάθε στιγμή" },
];

export default function PublicHero({ totalCards }: { totalCards: number }) {
  return (
    <>
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
            Το ιδανικό δώρο,<br />
            <span>σε μία κάρτα.</span>
          </div>
          <p>
            Βρες την κατάλληλη δωροκάρτα, σύγκρινε επιλογές και συνέχισε
            στον ιστότοπο του εμπόρου.
          </p>
          <HeroSearch />
          <div className="dk29-mobile-quicklinks" aria-label="Γρήγορη εξερεύνηση">
            <Link href="/categories">Κατηγορίες <b aria-hidden="true">→</b></Link>
            <Link href="/regions">Κοντά μου <b aria-hidden="true">⌖</b></Link>
          </div>
          <div className="dk29-mobile-trust">
            <span><b aria-hidden="true">✓</b> Χωρίς αγορά μέσα από το Dorokartes</span>
            <span><b aria-hidden="true">↗</b> Συνέχεια στον έμπορο</span>
          </div>
        </div>
      </section>

      <section className="dk18-hero">
        <div className="dk18-shell">
          <div className="dk18-hero-card">
          <div className="dk18-grid">
            <div className="dk18-copy">
              <div className="dk18-brandline">
                <div className="dk18-mark">
                  <Image src="/brand/dorokartes-mark.png" alt="" width={58} height={58} priority />
                </div>
                <div>
                  <strong>Dorokartes</strong>
                  <span>ΚΑΤΑΛΟΓΟΣ ΔΩΡΟΚΑΡΤΩΝ</span>
                </div>
              </div>

              <div className="dk18-kicker">ΟΛΕΣ ΟΙ ΔΩΡΟΚΑΡΤΕΣ ΤΗΣ ΕΛΛΑΔΑΣ</div>

              <h1>
                Το ιδανικό δώρο,<br />
                <span>σε μία κάρτα.</span>
              </h1>

              <p>
                Βρες δωροκάρτες για κάθε άνθρωπο και κάθε περίσταση.
                Σύγκρινε επιλογές και συνέχισε στο επίσημο site του εμπόρου.
              </p>

              <div className="dk18-search-wrap">
                <HeroSearch />
              </div>

              <div className="dk18-benefits">
                <div><i className="green">⚡</i><span><b>Άμεση εύρεση</b><small>Χωρίς ψάξιμο σε δεκάδες sites</small></span></div>
                <div><i className="purple">✓</i><span><b>Σύνδεσμοι εμπόρων</b><small>Η αγορά γίνεται στο site τους</small></span></div>
                <div><i className="orange">🎁</i><span><b>{totalCards}+ επιλογές</b><small>Και συνεχώς προσθέτουμε νέες</small></span></div>
              </div>
            </div>

            <div className="dk18-visual" aria-hidden="true">
              <div className="dk18-glow one" />
              <div className="dk18-glow two" />

              {floatingCards.map((card) => (
                <div key={card.cls} className={`dk18-float-card ${card.cls}`}>
                  <b>{card.label}</b>
                  <span>{card.sub}</span>
                </div>
              ))}

              <div className="dk18-phone">
                <div className="dk18-phone-notch" />
                <div className="dk18-phone-screen">
                  <div className="dk18-phone-top">
                    <div className="dk18-phone-brand">
                      <Image src="/brand/dorokartes-mark.png" alt="" width={26} height={26} />
                      <b>Dorokartes</b>
                    </div>
                    <span>☰</span>
                  </div>

                  <div className="dk18-phone-search">Αναζήτηση δωροκάρτας… <b>⌕</b></div>

                  <div className="dk18-phone-banner">
                    <span>Βρες τη δωροκάρτα</span>
                    <b>που ταιριάζει!</b>
                    <div className="dk18-mini-gift">🎁</div>
                  </div>

                  <div className="dk18-phone-section-title">Δημοφιλείς κατηγορίες</div>

                  <div className="dk18-phone-cats">
                    <div><i>🛍</i><span>Ψώνια</span></div>
                    <div><i>🍴</i><span>Εστίαση</span></div>
                    <div><i>🎮</i><span>Gaming</span></div>
                    <div><i>✈</i><span>Ταξίδια</span></div>
                    <div><i>🏋</i><span>Άθληση</span></div>
                    <div><i>🎬</i><span>Ψυχαγωγία</span></div>
                  </div>
                </div>
              </div>

              <div className="dk18-giftbox">
                <div className="dk18-box-lid" />
                <div className="dk18-ribbon-v" />
                <div className="dk18-ribbon-h" />
                <div className="dk18-bow left" />
                <div className="dk18-bow right" />
              </div>

              <div className="dk18-confetti c1">◆</div>
              <div className="dk18-confetti c2">●</div>
              <div className="dk18-confetti c3">◆</div>
              <div className="dk18-confetti c4">●</div>
            </div>
          </div>

          <div className="dk18-bottom-bar">
            <span>🛍 Αγορές</span>
            <span>🍴 Φαγητό & ποτό</span>
            <span>🎮 Gaming</span>
            <span>✈ Ταξίδια</span>
            <span>🏋 Άθληση</span>
            <span>🎬 Ψυχαγωγία</span>
            <Link href="/browse">+ Περισσότερα</Link>
          </div>
          </div>
        </div>
      </section>
    </>
  );
}
