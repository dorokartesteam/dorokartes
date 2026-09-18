import { getQualityData } from "@/lib/admin/data";
import { Metric, PageIntro, Panel } from "@/components/admin/AdminUI";

export default async function QualityPage() {
  const d = await getQualityData();
  const issues = [
    ["Missing descriptions", d.missingDescriptions],
    ["Missing media", d.missingMedia],
    ["Missing variants", d.missingVariants],
    ["Missing category", d.noCategory],
    ["Missing occasion", d.noOccasion],
  ] as const;
  return <>
    <PageIntro title="Quality Center" text="Turn a large merchant catalog into a launch-ready product. Every bucket below is an actionable cleanup queue." />
    <div className="dk-metricgrid small">{issues.map(([label,rows])=><Metric key={label} label={label} value={rows.length} tone={rows.length ? "warn":"good"}/>)}</div>
    <div className="dk-grid2">
      {issues.map(([label,rows])=><Panel title={label} subtitle="First 20 records" key={label}><div className="dk-list">{rows.slice(0,20).map((c:any)=><div className="dk-listrow" key={c.id}><div className="grow"><b>{c.merchant?.name || "Unknown"}</b><small>{c.title}</small></div><a href={`/admin/gift-cards?q=${encodeURIComponent(c.merchant?.name || c.title || "")}`}>Open →</a></div>)}</div></Panel>)}
    </div>
  </>;
}
