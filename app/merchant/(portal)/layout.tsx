import MerchantShell from "@/components/merchant/MerchantShell";
import { requireMerchantMember } from "@/lib/merchant/auth";

export const dynamic = "force-dynamic";

export default async function MerchantPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await requireMerchantMember();

  return (
    <MerchantShell
      merchantName={member.merchant.name}
      merchantLogoUrl={member.merchant.logoUrl}
      memberName={member.name || member.email}
      plan={member.merchant.subscription?.plan || "PARTNER"}
      status={member.merchant.subscription?.status || "PENDING"}
    >
      {children}
    </MerchantShell>
  );
}
