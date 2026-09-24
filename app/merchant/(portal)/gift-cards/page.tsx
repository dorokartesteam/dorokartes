import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMerchantMember } from "@/lib/merchant/auth";

export default async function MerchantGiftCardsPage() {
  const member = await requireMerchantMember();

  const cards = await prisma.giftCard.findMany({
    where: { merchantId: member.merchantId },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      verificationStatus: true,
      officialUrl: true,
      updatedAt: true,
    },
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });

  const activeCount = cards.filter((card) => card.status === "ACTIVE").length;

  return (
    <div className="dkm-page-stack">
      <section className="dkm-page-heading">
        <div>
          <span className="dkm-eyebrow">CATALOG</span>
          <h1>Οι δωροκάρτες σου</h1>
          <p>Δες την κατάσταση, την επαλήθευση και τα public links των προγραμμάτων σου.</p>
        </div>
        <div className="dkm-heading-stats">
          <span><b>{cards.length}</b> συνολικά</span>
          <span><b>{activeCount}</b> active</span>
        </div>
      </section>

      <section className="dkm-panel dkm-v2-panel dkm-table-panel">
        <div className="dkm-table-wrap">
          <table className="dkm-table dkm-v2-table">
            <thead>
              <tr>
                <th>Δωροκάρτα</th>
                <th>Status</th>
                <th>Verification</th>
                <th>Official URL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id}>
                  <td>
                    <div className="dkm-card-title-cell">
                      <span>G</span>
                      <b>{card.title}</b>
                    </div>
                  </td>
                  <td><span className={`dkm-table-pill ${card.status.toLowerCase()}`}>{card.status}</span></td>
                  <td><span className="dkm-table-pill verification">{card.verificationStatus}</span></td>
                  <td>{card.officialUrl ? <a href={card.officialUrl} target="_blank">Official ↗</a> : <span className="dkm-muted">—</span>}</td>
                  <td><Link href={`/gift-cards/${card.slug}`} target="_blank" className="dkm-table-action">Προβολή ↗</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!cards.length ? (
          <div className="dkm-empty dkm-v2-empty">
            <div>▣</div>
            <b>Δεν υπάρχουν ακόμη δωροκάρτες</b>
            <span>Μόλις συνδεθούν προγράμματα με το brand σου θα εμφανιστούν εδώ.</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
