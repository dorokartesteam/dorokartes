"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { planLabel } from "@/lib/merchant/plans";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MerchantAvatar({
  name,
  logoUrl,
  size = "normal",
}: {
  name: string;
  logoUrl: string | null;
  size?: "normal" | "small";
}) {
  const className = size === "small" ? "dkm4-avatar dkm4-avatar-small" : "dkm4-avatar";

  return (
    <div className={className} aria-label={`${name} logo`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${name} logo`} />
      ) : (
        <span>{initials(name) || "D"}</span>
      )}
    </div>
  );
}

type IconName =
  | "home"
  | "profile"
  | "cards"
  | "analytics"
  | "billing"
  | "external"
  | "logout"
  | "menu"
  | "close"
  | "help"
  | "chevron";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.5 9.6V20h13V9.6"/><path d="M9.5 20v-6h5v6"/></>,
    profile: <><circle cx="12" cy="8" r="3.3"/><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6"/></>,
    cards: <><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.3h17"/><path d="M7 15h4"/></>,
    analytics: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/></>,
    billing: <><path d="m12 3 2.2 2.4 3.2-.4.8 3.1 2.7 1.7-1.3 2.9 1.3 2.9-2.7 1.7-.8 3.1-3.2-.4L12 22l-2.2-2.4-3.2.4-.8-3.1-2.7-1.7 1.3-2.9-1.3-2.9 2.7-1.7.8-3.1 3.2.4L12 3Z"/><path d="m9.3 12.3 1.8 1.8 3.8-4"/></>,
    external: <><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M20 13v5.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H11"/></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4"/><path d="M19 12H9"/></>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2-2.4 4"/><path d="M12 17.2h.01"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const navItems: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/merchant", label: "Αρχική", icon: "home" },
  { href: "/merchant/analytics", label: "Στατιστικά", icon: "analytics" },
  { href: "/merchant/gift-cards", label: "Δωροκάρτες", icon: "cards" },
  { href: "/merchant/profile", label: "Προφίλ", icon: "profile" },
  { href: "/merchant/billing", label: "Συνδρομή & Πακέτα", icon: "billing" },
];

function pageTitle(pathname: string) {
  if (pathname.startsWith("/merchant/billing")) return "Συνδρομή & Πακέτα";
  if (pathname.startsWith("/merchant/analytics")) return "Στατιστικά";
  if (pathname.startsWith("/merchant/gift-cards")) return "Δωροκάρτες";
  if (pathname.startsWith("/merchant/profile")) return "Προφίλ";
  return "Αρχική";
}

export default function MerchantShell({
  children,
  merchantName,
  merchantLogoUrl,
  memberName,
  plan,
  status,
}: {
  children: ReactNode;
  merchantName: string;
  merchantLogoUrl: string | null;
  memberName: string;
  plan: string;
  status: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const statusClass = status.toLowerCase().replaceAll("_", "-");

  return (
    <div className="dkm-shell dkm-v2-shell dkm4-shell">
      <button
        type="button"
        className={`dkm-mobile-overlay ${mobileOpen ? "is-visible" : ""}`}
        aria-label="Κλείσιμο μενού"
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`dkm-sidebar dkm4-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="dkm-sidebar-header dkm4-sidebar-header">
          <Link href="/merchant" className="dkm-logo dkm4-logo" onClick={() => setMobileOpen(false)}>
            <span className="dkm4-brand-mark">
              <Image src="/brand/dorokartes-mark.png" alt="Dorokartes" width={42} height={42} priority />
            </span>
            <div>
              <b>Dorokartes</b>
              <small>Merchant Portal</small>
            </div>
          </Link>

          <button type="button" className="dkm-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Κλείσιμο μενού">
            <Icon name="close" />
          </button>
        </div>

        <div className="dkm4-account-card">
          <MerchantAvatar name={merchantName} logoUrl={merchantLogoUrl} />
          <div className="dkm4-account-copy">
            <b>{merchantName}</b>
            <span>{planLabel(plan)} · <i className={`dkm4-mini-dot ${statusClass}`} /> {status === "ACTIVE" ? "Ενεργό" : status}</span>
          </div>
        </div>

        <nav className="dkm-v2-nav dkm4-nav" aria-label="Merchant navigation">
          {navItems.map((item) => {
            const active = item.href === "/merchant" ? pathname === "/merchant" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : undefined} onClick={() => setMobileOpen(false)}>
                <span className="dkm4-nav-icon"><Icon name={item.icon} /></span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dkm4-sidebar-spacer" />

        <div className="dkm4-help-card">
          <span className="dkm4-help-icon"><Icon name="help" /></span>
          <b>Χρειάζεσαι βοήθεια;</b>
          <p>Η ομάδα του Dorokartes είναι εδώ για εσένα.</p>
          <a href="mailto:leads@dorokartes.gr">Επικοινωνία <Icon name="chevron" /></a>
        </div>

        <div className="dkm4-member-row">
          <MerchantAvatar name={memberName} logoUrl={null} size="small" />
          <div>
            <b>{memberName}</b>
            <span>{merchantName}</span>
          </div>
        </div>

        <form action="/api/merchant/logout" method="post" className="dkm4-logout-form">
          <button type="submit"><Icon name="logout" /> <span>Αποσύνδεση</span></button>
        </form>
      </aside>

      <main className="dkm-main dkm4-main">
        <header className="dkm-topbar dkm4-topbar">
          <div className="dkm4-topbar-left">
            <button type="button" className="dkm-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Άνοιγμα μενού">
              <Icon name="menu" />
            </button>
            <span className="dkm4-back-mark">←</span>
            <b>{pageTitle(pathname)}</b>
          </div>

          <div className="dkm4-topbar-right">
            <Link href="/" target="_blank" className="dkm4-public-link">
              Dorokartes.gr <Icon name="external" />
            </Link>
            <div className="dkm4-top-member">
              <MerchantAvatar name={memberName} logoUrl={null} size="small" />
              <span>{memberName}</span>
            </div>
          </div>
        </header>

        <div className="dkm-content dkm4-content">{children}</div>
      </main>
    </div>
  );
}
