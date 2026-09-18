import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { getDomain } from "tldts";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "discovery", "google");
const HITS_FILE = path.join(OUT_DIR, "google-serper-hits-v1.csv");
const REPORT_FILE = path.join(OUT_DIR, "google-serper-query-lab-v2.csv");

const API_KEY = process.env.SERPER_API_KEY || "";
const budgetArg = process.argv.find((x) => x.startsWith("--budget="));
const BUDGET = Math.max(1, Number(budgetArg?.split("=")[1] || "60"));
const RESULTS_PER_PAGE = 10;
const DELAY_MS = 350;

const BLOCKED = [
  "google.com","youtube.com","facebook.com","instagram.com","linkedin.com",
  "tiktok.com","pinterest.com","x.com","twitter.com","wikipedia.org",
  "bestprice.gr","skroutz.gr","kouponia365.gr","vrisko.gr","xo.gr",
  "reddit.com","tripadvisor.com","booking.com","amazon.com","ebay.com"
];

const PACKS: Record<string, string[]> = {
  exact_generic: [
    'site:.gr "δωροκάρτα"',
    'site:.gr "gift card"',
    'site:.gr "δωροεπιταγή"',
    '"δωροκάρτα" Ελλάδα',
    '"gift card" Ελλάδα',
  ],

  commercial_intent: [
    'site:.gr intitle:"gift card"',
    'site:.gr intitle:"δωροκάρτα"',
    'site:.gr inurl:gift-card',
    'site:.gr inurl:giftcard',
    'site:.gr inurl:dorokarta',
    'site:.gr "αγορά gift card"',
    'site:.gr "αγορά δωροκάρτας"',
    'site:.gr "buy gift card"',
    'site:.gr "gift voucher"',
    'site:.gr "e-gift"',
  ],

  category_longtail: [
    'site:.gr fashion "gift card"',
    'site:.gr παπούτσια "δωροκάρτα"',
    'site:.gr κοσμήματα "gift card"',
    'site:.gr καλλυντικά "δωροκάρτα"',
    'site:.gr spa "gift card"',
    'site:.gr ξενοδοχείο "gift card"',
    'site:.gr εστιατόριο "gift card"',
    'site:.gr παιδικά "gift card"',
    'site:.gr βιβλία "δωροκάρτα"',
    'site:.gr παιχνίδια "gift card"',
    'site:.gr αθλητικά "δωροκάρτα"',
    'site:.gr τεχνολογία "gift card"',
    'site:.gr λουλούδια "δωροκάρτα"',
    'site:.gr εμπειρίες "gift card"',
    'site:.gr κομμωτήριο "gift card"',
  ],

  page_language: [
    'site:.gr "Gift Cards"',
    'site:.gr "Gift Voucher"',
    'site:.gr "Δωροκάρτες"',
    'site:.gr "Δωροεπιταγές"',
    'site:.gr "Χάρισε" "gift card"',
    'site:.gr "κάρτα δώρου"',
    'site:.gr "δώρα" "gift card"',
    'site:.gr "δώρο" "voucher"',
    'site:.gr "gift certificate"',
    'site:.gr "eGift"',
  ],

  eu_greece: [
    '"gift card" "Greece" shop',
    '"gift card" "Greece" official',
    '"gift card" "Ελλάδα" brand',
    '"δωροκάρτα" brand Ελλάδα',
    '"gift card" "Athens" shop',
    '"gift voucher" Greece official',
    '"e-gift card" Greece',
    '"digital gift card" Greece',
    '"gift card" ελληνικό κατάστημα',
    '"δωροκάρτα" e-shop',
  ],
};

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

function existingDomains(){
  const out=new Set<string>();
  if(!fs.existsSync(HITS_FILE)) return out;
  const raw=fs.readFileSync(HITS_FILE,"utf8").replace(/^\uFEFF/,"");
  const m=parseCsv(raw); const headers=m.shift()||[];
  const di=headers.indexOf("domain");
  for(const r of m){
    const d=(r[di]||"").trim().toLowerCase();
    if(d) out.add(d);
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

async function search(q:string){
  const res=await fetch("https://google.serper.dev/search",{
    method:"POST",
    headers:{"X-API-KEY":API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({q,gl:"gr",hl:"el",num:RESULTS_PER_PAGE,page:1}),
  });
  const txt=await res.text();
  if(!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0,300)}`);
  return JSON.parse(txt);
}

async function main(){
  if(!API_KEY) throw new Error("SERPER_API_KEY missing in .env");

  console.log("Dorokartes Google Query Lab v2");
  console.log("==============================");
  console.log(`Test budget: ${BUDGET} credits/calls`);
  console.log("Pages/query: 1");
  console.log("Goal: maximize NEW candidate domains per API call");
  console.log("");

  const baseline=existingDomains();
  const discoveredThisRun=new Set<string>();
  const report:Record<string,unknown>[]=[];
  let calls=0;

  const allQueries = Object.entries(PACKS)
    .flatMap(([pack,qs])=>qs.map(q=>({pack,q})));

  for(const item of allQueries){
    if(calls>=BUDGET) break;

    console.log(`[${calls+1}/${BUDGET}] ${item.pack} :: ${item.q}`);

    try{
      const data=await search(item.q);
      calls++;

      const organic=Array.isArray(data.organic)?data.organic:[];
      const domains=new Set<string>();
      const giftDomains=new Set<string>();
      const newDomains=new Set<string>();

      for(const r of organic){
        const url=String(r?.link||"").trim();
        const d=domainFromUrl(url);
        if(!d || blocked(d)) continue;
        domains.add(d);

        const sig=giftSignal(`${r?.title||""} ${r?.snippet||""} ${url}`);
        if(sig) giftDomains.add(d);

        if(!baseline.has(d) && !discoveredThisRun.has(d)){
          newDomains.add(d);
        }
      }

      for(const d of newDomains) discoveredThisRun.add(d);

      console.log(
        `  domains=${domains.size} gift=${giftDomains.size} NEW=${newDomains.size}` +
        (newDomains.size ? ` -> ${[...newDomains].join(", ")}` : "")
      );

      report.push({
        pack:item.pack,
        query:item.q,
        organic_results:organic.length,
        unique_domains:domains.size,
        gift_signal_domains:giftDomains.size,
        new_domains:newDomains.size,
        new_domain_list:[...newDomains].join(" | "),
      });

    }catch(e){
      console.error("  ERROR", e instanceof Error ? e.message : e);
      report.push({
        pack:item.pack, query:item.q, organic_results:0, unique_domains:0,
        gift_signal_domains:0, new_domains:0, new_domain_list:"",
      });
      if(/401|403|429|quota|credit|limit/i.test(String(e))) break;
    }

    await sleep(DELAY_MS);
  }

  writeCsv(REPORT_FILE,report,[
    "pack","query","organic_results","unique_domains",
    "gift_signal_domains","new_domains","new_domain_list"
  ]);

  const packStats = new Map<string,{calls:number,newDomains:number,giftDomains:number,domains:number}>();
  for(const r of report){
    const p=String(r.pack);
    const x=packStats.get(p)||{calls:0,newDomains:0,giftDomains:0,domains:0};
    x.calls++;
    x.newDomains+=Number(r.new_domains||0);
    x.giftDomains+=Number(r.gift_signal_domains||0);
    x.domains+=Number(r.unique_domains||0);
    packStats.set(p,x);
  }

  console.log("");
  console.log("=== PACK SCORE ===");
  for(const [pack,x] of [...packStats.entries()].sort((a,b)=>
    (b[1].newDomains/b[1].calls)-(a[1].newDomains/a[1].calls)
  )){
    console.log(
      `${pack}: calls=${x.calls}, new=${x.newDomains}, new/call=${(x.newDomains/x.calls).toFixed(2)}, gift/call=${(x.giftDomains/x.calls).toFixed(2)}`
    );
  }

  const topQueries=[...report]
    .sort((a,b)=>Number(b.new_domains)-Number(a.new_domains))
    .slice(0,15);

  console.log("");
  console.log("=== TOP QUERIES ===");
  for(const r of topQueries){
    console.log(`NEW=${r.new_domains} | ${r.pack} | ${r.query}`);
  }

  console.log("");
  console.log(`Calls used: ${calls}`);
  console.log(`Net-new domains found in test: ${discoveredThisRun.size}`);
  console.log(`Report: ${REPORT_FILE}`);
}

main().catch(e=>{ console.error(e); process.exitCode=1; });
