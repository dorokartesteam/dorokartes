import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_PAGE_TYPES = new Set(["brand", "gift_card"]);
const MAX_SOURCE_PATH = 500;
const MAX_SESSION_ID = 120;
const DEDUPE_WINDOW_MS = 30 * 60_000;

type CatalogViewBody = {
  merchantId?: unknown;
  giftCardId?: unknown;
  pageType?: unknown;
  sourcePath?: unknown;
  sessionId?: unknown;
};

function cleanString(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CatalogViewBody;
    const merchantId = cleanString(body.merchantId, 100);
    const giftCardId = body.giftCardId == null ? null : cleanString(body.giftCardId, 100);
    const pageType = cleanString(body.pageType, 30);
    const sourcePath = cleanString(body.sourcePath, MAX_SOURCE_PATH);
    const sessionId = cleanString(body.sessionId, MAX_SESSION_ID);

    if (!merchantId || !pageType || !sourcePath || !sessionId || !VALID_PAGE_TYPES.has(pageType)) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    if (pageType === "gift_card" && !giftCardId) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, status: true },
    });

    if (!merchant || merchant.status !== "ACTIVE") {
      return new NextResponse(null, { status: 204 });
    }

    if (giftCardId) {
      const giftCard = await prisma.giftCard.findFirst({
        where: { id: giftCardId, merchantId, status: "ACTIVE" },
        select: { id: true },
      });

      if (!giftCard) return new NextResponse(null, { status: 204 });
    }

    const duplicateSince = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const duplicate = await prisma.catalogViewEvent.findFirst({
      where: {
        merchantId,
        giftCardId,
        pageType,
        sessionId,
        viewedAt: { gte: duplicateSince },
      },
      select: { id: true },
    });

    if (!duplicate) {
      await prisma.catalogViewEvent.create({
        data: {
          merchantId,
          giftCardId,
          pageType,
          sourcePath,
          sessionId,
        },
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("CATALOG VIEW ANALYTICS ERROR:", error);
    // Public browsing must never fail because analytics failed.
    return new NextResponse(null, { status: 204 });
  }
}
