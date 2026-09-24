import MerchantProfileForm from "@/components/merchant/MerchantProfileForm";
import { requireMerchantMember } from "@/lib/merchant/auth";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export default async function MerchantProfilePage() {
  const member = await requireMerchantMember();
  const merchant = member.merchant;

  return (
    <div className="dkm-page-stack">
      <section className="dkm-page-heading">
        <div>
          <span className="dkm-eyebrow">BRAND PROFILE</span>
          <h1>Στοιχεία επιχείρησης</h1>
          <p>Διαχειρίσου την εικόνα και τα βασικά στοιχεία της παρουσίας σου στο Dorokartes.</p>
        </div>
      </section>

      <section className="dkm-profile-layout">
        <aside className="dkm-brand-preview-card">
          <span className="dkm-eyebrow">BRAND PREVIEW</span>
          <div className="dkm-profile-logo dkm-v2-profile-logo">
            {merchant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={merchant.logoUrl} alt={`${merchant.name} logo`} />
            ) : (
              <span>{initials(merchant.name) || "D"}</span>
            )}
          </div>
          <h2>{merchant.name}</h2>
          <p>{merchant.websiteUrl || "Δεν έχει οριστεί website"}</p>
          <div className="dkm-preview-note">Η εικόνα που ανεβάζεις χρησιμοποιείται άμεσα στο Merchant Portal. Η δημόσια παρουσία του brand παραμένει ελεγχόμενη από το Dorokartes.</div>
        </aside>

        <section className="dkm-panel dkm-v2-panel dkm-profile-form-panel">
          <div className="dkm-panel-head">
            <div>
              <small>ΕΠΙΣΗΜΟ ΠΡΟΦΙΛ</small>
              <h2>Εταιρικά στοιχεία</h2>
              <p>Logo, website, νομική επωνυμία και περιγραφή σε ένα σημείο.</p>
            </div>
          </div>

          <MerchantProfileForm merchant={{
            name: merchant.name,
            legalName: merchant.legalName,
            description: merchant.description,
            websiteUrl: merchant.websiteUrl,
            logoUrl: merchant.logoUrl,
          }} />
        </section>
      </section>
    </div>
  );
}
