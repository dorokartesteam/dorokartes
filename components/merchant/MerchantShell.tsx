import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
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
  return (
    <div className="dkm-shell">
      <aside className="dkm-sidebar">
        <Link href="/merchant" className="dkm-logo">
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

        <div className="dkm-business">
          <div className="dkm-business-head">
            <MerchantAvatar name={merchantName} logoUrl={merchantLogoUrl} />
            <div>
              <small>ΕΠΙΧΕΙΡΗΣΗ</small>
              <b>{merchantName}</b>
              <span>
                {planLabel(plan)} · {status}
              </span>
            </div>
          </div>
        </div>

        <nav>
          <Link href="/merchant">
            ⌂ <span>Dashboard</span>
          </Link>
          <Link href="/merchant/profile">
            ◎ <span>Προφίλ</span>
          </Link>
          <Link href="/merchant/gift-cards">
            ▣ <span>Δωροκάρτες</span>
          </Link>
          <Link href="/merchant/analytics">
            ↗ <span>Analytics</span>
          </Link>
          <Link href="/merchant/billing">
            ◇ <span>Πακέτο & Billing</span>
          </Link>
        </nav>

        <div className="dkm-sidebar-bottom">
          <div className="dkm-member-row">
            <MerchantAvatar
              name={memberName}
              logoUrl={null}
              size="small"
            />
            <small>{memberName}</small>
          </div>
          <form action="/api/merchant/logout" method="post">
            <button type="submit">Αποσύνδεση</button>
          </form>
        </div>
      </aside>

      <main className="dkm-main">
        <header className="dkm-topbar">
          <div className="dkm-topbar-business">
            <MerchantAvatar
              name={merchantName}
              logoUrl={merchantLogoUrl}
              size="small"
            />
            <div>
              <small>DOROKARTES / MERCHANT</small>
              <b>{merchantName}</b>
            </div>
          </div>

          <Link href="/" target="_blank">
            Προβολή site ↗
          </Link>
        </header>

        <div className="dkm-content">{children}</div>
      </main>
    </div>
  );
}
