import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");
const TIMEOUT_MS = 9000;
const CONCURRENCY = 6;

const POS = ["gift-card","giftcard","gift-cards","egift","e-gift","gift-voucher","giftvoucher","voucher","dorokarta","dwrokarta","doroepitagi","dwroepitagi","δωροκαρ","δωροεπιταγ"];
const BAD = ["privacy","cookie","terms","oroi","faq","support","help","login","account","wishlist","cart","checkout","blog","news","general-info","payment-method","about-e-gift","about-gift"];
const COMMON = ["/gift-card","/gift-cards","/giftcard","/egift-card","/e-gift-card","/gift-voucher","/dorokarta","/dwrokarta","/doroepitagi","/dwroepitagi"];

function dec(s:string){ try{return decodeURIComponent(s)}catch{return s} }
function host(h:string){ return h.toLowerCase().replace(/^www\./,"") }
function norm(raw?:string|null){ if(!raw)return null; try{const u=new URL(raw);u.hash="";return u.toString()}catch{return null} }
function root(raw?:string|null){ const n=norm(raw); if(!n)return true; const u=new URL(n); return (u.pathname==="/"||u.pathname==="")&&!u.search }
function same(a:string,b:string){ try{const ah=host(new URL(a).hostname),bh=host(new URL(b).hostname);return ah===bh||ah.endsWith("."+bh)||bh.endsWith("."+ah)}catch{return false} }
function dedicated(raw?:string|null){ const n=norm(raw); if(!n)return false; const h=host(new URL(n).hostname); return h.startsWith("giftcard.")||h.startsWith("gift-card.")||h.startsWith("egift.") }

function suspicious(card:any){
  const c=norm(card.officialUrl), m=norm(card.merchant?.websiteUrl);
  if(!c)return true;
  if(dedicated(c))return false;
  if(root(c))return true;
  if(m){
    const a=new URL(c),b=new URL(m);
    if(host(a.hostname)===host(b.hostname)&&a.pathname.replace(/\/+$/,"")===b.pathname.replace(/\/+$/,""))return true;
  }
  return false;
}

async function fetchText(url:string, accept="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{redirect:"follow",signal:ac.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; DorokartesBot/2.0; +https://dorokartes.gr)","accept":accept}});
    if(!r.ok)return null;
    return {text:await r.text(),finalUrl:r.url};
  }catch{return null}finally{clearTimeout(t)}
}
function strip(s:string){return s.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&amp;/gi,"&").replace(/\s+/g," ")}
function confirms(html:string){const t=dec(strip(html)).toLowerCase();return ["gift card","gift cards","e-gift","egift","gift voucher","δωροκάρτα","δωροκαρτα","δωροκάρτες","δωροκαρτες","δωροεπιταγή","δωροεπιταγη"].some(x=>t.includes(x))}
function explicitGiftUrl(raw:string){
  try{
    const u=new URL(raw);
    const h=dec(u.pathname+u.search).toLowerCase();
    return [
      "gift-card","giftcard","gift-cards","egift","e-gift",
      "gift-voucher","giftvoucher",
      "dorokarta","dwrokarta","doro-karta","dwro-karta",
      "doroepitagi","dwroepitagi","δωροκαρ","δωροεπιταγ"
    ].some(x=>h.includes(x));
  }catch{return false}
}

function score(raw:string){try{const u=new URL(raw),h=dec(u.pathname+u.search).toLowerCase();let s=0;for(const p of POS)if(h.includes(p))s+=45;for(const p of BAD)if(h.includes(p))s-=120;if(/\/(product|products|shop|buy|collections?|product-category|category|cat|p|c)\//i.test(u.pathname))s+=35;if(u.pathname==="/")s-=100;return s}catch{return -999}}
function links(html:string,base:string){const out=new Set<string>();const re=/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))){try{const u=new URL(m[1],base).toString(),txt=dec(strip(m[2])).toLowerCase(),uh=dec(u).toLowerCase();if(POS.some(p=>uh.includes(p))||["gift card","gift cards","gift voucher","δωροκάρτα","δωροκάρτες","δωροεπιταγή"].some(p=>txt.includes(p)))out.add(u)}catch{}}return [...out]}
function locs(xml:string){const out:string[]=[];const re=/<loc>\s*([^<]+?)\s*<\/loc>/gi;let m;while((m=re.exec(xml)))out.push(m[1].replace(/&amp;/g,"&").trim());return out}

async function sitemapCandidates(base:string){
  const origin=new URL(base).origin, queue=[origin+"/sitemap.xml",origin+"/sitemap_index.xml"], seen=new Set<string>(), out=new Set<string>();
  const robots=await fetchText(origin+"/robots.txt","text/plain,*/*");
  if(robots)for(const line of robots.text.split(/\r?\n/)){const m=line.match(/^\s*Sitemap:\s*(\S+)/i);if(m)queue.push(m[1])}
  while(queue.length&&seen.size<6){
    const sm=queue.shift()!; if(seen.has(sm))continue; seen.add(sm);
    const r=await fetchText(sm,"application/xml,text/xml,*/*"); if(!r)continue;
    for(const loc of locs(r.text).slice(0,2500)){
      const l=dec(loc).toLowerCase();
      if((loc.endsWith(".xml")||l.includes("sitemap"))&&seen.size+queue.length<6){queue.push(loc);continue}
      if(POS.some(p=>l.includes(p))&&same(loc,base))out.add(loc);
    }
  }
  return [...out];
}

async function validate(url:string,base:string){
  if(!same(url,base)||BAD.some(x=>dec(url).toLowerCase().includes(x)))return null;
  const r=await fetchText(url); if(!r)return null;
  if(!same(r.finalUrl,base)||BAD.some(x=>dec(r.finalUrl).toLowerCase().includes(x))||!confirms(r.text))return null;
  if(!explicitGiftUrl(r.finalUrl))return null;
  const s=score(r.finalUrl); return s>=45?{url:r.finalUrl,score:s}:null;
}

async function resolve(card:any){
  const base=norm(card.merchant?.websiteUrl)||norm(card.officialUrl); if(!base)return {card,status:"NO_BASE"};
  const raw=new Set<string>(); const home=await fetchText(base);
  if(home)for(const x of links(home.text,home.finalUrl))raw.add(x);
  for(const x of await sitemapCandidates(base))raw.add(x);
  const origin=new URL(base).origin; for(const p of COMMON)raw.add(origin+p);
  const ranked=[...raw].filter(x=>same(x,base)).map(url=>({url,score:score(url)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,18);
  for(const c of ranked){const v=await validate(c.url,base);if(v)return {card,status:"FOUND",...v}}
  return {card,status:"UNRESOLVED"};
}

async function main(){
  const cards=await prisma.giftCard.findMany({include:{merchant:true}});
  const todo=cards.filter(suspicious);
  console.log(`Mode: ${APPLY?"APPLY":"PREVIEW"}`);
  console.log(`Total gift cards: ${cards.length}`);
  console.log(`Suspicious to inspect: ${todo.length}`);
  console.log(`Dedicated gift-card roots treated as valid: ${cards.filter((c:any)=>dedicated(c.officialUrl)).length}`);
  const results:any[]=[];
  for(let i=0;i<todo.length;i+=CONCURRENCY){results.push(...await Promise.all(todo.slice(i,i+CONCURRENCY).map(resolve)));console.log(`Checked ${Math.min(i+CONCURRENCY,todo.length)}/${todo.length}`)}
  const found=results.filter(r=>r.status==="FOUND" && explicitGiftUrl(r.url)), unresolved=results.filter(r=>r.status!=="FOUND" || !explicitGiftUrl(r.url));
  console.log("\nRESOLVED\n========");
  for(const r of found)console.log(`${r.card.merchant?.name} | ${r.card.officialUrl||"-"} -> ${r.url} | score=${r.score} | ${r.card.id}`);
  console.log(`\nSafe resolved: ${found.length}`);
  console.log(`Unresolved: ${unresolved.length}`);
  if(!APPLY){console.log("PREVIEW ONLY — database unchanged.");return}
  let updated=0;
  for(const r of found){await prisma.giftCard.update({where:{id:r.card.id},data:{officialUrl:r.url,verificationStatus:"NEEDS_REVIEW"}});updated++;console.log(`UPDATED | ${r.card.merchant?.name} | ${r.url}`)}
  console.log(`Updated: ${updated}`);
  console.log("Updated cards were intentionally set to NEEDS_REVIEW, not VERIFIED.");
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>{await prisma.$disconnect()});
