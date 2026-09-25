import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMerchantLeadFollowUp } from "@/lib/merchant/email";
import { sendActivationFollowUp } from "@/lib/merchant/follow-up";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const lead = await prisma.merchantLead.findUnique({
    where: { id },
    include: {
      matchedMerchant: {
        select: { id: true, name: true },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  if (lead.status === "REJECTED") {
    return NextResponse.json(
      { error: "Δεν στέλνουμε follow-up σε rejected lead από αυτή την ενέργεια." },
      { status: 409 },
    );
  }

  if (lead.status === "APPROVED") {
    try {
      const result = await sendActivationFollowUp({
        leadId: lead.id,
        origin: new URL(request.url).origin,
        automated: false,
      });

      return NextResponse.json({
        ok: true,
        message:
          result.stage === "INVITE_PENDING"
            ? "Στάλθηκε νέο activation reminder."
            : "Στάλθηκε reminder για ολοκλήρωση πακέτου.",
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Το follow-up email απέτυχε." },
        { status: 409 },
      );
    }
  }

  const mail = await sendMerchantLeadFollowUp({
    to: lead.email,
    contactName: lead.contactName,
    businessName: lead.matchedMerchant?.name || lead.businessName,
    status: lead.status,
    portalUrl: null,
  });

  if (!mail.sent) {
    return NextResponse.json(
      { error: "Το email service δεν μπόρεσε να στείλει το follow-up." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Στάλθηκε ενημέρωση ότι το αίτημα βρίσκεται σε έλεγχο.",
  });
}
