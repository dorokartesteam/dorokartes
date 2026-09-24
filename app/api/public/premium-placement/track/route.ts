import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    placementId?: string;
    action?: string;
  } | null;

  const placementId = body?.placementId?.trim();
  const action = body?.action?.trim().toUpperCase();

  if (!placementId || !["IMPRESSION", "CLICK"].includes(action || "")) {
    return NextResponse.json({ error: "Invalid tracking event." }, { status: 400 });
  }

  const now = new Date();
  const data = action === "CLICK"
    ? { clicks: { increment: 1 } }
    : { impressions: { increment: 1 } };

  const result = await prisma.premiumPlacement.updateMany({
    where: {
      id: placementId,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    data,
  });

  return NextResponse.json({ ok: result.count === 1 });
}
