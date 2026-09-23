import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newToken, hashToken, addDays, normalizeEmail } from "@/lib/merchant/security";
import { sendMerchantInvite } from "@/lib/merchant/email";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { merchantId?: string } | null;
  const merchantId = String(body?.merchantId || "").trim();

  if (!merchantId) {
    return NextResponse.json({ error: "merchantId is required." }, { status: 400 });
  }

  const [lead, merchant] = await Promise.all([
    prisma.merchantLead.findUnique({ where: { id } }),
    prisma.merchant.findUnique({ where: { id: merchantId } }),
  ]);

  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (!merchant) return NextResponse.json({ error: "Merchant not found." }, { status: 404 });

  const email = normalizeEmail(lead.email);
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = addDays(new Date(), 7);

  const member = await prisma.$transaction(async (tx) => {
    const existing = await tx.merchantMember.findUnique({
      where: { merchantId_email: { merchantId, email } },
    });

    const savedMember = existing
      ? await tx.merchantMember.update({
          where: { id: existing.id },
          data: {
            name: lead.contactName,
            status: existing.status === "SUSPENDED" ? "SUSPENDED" : existing.status,
          },
        })
      : await tx.merchantMember.create({
          data: {
            merchantId,
            email,
            name: lead.contactName,
            role: "OWNER",
            status: "INVITED",
          },
        });

    await tx.merchantMagicLink.deleteMany({
      where: {
        memberId: savedMember.id,
        usedAt: null,
        purpose: "INVITE",
      },
    });

    await tx.merchantMagicLink.create({
      data: {
        memberId: savedMember.id,
        purpose: "INVITE",
        tokenHash,
        expiresAt,
      },
    });

    const requestedPlan = lead.requestedPlan || "PARTNER";
    const existingSubscription = await tx.merchantSubscription.findUnique({
      where: { merchantId },
    });

    if (!existingSubscription) {
      await tx.merchantSubscription.create({
        data: {
          merchantId,
          plan: requestedPlan,
          status: "PENDING",
        },
      });
    } else if (existingSubscription.status === "PENDING") {
      await tx.merchantSubscription.update({
        where: { merchantId },
        data: { plan: requestedPlan },
      });
    }

    await tx.merchantLead.update({
      where: { id },
      data: {
        status: "APPROVED",
        matchedMerchantId: merchantId,
        reviewedAt: new Date(),
      },
    });

    return savedMember;
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  const inviteUrl = `${baseUrl}/merchant/invite?token=${encodeURIComponent(token)}`;

  const mail = await sendMerchantInvite({
    to: member.email,
    contactName: member.name,
    merchantName: merchant.name,
    inviteUrl,
  });

  return NextResponse.json({
    ok: true,
    memberId: member.id,
    inviteUrl,
    emailSent: mail.sent,
  });
}
