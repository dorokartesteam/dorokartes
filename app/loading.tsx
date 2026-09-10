import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";

export default function Loading() {
  return (
    <div className="dk-public">
      <PublicHeader />
      <main className="dk29-state" aria-busy="true" aria-live="polite">
        <div className="dk29-skeleton">
          <p className="dk29-state-status">Φόρτωση καταλόγου…</p>
          <div className="dk29-skeleton-line" />
          <div className="dk29-skeleton-line" />
          <div className="dk29-skeleton-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="dk29-skeleton-card" key={index} />
            ))}
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
