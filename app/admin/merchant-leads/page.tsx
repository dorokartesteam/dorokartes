import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageIntro, Panel, Status } from "@/components/admin/AdminUI";
import { planLabel } from "@/lib/merchant/plans";

export const dynamic = "force-dynamic";

export default async function MerchantLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const status = p.status || "";
  const q = (p.q || "").trim();

  const leads = await prisma.merchantLead.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: "insensitive" } },
              { contactName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { matchedMerchant: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <>
      <PageIntro
        title="Merchant Leads"
        text="Εκδηλώσεις ενδιαφέροντος, αντιστοίχιση με υπάρχον merchant και πρόσκληση στο portal."
      />

      <form className="dk-filterbar">
        <input name="q" defaultValue={q} placeholder="Business, contact, email…" />
        <select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="SUBMITTED">SUBMITTED</option>
          <option value="UNDER_REVIEW">UNDER_REVIEW</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <button>Filter</button>
        <a href="/admin/merchant-leads">Reset</a>
        <span className="dk-resultcount">{leads.length} shown</span>
      </form>

      <Panel title="Incoming merchant interest" subtitle="Newest submissions first">
        <div className="dk-tablewrap">
          <table className="dk-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Contact</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Matched merchant</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link className="dk-entitylink" href={`/admin/merchant-leads/${lead.id}`}>
                      <b>{lead.businessName}</b>
                      <small>{lead.category}</small>
                    </Link>
                  </td>
                  <td>
                    <b>{lead.contactName}</b>
                    <small style={{ display: "block" }}>{lead.email}</small>
                  </td>
                  <td>{planLabel(lead.requestedPlan)}</td>
                  <td><Status value={lead.status} /></td>
                  <td>{lead.matchedMerchant?.name || "—"}</td>
                  <td>{lead.createdAt.toLocaleDateString("el-GR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
