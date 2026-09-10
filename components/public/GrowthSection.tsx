import Link from "next/link";

export default function GrowthSection() {
  return (
    <section className="dk20-growth">
      <div className="dk20-shell dk20-growth-grid">
        <div className="dk20-growth-copy">
          <span>Ο ΚΑΤΑΛΟΓΟΣ ΜΕΓΑΛΩΝΕΙ ΚΑΘΕ ΜΕΡΑ</span>
          <h2>Μεγάλα brands, μικρά καταστήματα, όλη η Ελλάδα.</h2>
          <p>
            Το Dorokartes χτίζεται για να γίνει ο πληρέστερος κατάλογος δωροκαρτών:
            online επιλογές, επαληθευμένα φυσικά σημεία και αναζήτηση «κοντά μου»
            σε ένα μέρος.
          </p>
          <Link href="/regions">Δες τις επαληθευμένες περιοχές <b>→</b></Link>
        </div>

        <div className="dk20-growth-visual">
          <div className="dk20-mapblob" />
          <span className="pin p1">●</span>
          <span className="pin p2">●</span>
          <span className="pin p3">●</span>
          <span className="pin p4">●</span>
          <div className="dk20-growth-card one">
            <b>Online επιλογές</b><span>Διαθέσιμες σήμερα</span>
          </div>
          <div className="dk20-growth-card two">
            <b>Φυσικά σημεία</b><span>Μόνο μετά από επαλήθευση</span>
          </div>
        </div>
      </div>
    </section>
  );
}
