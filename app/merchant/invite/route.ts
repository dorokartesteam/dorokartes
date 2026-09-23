import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  hashToken,
  MERCHANT_SESSION_COOKIE,
  newToken,
} from "@/lib/merchant/security";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(new URL("/merchant/login?error=invalid-link", request.url));
  }

  const tokenHash = hashToken(token);
  const link = await prisma.merchantMagicLink.findUnique({
    where: { tokenHash },
    include: { member: true },
  });

  if (
    !link ||
    link.usedAt ||
    link.expiresAt <= new Date() ||
    link.member.status === "SUSPENDED"
  ) {
    return NextResponse.redirect(new URL("/merchant/login?error=expired-link", request.url));
  }

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

  const response = NextResponse.redirect(new URL("/merchant", request.url));

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
