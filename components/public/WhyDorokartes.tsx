import Link from "next/link";

export default function WhyDorokartes() {
  return (
    <section className="dk20-discovery">
      <div className="dk20-shell">
        <div className="dk20-section-eyebrow">ΒΡΕΣ ΤΟ ΔΩΡΟ ΟΠΩΣ ΣΕ ΒΟΛΕΥΕΙ</div>
        <div className="dk20-heading-row">
          <div>
            <h2>Από πού θέλεις να ξεκινήσεις;</h2>
            <p>Από όλο τον κατάλογο, ανά περίσταση ή ανά κατηγορία.</p>
          </div>
          <Link href="/browse">Όλος ο κατάλογος <span>→</span></Link>
        </div>

        <div className="dk20-discovery-grid">
          <Link href="/browse" className="dk20-discovery-card dk20-location-card">
            <div className="dk20-card-glow blue" />
            <div className="dk20-iconbox blue">⌕</div>

            <div className="dk20-card-copy">
              <span>ΠΛΗΡΗΣ ΚΑΤΑΛΟΓΟΣ</span>
              <h3>Όλες οι δωροκάρτες σε ένα μέρος</h3>
              <p>Αναζήτησε brand ή λέξη-κλειδί και σύγκρινε τις διαθέσιμες επιλογές πριν συνεχίσεις στον ιστότοπο του εμπόρου.</p>
            </div>

            <div className="dk20-card-link">
              <span>Άνοιξε τον κατάλογο</span><b>→</b>
            </div>
          </Link>

          <Link href="/occasions" className="dk20-discovery-card dk20-occasion-card">
            <div className="dk20-card-glow pink" />
            <div className="dk20-iconbox pink">✦</div>

            <div className="dk20-card-copy">
              <span>ΑΝΑ ΠΕΡΙΣΤΑΣΗ</span>
              <h3>Για ποιον είναι το δώρο;</h3>
              <p>Γενέθλια, γιορτή, επέτειος, νέο μωρό, εταιρικό δώρο και πολλά ακόμη.</p>
            </div>

            <div className="dk20-card-link">
              <span>Δες περιστάσεις</span><b>→</b>
            </div>
          </Link>

          <Link href="/categories" className="dk20-discovery-card dk20-category-card">
            <div className="dk20-card-glow green" />
            <div className="dk20-iconbox green">▦</div>

            <div className="dk20-card-copy">
              <span>ΑΝΑ ΚΑΤΗΓΟΡΙΑ</span>
              <h3>Τι του αρέσει;</h3>
              <p>Μόδα, ομορφιά, gaming, φαγητό, ταξίδια, wellness, τεχνολογία και άλλα.</p>
            </div>

            <div className="dk20-card-link">
              <span>Δες κατηγορίες</span><b>→</b>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
