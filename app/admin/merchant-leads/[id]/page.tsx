import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Panel, Status } from "@/components/admin/AdminUI";
import MerchantLeadReview from "@/components/admin/MerchantLeadReview";
import { planLabel } from "@/lib/merchant/plans";

export const dynamic = "force-dynamic";

export default async function MerchantLeadDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [lead, merchants] = await Promise.all([
    prisma.merchantLead.findUnique({
      where: { id },
      include: {
        matchedMerchant: {
          select: { id: true, name: true, slug: true, websiteUrl: true },
        },
      },
    }),
    prisma.merchant.findMany({
      where: { status: { in: ["ACTIVE", "NEEDS_REVIEW"] } },
      select: { id: true, name: true, slug: true, websiteUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!lead) notFound();

  return (
    <>
      <div className="dk-detailhead dk-detailhead-v41">
        <div>
          <Link href="/admin/merchant-leads">← Merchant Leads</Link>
          <h2>{lead.businessName}</h2>
          <p>{lead.contactName} · {lead.email}</p>
        </div>
        <div className="dk-detail-actions-v41">
          <Status value={lead.status} />
        </div>
      </div>

      <div className="dk-grid2 cms dk-merchant-layout-v41">
        <Panel title="Lead details" subtitle="Στοιχεία που έστειλε η επιχείρηση">
          <div className="dk-list">
            <div className="dk-listrow"><div className="grow"><small>Business</small><b>{lead.businessName}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Contact</small><b>{lead.contactName}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Email</small><b>{lead.email}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Phone</small><b>{lead.phone}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Website</small><b>{lead.website || "—"}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Type / Region</small><b>{lead.businessType} · {lead.region || "Online / Πανελλαδικά"}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Category</small><b>{lead.category}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Gift cards</small><b>{lead.giftCardStatus}</b></div></div>
            <div className="dk-listrow"><div className="grow"><small>Requested plan</small><b>{planLabel(lead.requestedPlan)}</b></div></div>
            {lead.message ? <div className="dk-listrow"><div className="grow"><small>Message</small><b>{lead.message}</b></div></div> : null}
          </div>
        </Panel>

        <Panel title="Review & portal access" subtitle="Αντιστοίχισε το lead στο σωστό υπάρχον merchant">
          <MerchantLeadReview
            lead={{
              id: lead.id,
              status: lead.status,
              matchedMerchantId: lead.matchedMerchantId,
            }}
            merchants={merchants}
          />
        </Panel>
      </div>
    </>
  );
}
