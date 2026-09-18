import { PageIntro, Panel, Status } from "@/components/admin/AdminUI";

const jobs = [
  ["Merchant progress audit","npm run pipeline:merchant-progress","Safe / read-only"],
  ["Review queue","npm run pipeline:review","Safe / read-only"],
  ["Validation","npm run pipeline:validate","Safe / read-only"],
  ["Duplicate audit","npm run pipeline:audit-duplicates","Safe / read-only"],
  ["Bulk promotion plan","npm run pipeline:bulk-promote","Plan only"],
  ["Reverify production","npm run pipeline:reverify","Review command before apply"],
];

export default function PipelinePage() {
  return <>
    <PageIntro title="Pipeline & Jobs" text="Operational command center. Offline pipeline scripts intentionally stay outside the Vercel request runtime; this page documents the safe operational surface." />
    <Panel title="Available operations" subtitle="The production app should not spawn local CLI jobs on Vercel. Run these from the controlled D:\\dorokartes workspace.">
      <div className="dk-jobs">{jobs.map(([name,cmd,safety])=><div className="dk-job" key={name}><div><b>{name}</b><small>{safety}</small></div><code>{cmd}</code><Status value={safety.includes("Safe") ? "READY":"PLAN"}/></div>)}</div>
    </Panel>
    <div className="dk-notice"><b>Architecture rule:</b> Admin manages production state; heavy discovery/verification runs offline. This keeps Vercel stable and prevents accidental long-running jobs from the web UI.</div>
  </>;
}
