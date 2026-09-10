"use client";

import { useEffect } from "react";
import Link from "next/link";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="dk-public">
      <PublicHeader />
      <main className="dk29-state">
        <section className="dk29-state-card" aria-labelledby="public-error-title">
          <span className="dk29-state-icon" aria-hidden="true">!</span>
          <h1 id="public-error-title">Κάτι δεν φόρτωσε σωστά.</h1>
          <p>Η σύνδεση με τον κατάλογο μπορεί να είναι προσωρινά απασχολημένη. Δοκίμασε ξανά ή γύρισε στην αρχική.</p>
          <div className="dk29-state-actions">
            <button type="button" onClick={() => retry()}>Δοκίμασε ξανά</button>
            <Link href="/">Αρχική σελίδα</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
