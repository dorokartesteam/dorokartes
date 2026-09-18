import fs from "node:fs";

const file = "scripts/pipeline/admin/resolve-official-giftcard-urls-v2.ts";
if (!fs.existsSync(file)) { console.error(`Missing ${file}`); process.exit(1); }

let s = fs.readFileSync(file, "utf8");

if (!s.includes("function explicitGiftUrl")) {
  s = s.replace(
    "function score(raw:string){",
`function explicitGiftUrl(raw:string){
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

function score(raw:string){`
  );
}

s = s.replace(
  'if(!same(r.finalUrl,base)||BAD.some(x=>dec(r.finalUrl).toLowerCase().includes(x))||!confirms(r.text))return null;',
  'if(!same(r.finalUrl,base)||BAD.some(x=>dec(r.finalUrl).toLowerCase().includes(x))||!confirms(r.text))return null;\n  if(!explicitGiftUrl(r.finalUrl))return null;'
);

s = s.replace(
  'const found=results.filter(r=>r.status==="FOUND"), unresolved=results.filter(r=>r.status!=="FOUND");',
  'const found=results.filter(r=>r.status==="FOUND" && explicitGiftUrl(r.url)), unresolved=results.filter(r=>r.status!=="FOUND" || !explicitGiftUrl(r.url));'
);

s = s.replace('console.log(`\\nResolved: ${found.length}`);', 'console.log(`\\nSafe resolved: ${found.length}`);');

fs.writeFileSync(file, s, "utf8");
console.log("Resolver v2.1 safe-apply patch installed.");
console.log("Final URL must explicitly contain gift-card/dorokarta/doroepitagi tokens.");
console.log("Run PREVIEW again before --apply.");
