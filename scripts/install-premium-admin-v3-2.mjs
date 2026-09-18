import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const payload=path.join(root,"dorokartes-premium-admin-v3-2-payload");
if(!fs.existsSync(payload)){console.error("Extract ZIP at D:\\dorokartes first.");process.exit(1)}

const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const backupRoot=path.join(path.dirname(root),`dorokartes-admin-backup-v3-2-${stamp}`);

function copy(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const e of fs.readdirSync(from,{withFileTypes:true})){
    const a=path.join(from,e.name),b=path.join(to,e.name);
    if(e.isDirectory())copy(a,b);else{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b)}
  }
}
for(const rel of ["app/admin","app/api/admin","components/admin","lib/admin"]){
  const src=path.join(root,rel);
  if(fs.existsSync(src))copy(src,path.join(backupRoot,rel));
}
copy(payload,root);

// add links to detail pages in the current list views, conservatively
const merchants=path.join(root,"app/admin/merchants/page.tsx");
if(fs.existsSync(merchants)){
  let s=fs.readFileSync(merchants,"utf8");
  if(!s.includes('href={`/admin/merchants/${m.id}`}')){
    s=s.replace('<b>{m.name}</b><small>{m.slug}</small>', '<a className="dk-entitylink" href={`/admin/merchants/${m.id}`}><b>{m.name}</b><small>{m.slug}</small></a>');
  }
  fs.writeFileSync(merchants,s);
}
const cards=path.join(root,"app/admin/gift-cards/page.tsx");
if(fs.existsSync(cards)){
  let s=fs.readFileSync(cards,"utf8");
  if(!s.includes('href={`/admin/gift-cards/${c.id}`}')){
    s=s.replace('<b>{c.merchant?.name || "Unknown"}</b><small>{c.title}</small>', '<a className="dk-entitylink" href={`/admin/gift-cards/${c.id}`}><b>{c.merchant?.name || "Unknown"}</b><small>{c.title}</small></a>');
  }
  fs.writeFileSync(cards,s);
}

fs.rmSync(payload,{recursive:true,force:true});
console.log(`Backup created OUTSIDE project: ${backupRoot}`);
console.log("Premium Admin v3.2 CMS installed.");
console.log("Payload folder removed to avoid TypeScript scanning.");
console.log("Next: npm run build");
