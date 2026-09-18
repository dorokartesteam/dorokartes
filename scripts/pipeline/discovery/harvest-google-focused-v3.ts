import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getDomain } from "tldts";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "discovery", "google");
const BASE_HITS = path.join(OUT_DIR, "google-serper-hits-v1.csv");
const LAB_REPORT = path.join(OUT_DIR, "google-serper-query-lab-v2.csv");
const OUT_HITS = path.join(OUT_DIR, "google-serper-focused-hits-v3.csv");
const OUT_DOMAINS = path.join(OUT_DIR, "google-serper-focused-domains-v3.csv");

const API_KEY = process.env.SERPER_API_KEY || "";
const budgetArg = process.argv.find((x) => x.startsWith("--budget="));
const BUDGET = Math.max(1, Number(budgetArg?.split("=")[1] || "200"));
const pagesArg = process.argv.find((x) => x.startsWith("--pages="));
const PAGES = Math.max(1, Math.min(5, Number(pagesArg?.split("=")[1] || "2")));
const DELAY_MS = Math.max(200, Number(process.env.GOOGLE_HARVEST_DELAY_MS || "350"));

const BLOCKED = [
  "google.com","youtube.com","facebook.com","instagram.com","linkedin.com",
  "tiktok.com","pinterest.com","x.com","twitter.com","wikipedia.org",
  "bestprice.gr","skroutz.gr","kouponia365.gr","vrisko.gr","xo.gr",
  "reddit.com","tripadvisor.com","tripadvisor.com.gr","booking.com",
  "amazon.com","ebay.com","quora.com","yelp.com","blogspot.gr","blogspot.com",
  "aade.gr","piraeusbank.gr","visa.gr","mastercard.gr","businesswire.com",
  "ons.gov.uk","ot.gr","ekkomed.gr","mindigital.gr","revolut.com",
  "freelancer.gr","kethea.gr"
];

const QUERY_PACK = [
  // Highest-yield categories from lab + expanded siblings
  'site:.gr spa "gift card"',
  'site:.gr massage "gift card"',
  'site:.gr wellness "gift card"',
  'site:.gr αισθητική "gift card"',
  'site:.gr κομμωτήριο "gift card"',
  'site:.gr nail "gift card"',
  'site:.gr beauty salon "gift card"',

  'site:.gr εστιατόριο "gift card"',
  'site:.gr restaurant "gift card"',
  'site:.gr fine dining "gift card"',
  'site:.gr brunch "gift card"',
  'site:.gr bar "gift card"',

  'site:.gr ξενοδοχείο "gift card"',
  'site:.gr hotel "gift card"',
  'site:.gr resort "gift card"',
  'site:.gr boutique hotel "gift card"',
  'site:.gr villa "gift card"',

  'site:.gr κοσμήματα "gift card"',
  'site:.gr jewelry "gift card"',
  'site:.gr ρολόγια "gift card"',
  'site:.gr accessories "gift card"',

  'site:.gr fashion "gift card"',
  'site:.gr ρούχα "gift card"',
  'site:.gr παπούτσια "gift card"',
  'site:.gr lingerie "gift card"',
  'site:.gr παιδικά "gift card"',

  'site:.gr βιβλία "δωροκάρτα"',
  'site:.gr βιβλιοπωλείο "gift card"',
  'site:.gr παιχνίδια "gift card"',
  'site:.gr gaming "gift card"',

  'site:.gr λουλούδια "δωροκάρτα"',
  'site:.gr ανθοπωλείο "gift card"',
  'site:.gr δώρα "gift card"',
  'site:.gr delicatessen "gift card"',
  'site:.gr κρασί "gift card"',
  'site:.gr wine "gift card"',

  'site:.gr αθλητικά "gift card"',
  'site:.gr fitness "gift card"',
  'site:.gr yoga "gift card"',
  'site:.gr outdoor "gift card"',

  'site:.gr εμπειρίες "gift card"',
  'site:.gr travel "gift card"',
  'site:.gr ταξίδια "gift card"',
  'site:.gr δραστηριότητες "gift card"',

  // Proven commercial-intent language
  'site:.gr "gift voucher"',
  'site:.gr "buy gift card"',
  'site:.gr "αγορά gift card"',
  'site:.gr "αγορά δωροκάρτας"',
  'site:.gr "κάρτα δώρου"',
  'site:.gr "δώρο" "voucher"',
  'site:.gr "Χάρισε" "gift card"',
  'site:.gr "gift certificate"',
  'site:.gr "e-gift"',
  'site:.gr "digital gift card"',

  // URL/title patterns, but more constrained than lab
  'site:.gr intitle:"gift card" shop',
  'site:.gr intitle:"δωροκάρτα" shop',
  'site:.gr inurl:gift-card "€"',
  'site:.gr inurl:giftcard "€"',
  'site:.gr inurl:dorokarta "€"',

  // Greece + international brands
  '"digital gift card" Greece shop',
  '"gift voucher" Greece shop',
  '"gift card" Athens shop',
  '"gift card" Thessaloniki shop',
  '"gift card" Greece hotel',
  '"gift card" Greece spa',
  '"gift card" Greece restaurant',
];

function sleep(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

function parseCsv(text:string): string[][] {
  const rows:string[][]=[]; let row:string[]=[]; let field=""; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch === '"'){
        if(text[i+1] === '"'){ field+='"'; i++; } else quoted=false;
      } else field+=ch;
      continue;
    }
    if(ch === '"') quoted=true;
    else if(ch === ","){ row.push(field); field=""; }
    else if(ch === "\n"){ row.push(field.replace(/\r$/,"")); rows.push(row); row=[]; field=""; }
    else field+=ch;
  }
  if(field.length || row.length){ row.push(field.replace(/\r$/,"")); rows.push(row); }
  return rows.filter(r=>r.some(v=>v.trim()));
}

function csvEscape(v:unknown){
  const s=String(v??"");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function writeCsv(file:string, rows:Record<string,unknown>[], headers:string[]){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,
    "\uFEFF"+[
      headers.map(csvEscape).join(","),
      ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(","))
    ].join("\n")+"\n","utf8");
}

function loadDomains(file:string){
  const out=new Set<string>();
  if(!fs.existsSync(file)) return out;
  const raw=fs.readFileSync(file,"utf8").replace(/^\uFEFF/,"");
  const m=parseCsv(raw); const h=m.shift()||[];
  let di=h.indexOf("domain");
  if(di < 0) di=h.indexOf("new_domain_list");
  if(di < 0) return out;
  for(const r of m){
    const val=(r[di]||"").trim();
    if(!val) continue;
    for(const d of val.split("|").map(x=>x.trim()).filter(Boolean)) out.add(d.toLowerCase());
  }
  return out;
}

function domainFromUrl(raw:string){
  try{
    const host=new URL(raw).hostname.toLowerCase().replace(/^www\./,"");
    return getDomain(host,{allowPrivateDomains:true}) || host;
  }catch{ return ""; }
}

function blocked(d:string){
  return BLOCKED.some(b=>d===b || d.endsWith("."+b));
}

function giftSignal(text:string){
  return /gift\s*-?\s*card|giftcard|e-?gift|δωροκάρ|δωροκαρ|δωροεπιταγ|gift voucher|gift certificate|voucher δώρου/i.test(text);
}

function merchantish(text:string){
  // Cheap noise screen only; intentionally permissive.
  return !/(news|article|blog|forum|government|ministry|pdf|law|statistics|press release)/i.test(text);
}

async function search(q:string,page:number){
  const res=await fetch("https://google.serper.dev/search",{
    method:"POST",
    headers:{"X-API-KEY":API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({q,gl:"gr",hl:"el",num:10,page}),
  });
  const txt=await res.text();
  if(!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0,300)}`);
  return JSON.parse(txt);
}

async function main(){
  if(!API_KEY) throw new Error("SERPER_API_KEY missing in .env");

  console.log("Dorokartes Google Focused Harvester v3");
  console.log("======================================");
  console.log(`Budget: ${BUDGET} calls`);
  console.log(`Pages/query: ${PAGES}`);
  console.log(`Query pack: ${QUERY_PACK.length}`);
  console.log("OpenAI calls: 0");
  console.log("");

  const baseline=loadDomains(BASE_HITS);
  for(const d of loadDomains(LAB_REPORT)) baseline.add(d);

  const hits:Record<string,unknown>[]=[];
  const newDomains=new Map<string,{
    domain:string,hits:number,giftHits:number,sampleUrl:string,sampleTitle:string,queries:Set<string>
  }>();

  let calls=0, organicCount=0, errors=0;

  outer:
  for(const q of QUERY_PACK){
    for(let page=1;page<=PAGES;page++){
      if(calls>=BUDGET) break outer;

      console.log(`[${calls+1}/${BUDGET}] p${page} ${q}`);

      try{
        const data=await search(q,page);
        calls++;
        const organic=Array.isArray(data.organic)?data.organic:[];
        organicCount+=organic.length;

        const callNew=new Set<string>();

        for(let i=0;i<organic.length;i++){
          const r=organic[i]||{};
          const url=String(r.link||"").trim();
          const title=String(r.title||"").trim();
          const snippet=String(r.snippet||"").trim();
          const d=domainFromUrl(url);
          if(!d || blocked(d)) continue;

          const sig=giftSignal(`${title} ${snippet} ${url}`);
          if(!sig) continue;
          if(!merchantish(`${title} ${snippet}`)) continue;

          hits.push({
            domain:d,url,title,snippet,query:q,page,position:i+1
          });

          if(!baseline.has(d)){
            callNew.add(d);
            let x=newDomains.get(d);
            if(!x){
              x={domain:d,hits:0,giftHits:0,sampleUrl:url,sampleTitle:title,queries:new Set()};
              newDomains.set(d,x);
            }
            x.hits++;
            x.giftHits++;
            x.queries.add(q);
          }
        }

        console.log(
          `  NEW=${callNew.size}` +
          (callNew.size ? ` -> ${[...callNew].join(", ")}` : "")
        );
      }catch(e){
        errors++;
        console.error("  ERROR", e instanceof Error ? e.message : e);
        if(/401|403|429|quota|credit|limit/i.test(String(e))) break outer;
      }

      await sleep(DELAY_MS);
    }
  }

  const domainRows=[...newDomains.values()]
    .sort((a,b)=>b.giftHits-a.giftHits || b.hits-a.hits || a.domain.localeCompare(b.domain))
    .map(x=>({
      domain:x.domain,
      hits:x.hits,
      gift_hits:x.giftHits,
      query_count:x.queries.size,
      sample_title:x.sampleTitle,
      sample_url:x.sampleUrl,
      queries:[...x.queries].join(" | ")
    }));

  writeCsv(OUT_HITS,hits,["domain","url","title","snippet","query","page","position"]);
  writeCsv(OUT_DOMAINS,domainRows,[
    "domain","hits","gift_hits","query_count","sample_title","sample_url","queries"
  ]);

  console.log("");
  console.log("======================================");
  console.log(`Calls used: ${calls}`);
  console.log(`Organic results: ${organicCount}`);
  console.log(`Net-new gift-signal domains: ${domainRows.length}`);
  console.log(`Errors: ${errors}`);
  console.log(`Domains CSV: ${OUT_DOMAINS}`);
  console.log(`Hits CSV: ${OUT_HITS}`);
  console.log("OpenAI calls: 0");
}

main().catch(e=>{ console.error(e); process.exitCode=1; });
