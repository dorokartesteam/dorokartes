import { getRemediationData } from "@/lib/admin/remediation";
import RemediationCenter from "@/components/admin/RemediationCenter";

export default async function RemediationPage(){
  const d=await getRemediationData();

  return <div>
    <div className="dk-pageintro">
      <div>
        <span>OPERATIONS</span>
        <h2>Remediation Center</h2>
        <p>Turn launch-readiness gaps into practical work queues: quick wins, media, taxonomy, SEO and verification.</p>
      </div>
    </div>

    <RemediationCenter priority={d.priority} queues={d.queues} counts={d.counts}/>
  </div>;
}
