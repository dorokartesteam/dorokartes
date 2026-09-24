import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendMerchantLoginLinks } from "@/lib/merchant/email";
import { addMinutes, hashToken, newToken } from "@/lib/merchant/security";

export const runtime = "nodejs";

type AdminMemberAction = "SUSPEND" | "REACTIVATE" | "SEND_LOGIN_LINK";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: merchantId } = await params;
  const body = (await request.json().catch(() => null)) as {
    memberId?: string;
    action?: AdminMemberAction;
  } | null;

  const memberId = String(body?.memberId || "").trim();
  const action = String(body?.action || "").trim().toUpperCase() as AdminMemberAction;

  if (!memberId || !["SUSPEND", "REACTIVATE", "SEND_LOGIN_LINK"].includes(action)) {
    return NextResponse.json({ error: "invalid_member_action" }, { status: 400 });
  }

  const member = await prisma.merchantMember.findFirst({
    where: { id: memberId, merchantId },
    include: { merchant: { select: { name: true } } },
  });

  if (!member) {
    return NextResponse.json({ error: "merchant_member_not_found" }, { status: 404 });
  }

  if (action === "SUSPEND") {
    await prisma.$transaction([
      prisma.merchantMember.update({
        where: { id: member.id },
        data: { status: "SUSPENDED" },
      }),
      prisma.merchantSession.deleteMany({ where: { memberId: member.id } }),
      prisma.merchantMagicLink.deleteMany({
        where: { memberId: member.id, usedAt: null },
      }),
    ]);

    revalidatePath(`/admin/merchants/${merchantId}`);
    revalidatePath("/admin/merchants");
    return NextResponse.json({ ok: true, status: "SUSPENDED" });
  }

  if (action === "REACTIVATE") {
    await prisma.merchantMember.update({
      where: { id: member.id },
      data: { status: "ACTIVE" },
    });

    revalidatePath(`/admin/merchants/${merchantId}`);
    revalidatePath("/admin/merchants");
    return NextResponse.json({ ok: true, status: "ACTIVE" });
  }

  if (member.status === "SUSPENDED") {
    return NextResponse.json({ error: "Reactivate the portal user before sending a login link." }, { status: 409 });
  }

  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = addMinutes(new Date(), 15);

  await prisma.$transaction([
    prisma.merchantMagicLink.deleteMany({
      where: {
        memberId: member.id,
        purpose: "LOGIN",
        usedAt: null,
      },
    }),
    prisma.merchantMagicLink.create({
      data: {
        memberId: member.id,
        purpose: "LOGIN",
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  const mail = await sendMerchantLoginLinks({
    to: member.email,
    links: [
      {
        merchantName: member.merchant.name,
        url: `${baseUrl}/merchant/invite?token=${encodeURIComponent(token)}`,
      },
    ],
  });

  if (!mail.sent) {
    return NextResponse.json({ error: "merchant_email_not_sent" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, email: member.email });
}
