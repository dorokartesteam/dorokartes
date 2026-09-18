"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PublicHeader() {
  const pathname = usePathname();
  const giftCardsActive =
    pathname === "/browse" ||
    pathname.startsWith("/gift-cards/") ||
    pathname.startsWith("/brands/");
  const categoriesActive = pathname.startsWith("/categories");
  const occasionsActive = pathname.startsWith("/occasions");
  const regionsActive = pathname.startsWith("/regions");
  const storeRegistrationActive = pathname === "/register-store";

  return (
    <header className="dk14-header">
      <div className="dk14-shell dk14-header-inner">
        <Link href="/" className="dk14-brand">
          <Image src="/brand/dorokartes-mark.png" alt="Dorokartes" width={44} height={44} priority />
          <div>
            <strong>Dorokartes</strong>
            <span>Όλες οι δωροκάρτες της Ελλάδας</span>
          </div>
        </Link>

        <nav className="dk14-nav" aria-label="Κύρια πλοήγηση">
          <Link className={giftCardsActive ? "active" : ""} aria-current={giftCardsActive ? "page" : undefined} href="/browse">Δωροκάρτες</Link>
          <Link className={categoriesActive ? "active" : ""} aria-current={categoriesActive ? "page" : undefined} href="/categories">Κατηγορίες</Link>
          <Link className={occasionsActive ? "active" : ""} aria-current={occasionsActive ? "page" : undefined} href="/occasions">Περιστάσεις</Link>
          <Link className={regionsActive ? "active" : ""} aria-current={regionsActive ? "page" : undefined} href="/regions">Περιοχές</Link>
        </nav>

        <Link
          className={"dk14-header-cta" + (storeRegistrationActive ? " active" : "")}
          aria-current={storeRegistrationActive ? "page" : undefined}
          href="/register-store"
        >
          Εγγραφή καταστήματος
        </Link>
      </div>
    </header>
  );
}
