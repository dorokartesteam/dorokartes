import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addMinutes, hashToken, newToken, normalizeEmail } from "@/lib/merchant/security";
import { sendMerchantLoginLinks } from "@/lib/merchant/email";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(String(body?.email || ""));

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Συμπλήρωσε έγκυρο email." }, { status: 400 });
  }

  const members = await prisma.merchantMember.findMany({
    where: {
      email,
      status: { in: ["ACTIVE", "INVITED"] },
    },
    include: {
      merchant: { select: { name: true } },
    },
  });

  // Generic response when no account exists.
  if (!members.length) {
    return NextResponse.json({ ok: true });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  const links: { merchantName: string; url: string }[] = [];

  for (const member of members) {
    const token = newToken();
    const tokenHash = hashToken(token);

    await prisma.merchantMagicLink.create({
      data: {
        memberId: member.id,
        purpose: "LOGIN",
        tokenHash,
        expiresAt: addMinutes(new Date(), 15),
      },
    });

    links.push({
      merchantName: member.merchant.name,
      url: `${baseUrl}/merchant/invite?token=${encodeURIComponent(token)}`,
    });
  }

  const result = await sendMerchantLoginLinks({ to: email, links });

  if (!result.sent) {
    return NextResponse.json(
      {
        error:
          "Η αποστολή email δεν είναι ακόμη ρυθμισμένη. Επικοινώνησε με το Dorokartes για νέο link πρόσβασης.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
