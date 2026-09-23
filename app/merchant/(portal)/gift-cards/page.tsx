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

  return (
    <section className="dkm-panel">
      <div className="dkm-panel-head">
        <div><small>CATALOG</small><h1>Οι δωροκάρτες σου</h1></div>
        <span>{cards.length} συνολικά</span>
      </div>

      <div className="dkm-table-wrap">
        <table className="dkm-table">
          <thead><tr><th>Δωροκάρτα</th><th>Status</th><th>Verification</th><th>Official URL</th><th></th></tr></thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.id}>
                <td><b>{card.title}</b></td>
                <td>{card.status}</td>
                <td>{card.verificationStatus}</td>
                <td>{card.officialUrl ? <a href={card.officialUrl} target="_blank">Official ↗</a> : "—"}</td>
                <td><Link href={`/gift-cards/${card.slug}`} target="_blank">Προβολή ↗</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!cards.length ? <div className="dkm-empty">Δεν υπάρχουν ακόμη δωροκάρτες.</div> : null}
    </section>
  );
}
