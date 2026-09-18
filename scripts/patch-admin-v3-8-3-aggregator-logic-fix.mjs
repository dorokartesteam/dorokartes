import fs from "node:fs";

function mustRead(file){
  if(!fs.existsSync(file)){
    console.error(`Missing ${file}`);
    process.exit(1);
  }
  return fs.readFileSync(file,"utf8");
}
function write(file,s){
  fs.writeFileSync(file,s,"utf8");
  console.log(`Patched ${file}`);
}

/* 1) Gift-card CMS runtime fix:
   VerificationEvent uses checkedAt, not createdAt. */
{
  const file="lib/admin/cms.ts";
  let s=mustRead(file);

  s=s.replace(
    /verificationEvents:\s*\{\s*take:\s*20,\s*orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/m,
    'verificationEvents: {\n        take: 20,\n        orderBy: { checkedAt: "desc" }'
  );

  // More defensive fallback if spacing differs.
  s=s.replace(
    /(verificationEvents:\s*\{[\s\S]*?orderBy:\s*\{\s*)createdAt(\s*:\s*"desc"\s*\})/m,
    '$1checkedAt$2'
  );

  write(file,s);
}

/* 2) Readiness logic aligned to Dorokartes v1:
   Dorokartes is a discovery/redirect aggregator.
   Media and fixed variants are useful enrichment, NOT launch blockers. */
{
  const file="lib/admin/readiness.ts";
  let s=mustRead(file);

  // Replace the weights object entirely.
  s=s.replace(
    /const weights:\s*Record<keyof typeof checks,\s*number>\s*=\s*\{[\s\S]*?\n\s*\};/m,
`const weights: Record<keyof typeof checks, number> = {
    verified: 25,
    officialUrl: 25,
    description: 15,
    category: 10,
    occasion: 10,
    variant: 0,
    media: 0,
    seo: 10,
    validityOrTerms: 5,
  };`
  );

  // Media/variant remain visible as optional enrichment, not "issues".
  s=s.replace(
    /if \(!checks\.variant\) issues\.push\("Missing variant"\);\s*/g,
    ''
  );
  s=s.replace(
    /if \(!checks\.media\) issues\.push\("Missing media"\);\s*/g,
    ''
  );

  // Replace launch-ready requirement.
  s=s.replace(
    /const launchReady\s*=\s*[\s\S]*?checks\.media\s*;/m,
`const launchReady =
    score >= 80 &&
    checks.verified &&
    checks.officialUrl &&
    checks.category;`
  );

  write(file,s);
}

/* 3) Readiness page wording/scoring display.
   Remove media/variant from the scoring model and explain they are optional. */
{
  const file="app/admin/readiness/page.tsx";
  let s=mustRead(file);

  s=s.replace(
    /<Metric label="Launch Ready"[\s\S]*?<Metric label="Unverified"[^>]*\/>/m,
    (m)=>m // keep metrics unchanged
  );

  s=s.replace(
    /<div><b>20<\/b><span>Verified program<\/span><\/div>[\s\S]*?<div><b>5<\/b><span>Validity or terms<\/span><\/div>/m,
`<div><b>25</b><span>Verified program</span></div>
          <div><b>25</b><span>Official redirect URL</span></div>
          <div><b>15</b><span>Description</span></div>
          <div><b>10</b><span>Category</span></div>
          <div><b>10</b><span>Occasion</span></div>
          <div><b>10</b><span>SEO title + meta</span></div>
          <div><b>5</b><span>Validity or terms</span></div>
          <div><b>0</b><span>Media / variants are optional enrichment</span></div>`
  );

  s=s.replace(
    /based on verification, official URL, content, taxonomy, media, SEO and purchase structure\./g,
    "based on verification, the official redirect URL, content, taxonomy and SEO. Media and fixed denominations are optional."
  );

  write(file,s);
}

/* 4) Remediation: do not prioritize missing media/variants.
   They can still exist as optional filters but no launch-impact priority. */
{
  const file="lib/admin/remediation.ts";
  let s=mustRead(file);

  s=s.replace(/if \(!x\.checks\.media\) priorityScore \+= 30;\s*/g,"");
  s=s.replace(/if \(!x\.checks\.variant\) priorityScore \+= 15;\s*/g,"");

  write(file,s);
}

/* 5) Sidebar: media becomes optional tooling, not a core launch concern.
   Keep route alive but remove it from the main Catalog menu. */
{
  const file="components/admin/AdminShell.tsx";
  let s=mustRead(file);

  s=s.replace(/\s*\["Media",\s*"\/admin\/media",\s*"▧"\],?\s*/g,"\n");

  write(file,s);
}

console.log("");
console.log("Done.");
console.log("- CMS VerificationEvent order uses checkedAt");
console.log("- Media/variants are no longer launch blockers");
console.log("- Readiness scoring now matches redirect-aggregator v1");
console.log("- Media route still exists, but is removed from the main sidebar");
console.log("Next: clear .next and run npm run build");
