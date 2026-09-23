import MerchantProfileForm from "@/components/merchant/MerchantProfileForm";
import { requireMerchantMember } from "@/lib/merchant/auth";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function MerchantProfilePage() {
  const member = await requireMerchantMember();
  const merchant = member.merchant;

  return (
    <section className="dkm-panel">
      <div className="dkm-panel-head dkm-profile-head">
        <div className="dkm-profile-brand">
          <div className="dkm-profile-logo">
            {merchant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={merchant.logoUrl} alt={`${merchant.name} logo`} />
            ) : (
              <span>{initials(merchant.name) || "D"}</span>
            )}
          </div>

          <div>
            <small>ΕΠΙΣΗΜΟ ΠΡΟΦΙΛ</small>
            <h1>{merchant.name}</h1>
            <p>Αυτά είναι τα στοιχεία που συνδέονται με την παρουσία σου στο Dorokartes.</p>
          </div>
        </div>
      </div>

      <MerchantProfileForm
        merchant={{
          name: merchant.name,
          legalName: merchant.legalName,
          description: merchant.description,
          websiteUrl: merchant.websiteUrl,
          logoUrl: merchant.logoUrl,
        }}
      />
    </section>
  );
}
