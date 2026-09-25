import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  hashToken,
  MERCHANT_SESSION_COOKIE,
  newToken,
} from "@/lib/merchant/security";
import { sendMerchantWelcome } from "@/lib/merchant/email";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(new URL("/merchant/login?error=invalid-link", request.url));
  }

  const tokenHash = hashToken(token);
  const link = await prisma.merchantMagicLink.findUnique({
    where: { tokenHash },
    include: {
      member: {
        include: {
          merchant: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (
    !link ||
    link.usedAt ||
    link.expiresAt <= new Date() ||
    link.member.status === "SUSPENDED"
  ) {
    return NextResponse.redirect(new URL("/merchant/login?error=expired-link", request.url));
  }

  const firstActivation = link.purpose === "INVITE" && link.member.status === "INVITED";
  const sessionToken = newToken();
  const sessionHash = hashToken(sessionToken);
  const expiresAt = addDays(new Date(), 30);

  await prisma.$transaction([
    prisma.merchantMagicLink.update({
      where: { id: link.id },
      data: { usedAt: new Date() },
    }),
    prisma.merchantMember.update({
      where: { id: link.memberId },
      data: { status: "ACTIVE" },
    }),
    prisma.merchantSession.create({
      data: {
        memberId: link.memberId,
        tokenHash: sessionHash,
        expiresAt,
      },
    }),
  ]);

  if (firstActivation) {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      new URL(request.url).origin;

    try {
      await sendMerchantWelcome({
        to: link.member.email,
        contactName: link.member.name,
        merchantName: link.member.merchant.name,
        dashboardUrl: `${baseUrl}/merchant`,
        profileUrl: `${baseUrl}/merchant/profile`,
        billingUrl: `${baseUrl}/merchant/billing`,
      });
    } catch (error) {
      console.error("Dorokartes merchant welcome email failed", error);
    }
  }

  const response = NextResponse.redirect(
    new URL(firstActivation ? "/merchant?welcome=1" : "/merchant", request.url),
  );

  response.cookies.set({
    name: MERCHANT_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return response;
}
