"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

type NavItem = [label: string, href: string, icon: string];
type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      ["Dashboard", "/admin", "⌂"],
      ["Launch", "/admin/launch", "◉"],
      ["Analytics", "/admin/analytics", "↗"],
    ],
  },
  {
    label: "Catalog",
    items: [
      ["Merchants", "/admin/merchants", "◫"],
      ["Gift Cards", "/admin/gift-cards", "▣"],
      ["Create", "/admin/create", "+"],
      ["Bulk Editor", "/admin/bulk", "☷"],
      ["Taxonomy", "/admin/taxonomy", "⌘"],
      ["Homepage", "/admin/homepage", "✦"],
      ["SEO", "/admin/seo", "◎"],
    ],
  },
  {
    label: "Operations",
    items: [
      ["Catalog Health", "/admin/remediation", "⚡"],
      ["Discovery", "/admin/discovery", "⌕"],
      ["Verification", "/admin/verification", "✓"],
      ["Duplicates", "/admin/duplicates", "⧉"],
      ["Pipeline", "/admin/pipeline", "▶"],
    ],
  },
  {
    label: "System",
    items: [
      ["Brand", "/admin/brand", "◈"],
      ["Settings", "/admin/settings", "⚙"],
    ],
  },
];

function routeSelected(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  if (href === "/admin/remediation") {
    return path.startsWith("/admin/remediation") ||
      path.startsWith("/admin/readiness") ||
      path.startsWith("/admin/quality");
  }
  if (href === "/admin/duplicates") {
    return path.startsWith("/admin/duplicates") || path.startsWith("/admin/merge");
  }
  return path === href || path.startsWith(`${href}/`);
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");

  const allItems = useMemo<NavItem[]>(
    () => groups.flatMap((g) => g.items),
    []
  );

  const active = useMemo(() => {
    const found = allItems.find((item) => routeSelected(path, item[1]));
    return found?.[0] ?? "Control Center";
  }, [allItems, path]);

  const commandItems = useMemo<NavItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((item) =>
      item[0].toLowerCase().includes(q) ||
      item[1].toLowerCase().includes(q)
    );
  }, [allItems, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
      if (e.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`dk-admin dk-admin-v4 ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="dk-sidebar">
        <Link href="/admin" className="dk-brand premium">
          <Image
            src="/brand/dorokartes-mark.png"
            alt="Dorokartes"
            width={54}
            height={54}
            className="dk-brandlogo"
            priority
          />
          {!collapsed && (
            <div className="dk-brandtext">
              <strong>Dorokartes</strong>
              <span>CONTROL CENTER</span>
            </div>
          )}
        </Link>

        <nav className="dk-nav">
          {groups.map((group) => (
            <div className="dk-navgroup" key={group.label}>
              {!collapsed && <div className="dk-navlabel">{group.label}</div>}
              {group.items.map(([label, href, icon]) => {
                const selected = routeSelected(path, href);
                return (
                  <Link
                    className={`dk-navitem ${selected ? "active" : ""}`}
                    href={href}
                    key={href}
                    title={collapsed ? label : undefined}
                  >
                    <span className="dk-navicon">{icon}</span>
                    {!collapsed && <span className="dk-navtext">{label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="dk-sidebarfooter">
          {!collapsed && (
            <div className="dk-admin-mode">
              <i />
              <div>
                <b>Production catalog</b>
                <span>Manual control enabled</span>
              </div>
            </div>
          )}
          <button className="dk-collapse" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? "→" : "← Collapse"}
          </button>
        </div>
      </aside>

      <main className="dk-main">
        <header className="dk-topbar">
          <div>
            <div className="dk-eyebrow">DOROKARTES / ADMIN</div>
            <h1>{active}</h1>
          </div>
          <div className="dk-topactions">
            <button className="dk-command" onClick={() => setCommandOpen(true)}>
              <span>⌘</span> Quick actions <kbd>Ctrl K</kbd>
            </button>
            <a className="dk-iconbtn" href="/" target="_blank" rel="noreferrer" title="Open public site">↗</a>
          </div>
        </header>

        <div className="dk-content">{children}</div>
      </main>

      {commandOpen && (
        <div className="dk-modalbackdrop" onMouseDown={() => setCommandOpen(false)}>
          <div className="dk-commandmodal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dk-commandsearch">
              ⌕
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search admin sections…"
              />
            </div>
            <div className="dk-commandlinks">
              {commandItems.map(([label, href, icon]) => (
                <Link key={href} href={href} onClick={() => { setCommandOpen(false); setQuery(""); }}>
                  <span>{icon}</span><b>{label}</b><small>{href}</small>
                </Link>
              ))}
              {!commandItems.length && <div className="dk-commandempty">No matching section</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
