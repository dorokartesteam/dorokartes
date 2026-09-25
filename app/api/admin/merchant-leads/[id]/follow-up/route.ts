import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMinutes, hashToken, newToken, normalizeEmail } from "@/lib/merchant/security";
import { sendMerchantLeadFollowUp } from "@/lib/merchant/email";

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

  let portalUrl: string | null = null;

  if (lead.status === "APPROVED") {
    if (!lead.matchedMerchantId || !lead.matchedMerchant) {
      return NextResponse.json(
        { error: "Το approved lead δεν έχει matched merchant." },
        { status: 409 },
      );
    }

    const email = normalizeEmail(lead.email);
    const member = await prisma.merchantMember.findUnique({
      where: {
        merchantId_email: {
          merchantId: lead.matchedMerchantId,
          email,
        },
      },
    });

    if (!member || member.status === "SUSPENDED") {
      return NextResponse.json(
        { error: "Δεν υπάρχει ενεργό portal member για αυτό το lead." },
        { status: 409 },
      );
    }

    const token = newToken();
    const tokenHash = hashToken(token);

    await prisma.merchantMagicLink.create({
      data: {
        memberId: member.id,
        purpose: "LOGIN",
        tokenHash,
        expiresAt: addMinutes(new Date(), 15),
      },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;

    portalUrl = `${baseUrl}/merchant/invite?token=${encodeURIComponent(token)}`;
  }

  const mail = await sendMerchantLeadFollowUp({
    to: lead.email,
    contactName: lead.contactName,
    businessName: lead.matchedMerchant?.name || lead.businessName,
    status: lead.status,
    portalUrl,
  });

  if (!mail.sent) {
    return NextResponse.json(
      { error: "Το email service δεν μπόρεσε να στείλει το follow-up." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      lead.status === "APPROVED"
        ? "Στάλθηκε νέο Merchant Portal login link."
        : "Στάλθηκε ενημέρωση ότι το αίτημα βρίσκεται σε έλεγχο.",
  });
}
