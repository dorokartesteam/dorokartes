import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getHttpDestination(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const card = await prisma.giftCard.findUnique({
    where: { id },
    select: { id: true, merchantId: true, officialUrl: true, status: true },
  });
  const destination = getHttpDestination(card?.officialUrl ?? null);

  if (!card || card.status !== "ACTIVE" || !destination) {
    return NextResponse.redirect(new URL("/browse", req.url));
  }

  try {
    await prisma.outboundClick.create({
      data: {
        merchantId: card.merchantId,
        giftCardId: card.id,
        destinationUrl: destination.toString(),
        referrer: req.headers.get("referer"),
        userAgent: req.headers.get("user-agent"),
        source: "public_gift_card",
      },
    });
  } catch {
    // Analytics must never block a valid merchant redirect.
  }

  return NextResponse.redirect(destination, 307);
}
