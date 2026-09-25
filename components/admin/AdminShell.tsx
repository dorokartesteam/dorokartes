"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

type IconName =
  | "home" | "chart" | "money" | "activity" | "store" | "leads" | "card"
  | "plus" | "list" | "tags" | "layout" | "search" | "health" | "verify"
  | "duplicate" | "play" | "brand" | "settings" | "external" | "menu"
  | "close" | "command" | "chevron";

type NavItem = { label: string; href: string; icon: IconName };
type NavGroup = { label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Επισκόπηση",
    items: [
      { label: "Dashboard", href: "/admin", icon: "home" },
      { label: "Revenue", href: "/admin/revenue", icon: "money" },
      { label: "Activation", href: "/admin/activation", icon: "activity" },
      { label: "Analytics", href: "/admin/analytics", icon: "chart" },
      { label: "Growth", href: "/admin/growth", icon: "chart" },
      { label: "Launch", href: "/admin/launch", icon: "play" },
    ],
  },
  {
    label: "Κατάλογος",
    items: [
      { label: "Merchants", href: "/admin/merchants", icon: "store" },
      { label: "Merchant Leads", href: "/admin/merchant-leads", icon: "leads" },
      { label: "Gift Cards", href: "/admin/gift-cards", icon: "card" },
      { label: "Create", href: "/admin/create", icon: "plus" },
      { label: "Bulk Editor", href: "/admin/bulk", icon: "list" },
      { label: "Taxonomy", href: "/admin/taxonomy", icon: "tags" },
      { label: "Homepage", href: "/admin/homepage", icon: "layout" },
      { label: "SEO", href: "/admin/seo", icon: "search" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Catalog Health", href: "/admin/remediation", icon: "health" },
      { label: "Discovery", href: "/admin/discovery", icon: "search" },
      { label: "Verification", href: "/admin/verification", icon: "verify" },
      { label: "Duplicates", href: "/admin/duplicates", icon: "duplicate" },
      { label: "Pipeline", href: "/admin/pipeline", icon: "play" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Brand", href: "/admin/brand", icon: "brand" },
      { label: "Settings", href: "/admin/settings", icon: "settings" },
    ],
  },
];

function routeSelected(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  if (href === "/admin/remediation") {
    return path.startsWith("/admin/remediation") || path.startsWith("/admin/readiness") || path.startsWith("/admin/quality");
  }
  if (href === "/admin/duplicates") {
    return path.startsWith("/admin/duplicates") || path.startsWith("/admin/merge");
  }
  return path === href || path.startsWith(`${href}/`);
}

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
    chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/></>,
    money: <><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 15h3.5"/></>,
    activity: <><path d="M4 13h4l2-6 4 11 2-5h4"/><path d="M4 5.5h16v13H4z"/></>,
    store: <><path d="M4 10h16"/><path d="M5 10v9h14v-9"/><path d="m4 10 2-5h12l2 5"/><path d="M9 19v-5h6v5"/></>,
    leads: <><circle cx="9" cy="9" r="3"/><path d="M3.5 19c.7-3.5 2.5-5.3 5.5-5.3s4.8 1.8 5.5 5.3"/><path d="M16 8h5"/><path d="M18.5 5.5v5"/></>,
    card: <><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.3h17"/><path d="M7 15h4"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    list: <><path d="M8 6h12"/><path d="M8 12h12"/><path d="M8 18h12"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/></>,
    tags: <><path d="M4 5.5h8l7.5 7.5-6.5 6.5L5.5 12V5.5Z"/><circle cx="9" cy="9" r="1"/></>,
    layout: <><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17"/><path d="M9 9v11"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></>,
    health: <><path d="M4 13h4l2-6 4 11 2-5h4"/></>,
    verify: <><path d="m6 12 4 4 8-9"/><circle cx="12" cy="12" r="9"/></>,
    duplicate: <><rect x="7" y="7" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></>,
    play: <><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/></>,
    brand: <><path d="M12 3 4.5 7.3v9.4L12 21l7.5-4.3V7.3L12 3Z"/><path d="m8.5 9 3.5 2 3.5-2"/><path d="M12 11v5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    external: <><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M20 13v5.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H11"/></>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    command: <><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const titles: Record<string, { title: string; eyebrow: string }> = {
  "/admin": { title: "Dashboard", eyebrow: "Επισκόπηση πλατφόρμας" },
  "/admin/revenue": { title: "Revenue", eyebrow: "Συνδρομές & εμπορική εικόνα" },
  "/admin/activation": { title: "Merchant Activation", eyebrow: "Follow-up & conversion funnel" },
  "/admin/analytics": { title: "Analytics", eyebrow: "Traffic & catalog signals" },
  "/admin/growth": { title: "Growth", eyebrow: "SEO, traffic & asset evidence" },
  "/admin/launch": { title: "Launch", eyebrow: "Production readiness" },
  "/admin/merchants": { title: "Merchants", eyebrow: "Κατάλογος & merchant portal" },
  "/admin/merchant-leads": { title: "Merchant Leads", eyebrow: "Αιτήματα συνεργασίας" },
  "/admin/gift-cards": { title: "Gift Cards", eyebrow: "Διαχείριση καταλόγου" },
  "/admin/create": { title: "Create", eyebrow: "Νέο περιεχόμενο" },
  "/admin/bulk": { title: "Bulk Editor", eyebrow: "Μαζικές αλλαγές" },
  "/admin/taxonomy": { title: "Taxonomy", eyebrow: "Κατηγορίες & occasions" },
  "/admin/homepage": { title: "Homepage", eyebrow: "Merchandising & προβολή" },
  "/admin/seo": { title: "SEO", eyebrow: "Indexation & metadata" },
  "/admin/remediation": { title: "Catalog Health", eyebrow: "Quality & remediation" },
  "/admin/discovery": { title: "Discovery", eyebrow: "Catalog discovery" },
  "/admin/verification": { title: "Verification", eyebrow: "Έλεγχος περιεχομένου" },
  "/admin/duplicates": { title: "Duplicates", eyebrow: "Duplicate management" },
  "/admin/pipeline": { title: "Pipeline", eyebrow: "Operations & jobs" },
  "/admin/brand": { title: "Brand", eyebrow: "Brand assets" },
  "/admin/settings": { title: "Settings", eyebrow: "System configuration" },
};

function pageMeta(path: string) {
  const key = Object.keys(titles)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => candidate === "/admin" ? path === candidate : path.startsWith(candidate));
  return key ? titles[key] : { title: "Admin", eyebrow: "Dorokartes Control Center" };
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allItems = useMemo(() => groups.flatMap((group) => group.items), []);
  const meta = pageMeta(path);

  const commandItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q));
  }, [allItems, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="dk-admin dka5-shell">
      <button
        type="button"
        className={`dka5-mobile-overlay ${mobileOpen ? "is-visible" : ""}`}
        aria-label="Κλείσιμο μενού"
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`dk-sidebar dka5-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="dka5-sidebar-head">
          <Link href="/admin" className="dka5-logo" onClick={() => setMobileOpen(false)}>
            <span className="dka5-logo-mark">
              <Image src="/brand/dorokartes-mark.png" alt="Dorokartes" width={42} height={42} priority />
            </span>
            <span className="dka5-logo-copy"><b>Dorokartes</b><small>Admin Portal</small></span>
          </Link>
          <button type="button" className="dka5-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Κλείσιμο μενού"><Icon name="close" /></button>
        </div>

        <div className="dka5-environment-card">
          <span className="dka5-env-dot" />
          <div><b>Production</b><small>Control Center</small></div>
          <span className="dka5-env-live">LIVE</span>
        </div>

        <nav className="dk-nav dka5-nav" aria-label="Admin navigation">
          {groups.map((group) => (
            <div className="dka5-nav-group" key={group.label}>
              <div className="dka5-nav-label">{group.label}</div>
              {group.items.map((item) => {
                const selected = routeSelected(path, item.href);
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={`dk-navitem dka5-nav-item ${selected ? "active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="dka5-nav-icon"><Icon name={item.icon} /></span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="dka5-sidebar-spacer" />

        <div className="dka5-quick-card">
          <span className="dka5-quick-icon"><Icon name="command" /></span>
          <div><b>Quick actions</b><p>Πήγαινε άμεσα σε οποιαδήποτε ενότητα.</p></div>
          <button type="button" onClick={() => setCommandOpen(true)}>Ctrl K <Icon name="chevron" /></button>
        </div>

        <div className="dka5-sidebar-links">
          <Link href="/merchant" target="_blank">Merchant Portal <Icon name="external" /></Link>
          <Link href="/" target="_blank">Dorokartes.gr <Icon name="external" /></Link>
        </div>
      </aside>

      <main className="dk-main dka5-main">
        <header className="dk-topbar dka5-topbar">
          <div className="dka5-topbar-left">
            <button type="button" className="dka5-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Άνοιγμα μενού"><Icon name="menu" /></button>
            <div>
              <span>{meta.eyebrow}</span>
              <h1>{meta.title}</h1>
            </div>
          </div>
          <div className="dka5-topbar-actions">
            <button type="button" className="dka5-command-button" onClick={() => setCommandOpen(true)}><Icon name="command" /><span>Quick actions</span><kbd>Ctrl K</kbd></button>
            <Link href="/" target="_blank" className="dka5-public-button"><span>Public site</span><Icon name="external" /></Link>
          </div>
        </header>

        <div className="dk-content dka5-content">{children}</div>
      </main>

      {commandOpen ? (
        <div className="dka5-command-backdrop" onMouseDown={() => setCommandOpen(false)}>
          <div className="dka5-command-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dka5-command-search">
              <Icon name="search" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση admin ενότητας…" />
              <button type="button" onClick={() => setCommandOpen(false)} aria-label="Κλείσιμο"><Icon name="close" /></button>
            </div>
            <div className="dka5-command-results">
              {commandItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => { setCommandOpen(false); setQuery(""); }}>
                  <span className="dka5-command-result-icon"><Icon name={item.icon} /></span>
                  <div><b>{item.label}</b><small>{item.href}</small></div>
                  <Icon name="chevron" />
                </Link>
              ))}
              {!commandItems.length ? <div className="dka5-command-empty">Δεν βρέθηκε ενότητα.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
