import fs from "node:fs/promises";
import path from "node:path";

async function main(){
 const root=process.cwd();
 const page=await fs.readFile(path.join(root,"app","kaliteres-dorokartes","page.tsx"),"utf8");
 const sitemap=await fs.readFile(path.join(root,"app","sitemap.ts"),"utf8");
 const checks={
  route:page.includes("BestGiftCardsPage"),
  activeVerified:page.includes('status: "ACTIVE"')&&page.includes('verificationStatus: "VERIFIED"'),
  cardGrid:page.includes("<GiftCardCard"),
  canonical:page.includes("canonical: pagePath"),
  robots:page.includes("index: true")&&page.includes("follow: true"),
  jsonLd:page.includes('type="application/ld+json"'),
  collection:page.includes('"@type": "CollectionPage"'),
  itemList:page.includes('"@type": "ItemList"'),
  faq:page.includes('"@type": "FAQPage"'),
  breadcrumbs:page.includes('"@type": "BreadcrumbList"'),
  safeJson:page.includes('replace(/</g, "\\u003c")'),
  noOffer:!page.includes('"@type": "Offer"'),
  disclaimer:page.includes("δεν πουλά δωροκάρτες"),
  noFakeRanking:page.includes("δεν αποτελούν αντικειμενική κατάταξη"),
  sitemap:sitemap.includes('`${base}/kaliteres-dorokartes`'),
 };
 console.table(checks);
 if(Object.values(checks).some(v=>v!==true)) throw new Error("STOP: flagship landing checks failed.");
 console.log("PASS: flagship landing v1 checks passed.");
}
main().catch((e)=>{console.error(e);process.exitCode=1;});
