import { NextRequest, NextResponse } from "next/server";
import { getMerchantMember } from "@/lib/merchant/auth";
import { prisma } from "@/lib/prisma";

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function PATCH(request: NextRequest) {
  const member = await getMerchantMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    legalName?: unknown;
    description?: unknown;
    websiteUrl?: unknown;
  } | null;

  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const legalName = clean(body.legalName, 180);
  const description = clean(body.description, 2000);
  const websiteUrl = clean(body.websiteUrl, 300);

  if (websiteUrl) {
    try {
      const url = new URL(websiteUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
    } catch {
      return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
    }
  }

  await prisma.merchant.update({
    where: { id: member.merchantId },
    data: {
      legalName: legalName || null,
      description: description || null,
      websiteUrl: websiteUrl || null,
    },
  });

  return NextResponse.json({ ok: true });
}
