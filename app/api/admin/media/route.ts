import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const db = prisma as any;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const giftCardId = String(body.giftCardId || "");
    const url = String(body.url || "").trim();
    const altText = String(body.altText || "").trim() || null;

    if (!giftCardId || !url) {
      return NextResponse.json({ error: "gift_card_and_url_required" }, { status: 400 });
    }

    const exists = await db.giftCard.findUnique({
      where: { id: giftCardId },
      select: { id: true },
    });

    if (!exists) {
      return NextResponse.json({ error: "gift_card_not_found" }, { status: 404 });
    }

    const row = await db.mediaAsset.create({
      data: { giftCardId, url, altText },
    });

    return NextResponse.json({ ok: true, row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "media_create_failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id_required" }, { status: 400 });
    }

    await db.mediaAsset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "media_delete_failed" }, { status: 500 });
  }
}
