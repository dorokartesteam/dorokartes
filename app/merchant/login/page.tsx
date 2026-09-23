import type { Metadata } from "next";
import Link from "next/link";
import MerchantLoginForm from "@/components/merchant/MerchantLoginForm";

export const metadata: Metadata = {
  title: "Merchant Login",
  robots: { index: false, follow: false },
};

export default async function MerchantLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;

  return (
    <main className="dkm-auth-page">
      <div className="dkm-auth-card">
        <Link className="dkm-auth-brand" href="/">Dorokartes</Link>
        <span className="dkm-kicker">MERCHANT PORTAL</span>
        <h1>Η επιχείρησή σου στο Dorokartes.</h1>
        <p>
          Βάλε το επαγγελματικό email που έχει εγκριθεί για την επιχείρησή σου
          και θα σου στείλουμε ασφαλές link σύνδεσης.
        </p>

        {p.error ? (
          <div className="dkm-alert error">
            Ο σύνδεσμος δεν είναι πλέον έγκυρος. Ζήτησε νέο link σύνδεσης.
          </div>
        ) : null}

        <MerchantLoginForm />

        <small>
          Δεν έχεις ακόμη πρόσβαση;{" "}
          <Link href="/register-store">Εκδήλωση ενδιαφέροντος →</Link>
        </small>
      </div>
    </main>
  );
}
