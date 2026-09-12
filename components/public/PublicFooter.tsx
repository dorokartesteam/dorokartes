import Image from "next/image";
import Link from "next/link";

export default function PublicFooter() {
  return (
    <footer className="dk14-footer">
      <div className="dk14-shell dk14-footer-grid">
        <div className="dk14-footer-brand">
          <div>
            <Image src="/brand/dorokartes-mark.png" alt="" width={44} height={44} />
            <span>
              <b>Dorokartes.gr</b>
              <small>Όλες οι δωροκάρτες της Ελλάδας</small>
            </span>
          </div>
          <p>Ανακάλυψε δωροκάρτες από brands, καταστήματα και εμπειρίες σε όλη την Ελλάδα.</p>
        </div>

        <div className="dk14-footer-col">
          <b>Ανακάλυψη</b>
          <Link href="/browse">Όλες οι δωροκάρτες</Link>
          <Link href="/categories">Κατηγορίες</Link>
          <Link href="/occasions">Περιστάσεις</Link>
          <Link href="/regions">Περιοχές</Link>
        </div>

        <div className="dk14-footer-col dk14-footer-contact" id="contact">
          <b>Επικοινωνία</b>
          <p>Έχεις κατάστημα ή θέλεις να μας στείλεις μία διόρθωση;</p>
          <a className="dk14-footer-email" href="mailto:info@dorokartes.gr">
            info@dorokartes.gr
          </a>
          <Link href="/register-store">
            Εγγραφή καταστήματος <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="dk14-footer-col">
          <b>Σημαντικό</b>
          <p>Το Dorokartes δεν εκδίδει ούτε πωλεί δωροκάρτες. Οι τελικοί όροι και η διαθεσιμότητα επιβεβαιώνονται στον επίσημο έμπορο.</p>
        </div>
      </div>

      <div className="dk14-shell dk14-footer-bottom">
        <span>© {new Date().getFullYear()} Dorokartes.gr</span>
        <span>Ο ελληνικός κατάλογος δωροκαρτών</span>
      </div>
    </footer>
  );
}
