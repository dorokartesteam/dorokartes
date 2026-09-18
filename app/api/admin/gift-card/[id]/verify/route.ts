import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : "";

  if (action !== "verify" && action !== "review") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  try {
    const card = await (prisma as any).giftCard.findUnique({
      where: { id },
      select: { id: true, officialUrl: true },
    });

    if (!card) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (action === "verify") {
      if (!card.officialUrl) {
        return NextResponse.json({ error: "official_url_required" }, { status: 400 });
      }

      const now = new Date();
      const next = new Date(now);
      next.setDate(next.getDate() + 90);

      await (prisma as any).$transaction([
        (prisma as any).giftCard.update({
          where: { id },
          data: {
            verificationStatus: "VERIFIED",
            lastVerifiedAt: now,
            nextReviewAt: next,
          },
        }),
        (prisma as any).verificationEvent.create({
          data: {
            giftCardId: id,
            result: "PASSED",
            url: card.officialUrl,
            notes: "Manual verification from Admin",
          },
        }),
      ]);

      return NextResponse.json({
        ok: true,
        verificationStatus: "VERIFIED",
        lastVerifiedAt: now,
        nextReviewAt: next,
      });
    }

    await (prisma as any).$transaction([
      (prisma as any).giftCard.update({
        where: { id },
        data: { verificationStatus: "NEEDS_REVIEW" },
      }),
      (prisma as any).verificationEvent.create({
        data: {
          giftCardId: id,
          result: "PARTIAL",
          url: card.officialUrl,
          notes: notes ? `Manual review requested: ${notes}` : "Manual review requested from Admin",
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      verificationStatus: "NEEDS_REVIEW",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "verification_update_failed" },
      { status: 500 }
    );
  }
}
