import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";
import { planLabel } from "@/lib/merchant/plans";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function MerchantDashboardPage() {
  const member = await requireMerchantMember();
  const merchantId = member.merchantId;

  const since = new Date(Date.now() - 30 * 86_400_000);

  const [cardCount, activeCards, clicks30, recentCards] = await Promise.all([
    prisma.giftCard.count({ where: { merchantId } }),
    prisma.giftCard.count({ where: { merchantId, status: "ACTIVE" } }),
    prisma.outboundClick.count({
      where: { merchantId, clickedAt: { gte: since } },
    }),
    prisma.giftCard.findMany({
      where: { merchantId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        verificationStatus: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const subscription = member.merchant.subscription;
  const logoUrl = member.merchant.logoUrl;

  return (
    <>
      <section className="dkm-hero">
        <div className="dkm-hero-copy">
          <div className="dkm-hero-brand">
            <div className="dkm-hero-logo">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={`${member.merchant.name} logo`} />
              ) : (
                <span>{initials(member.merchant.name) || "D"}</span>
              )}
            </div>

            <div>
              <span>MERCHANT DASHBOARD</span>
              <h1>{member.merchant.name}</h1>
            </div>
          </div>

          <p>
            Διαχειρίσου την παρουσία του brand σου στο Dorokartes, δες τις
            δωροκάρτες σου και το traffic που στέλνουμε προς την επιχείρησή σου.
          </p>
        </div>

        <div className="dkm-plan-card">
          <small>ΤΡΕΧΟΝ ΠΑΚΕΤΟ</small>
          <b>{planLabel(subscription?.plan || "PARTNER")}</b>
          <span>{subscription?.status || "PENDING"}</span>
          <Link href="/merchant/billing">Δες τα πακέτα →</Link>
        </div>
      </section>

      <section className="dkm-metrics">
        <article>
          <small>Δωροκάρτες</small>
          <b>{cardCount}</b>
          <span>συνολικά προγράμματα</span>
        </article>
        <article>
          <small>Active</small>
          <b>{activeCards}</b>
          <span>ενεργές στο Dorokartes</span>
        </article>
        <article>
          <small>Clicks 30 ημερών</small>
          <b>{clicks30}</b>
          <span>προς τις σελίδες αγοράς</span>
        </article>
      </section>

      <section className="dkm-panel">
        <div className="dkm-panel-head">
          <div>
            <small>ΠΡΟΣΦΑΤΕΣ</small>
            <h2>Οι δωροκάρτες σου</h2>
          </div>
          <Link href="/merchant/gift-cards">Δες όλες →</Link>
        </div>

        <div className="dkm-list">
          {recentCards.length ? (
            recentCards.map((card) => (
              <div className="dkm-list-row" key={card.id}>
                <div>
                  <b>{card.title}</b>
                  <small>
                    {card.status} · {card.verificationStatus}
                  </small>
                </div>
                <Link href={`/gift-cards/${card.slug}`} target="_blank">
                  Προβολή ↗
                </Link>
              </div>
            ))
          ) : (
            <div className="dkm-empty">
              Δεν υπάρχουν ακόμη δωροκάρτες συνδεδεμένες με το brand.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
