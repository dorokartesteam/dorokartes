import { getVerificationData, safeCount } from "@/lib/admin/data";
import VerificationCenter from "@/components/admin/VerificationCenter";
import { Metric, PageIntro } from "@/components/admin/AdminUI";

export default async function VerificationPage() {
  const [d, verified] = await Promise.all([
    getVerificationData(),
    safeCount("giftCard", { verificationStatus: "VERIFIED" }),
  ]);

  const openFlags = d.brokenFlags.filter((f: any) => !f.status || f.status === "OPEN");

  return (
    <>
      <PageIntro
        title="Verification Center"
        text="Review official gift-card destinations, approve healthy cards and keep questionable records in a clear manual queue."
      />

      <div className="dk-metricgrid small dk-verification-metrics-v42">
        <Metric label="Needs review" value={d.review.length} tone={d.review.length ? "warn" : "good"} />
        <Metric label="Due for recheck" value={d.stale.length} tone={d.stale.length ? "warn" : "good"} />
        <Metric label="Verified" value={verified} tone="good" />
        <Metric label="Open flags" value={openFlags.length} tone={openFlags.length ? "warn" : "good"} />
      </div>

      <VerificationCenter
        review={d.review}
        stale={d.stale}
        flags={openFlags}
        events={d.events}
      />
    </>
  );
}
