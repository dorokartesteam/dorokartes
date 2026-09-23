import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashToken, MERCHANT_SESSION_COOKIE } from "@/lib/merchant/security";

export async function getMerchantMember() {
  const cookieStore = await cookies();
  const token = cookieStore.get(MERCHANT_SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.merchantSession.findUnique({
    where: { tokenHash },
    include: {
      member: {
        include: {
          merchant: {
            include: {
              subscription: true,
            },
          },
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date() || session.member.status !== "ACTIVE") {
    await prisma.merchantSession.deleteMany({ where: { tokenHash } });
    return null;
  }

  return session.member;
}

export async function requireMerchantMember() {
  const member = await getMerchantMember();
  if (!member) redirect("/merchant/login");
  return member;
}
