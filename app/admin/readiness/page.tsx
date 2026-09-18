import { getReadinessData } from "@/lib/admin/readiness";
import ReadinessTable from "@/components/admin/ReadinessTable";
import { Metric, PageIntro, Panel } from "@/components/admin/AdminUI";

export default async function ReadinessPage(){
  const {items,summary}=await getReadinessData();
  const readyPct=summary.total?Math.round(summary.ready/summary.total*100):0;

  return <>
    <PageIntro title="Launch Readiness" text="A weighted quality score for every gift-card program, based on verification, the official redirect URL, content, taxonomy and SEO. Media and fixed denominations are optional."/>
    <div className="dk-metricgrid">
      <Metric label="Launch Ready" value={summary.ready} detail={`${readyPct}% of catalog`} tone="good"/>
      <Metric label="90–100%" value={summary.score90} detail="Excellent coverage" tone="purple"/>
      <Metric label="80–89%" value={Math.max(0,summary.score80-summary.score90)} detail="Almost ready"/>
      <Metric label="60–79%" value={summary.score60to79} detail="Needs enrichment" tone="warn"/>
      <Metric label="<60%" value={summary.below60} detail="Low completeness" tone={summary.below60?"bad":"good"}/>
      <Metric label="Unverified" value={summary.unverified} detail="Verification gap" tone={summary.unverified?"warn":"good"}/>
    </div>

    <div className="dk-grid2">
      <Panel title="Biggest launch blockers" subtitle="Fix these buckets first">
        <div className="dk-blockergrid">
          <div><strong>{summary.missingMedia}</strong><span>Missing media</span></div>
          <div><strong>{summary.missingCategory}</strong><span>Missing category</span></div>
          <div><strong>{summary.missingOccasion}</strong><span>Missing occasion</span></div>
          <div><strong>{summary.missingVariant}</strong><span>Missing variant</span></div>
          <div><strong>{summary.missingDescription}</strong><span>Missing description</span></div>
          <div><strong>{summary.missingSeo}</strong><span>Missing SEO</span></div>
        </div>
      </Panel>

      <Panel title="Scoring model" subtitle="100 points total">
        <div className="dk-weightlist">
          <div><b>25</b><span>Verified program</span></div>
          <div><b>25</b><span>Official redirect URL</span></div>
          <div><b>15</b><span>Description</span></div>
          <div><b>10</b><span>Category</span></div>
          <div><b>10</b><span>Occasion</span></div>
          <div><b>10</b><span>SEO title + meta</span></div>
          <div><b>5</b><span>Validity or terms</span></div>
          <div><b>0</b><span>Media / variants are optional enrichment</span></div>
        </div>
      </Panel>
    </div>

    <ReadinessTable items={items}/>
  </>;
}
