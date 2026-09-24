import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getMerchantMember } from "@/lib/merchant/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: NextRequest) {
  const member = await getMerchantMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Δεν επιλέχθηκε εικόνα." }, { status: 400 });
  }

  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) {
    return NextResponse.json({ error: "Επιτρέπονται μόνο JPG, PNG και WEBP." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Η εικόνα πρέπει να είναι έως 3 MB." }, { status: 400 });
  }

  const blob = await put(
    `merchant-logos/${member.merchantId}/${Date.now()}.${extension}`,
    file,
    { access: "public", addRandomSuffix: true }
  );

  await prisma.merchant.update({
    where: { id: member.merchantId },
    data: { logoUrl: blob.url },
  });

  return NextResponse.json({ ok: true, logoUrl: blob.url });
}

export async function DELETE() {
  const member = await getMerchantMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.merchant.update({
    where: { id: member.merchantId },
    data: { logoUrl: null },
  });

  return NextResponse.json({ ok: true });
}
