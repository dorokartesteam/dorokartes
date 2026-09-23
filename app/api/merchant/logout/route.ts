import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken, MERCHANT_SESSION_COOKIE } from "@/lib/merchant/security";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(MERCHANT_SESSION_COOKIE)?.value;

  if (token) {
    await prisma.merchantSession.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }

  const response = NextResponse.redirect(new URL("/merchant/login", request.url), 303);
  response.cookies.set({
    name: MERCHANT_SESSION_COOKIE,
    value: "",
    path: "/",
    expires: new Date(0),
  });

  return response;
}
