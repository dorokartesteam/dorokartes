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
  const className =
    size === "small"
      ? "dkm-merchant-avatar dkm-merchant-avatar-small"
      : "dkm-merchant-avatar";

  return (
    <div className={className} aria-label={`${name} logo`}>
      {logoUrl ? (
        // Existing merchant logos can be local paths or approved remote catalog URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${name} logo`} />
      ) : (
        <span>{initials(name) || "D"}</span>
      )}
    </div>
  );
}

type IconName = "home" | "profile" | "cards" | "analytics" | "billing" | "external" | "logout" | "menu" | "close";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 19,
    height: 19,
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
    billing: <><path d="M4 7.5h16"/><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 15h4"/></>,
    external: <><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M20 13v5.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H11"/></>,
    logout: <><path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/><path d="m15 8 4 4-4 4"/><path d="M19 12H9"/></>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const navItems: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/merchant", label: "Dashboard", icon: "home" },
  { href: "/merchant/profile", label: "Προφίλ", icon: "profile" },
  { href: "/merchant/gift-cards", label: "Δωροκάρτες", icon: "cards" },
  { href: "/merchant/analytics", label: "Analytics", icon: "analytics" },
  { href: "/merchant/billing", label: "Πακέτο & Billing", icon: "billing" },
];

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
    <div className="dkm-shell dkm-v2-shell">
      <button
        type="button"
        className={`dkm-mobile-overlay ${mobileOpen ? "is-visible" : ""}`}
        aria-label="Κλείσιμο μενού"
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`dkm-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="dkm-sidebar-header">
          <Link href="/merchant" className="dkm-logo" onClick={() => setMobileOpen(false)}>
            <span className="dkm-dorokartes-mark">
              <Image
                src="/brand/dorokartes-mark.png"
                alt="Dorokartes"
                width={44}
                height={44}
                priority
              />
            </span>
            <div>
              <b>Dorokartes</b>
              <small>MERCHANT PORTAL</small>
            </div>
          </Link>

          <button
            type="button"
            className="dkm-mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Κλείσιμο μενού"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="dkm-business dkm-v2-business">
          <div className="dkm-business-head">
            <MerchantAvatar name={merchantName} logoUrl={merchantLogoUrl} />
            <div>
              <small>ΕΠΙΧΕΙΡΗΣΗ</small>
              <b>{merchantName}</b>
              <div className="dkm-business-meta">
                <span>{planLabel(plan)}</span>
                <i className={`dkm-status-dot ${statusClass}`} />
                <em>{status}</em>
              </div>
            </div>
          </div>
        </div>

        <div className="dkm-nav-label">ΠΛΟΗΓΗΣΗ</div>
        <nav className="dkm-v2-nav">
          {navItems.map((item) => {
            const active =
              item.href === "/merchant"
                ? pathname === "/merchant"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "active" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span className="dkm-nav-icon"><Icon name={item.icon} /></span>
                <span>{item.label}</span>
                {active ? <i className="dkm-active-marker" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="dkm-sidebar-promo">
          <span>ΑΝΑΠΤΥΞΗ BRAND</span>
          <b>Κάνε τη δωροκάρτα σου πιο ορατή.</b>
          <Link href="/merchant/billing" onClick={() => setMobileOpen(false)}>
            Δες τα πακέτα →
          </Link>
        </div>

        <div className="dkm-sidebar-bottom">
          <div className="dkm-member-row">
            <MerchantAvatar name={memberName} logoUrl={null} size="small" />
            <div>
              <small>Συνδεδεμένος ως</small>
              <b>{memberName}</b>
            </div>
          </div>
          <form action="/api/merchant/logout" method="post">
            <button type="submit"><Icon name="logout" /> <span>Αποσύνδεση</span></button>
          </form>
        </div>
      </aside>

      <main className="dkm-main">
        <header className="dkm-topbar">
          <div className="dkm-topbar-left">
            <button
              type="button"
              className="dkm-mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Άνοιγμα μενού"
            >
              <Icon name="menu" />
            </button>

            <div className="dkm-topbar-business">
              <MerchantAvatar name={merchantName} logoUrl={merchantLogoUrl} size="small" />
              <div>
                <small>MERCHANT WORKSPACE</small>
                <b>{merchantName}</b>
              </div>
            </div>
          </div>

          <Link href="/" target="_blank" className="dkm-site-link">
            <span>Προβολή Dorokartes.gr</span>
            <Icon name="external" />
          </Link>
        </header>

        <div className="dkm-content">{children}</div>
      </main>
    </div>
  );
}
