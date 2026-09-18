import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const payload=path.join(root,"dorokartes-premium-admin-v3-3-payload");
if(!fs.existsSync(payload)){console.error("Extract ZIP at D:\\dorokartes first.");process.exit(1)}

const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const backup=path.join(path.dirname(root),`dorokartes-admin-backup-v3-3-${stamp}`);

function copy(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const e of fs.readdirSync(from,{withFileTypes:true})){
    const a=path.join(from,e.name),b=path.join(to,e.name);
    if(e.isDirectory())copy(a,b);else{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b)}
  }
}
for(const rel of ["app/admin","app/api/admin","components/admin","lib/admin","public/brand"]){
  const src=path.join(root,rel);
  if(fs.existsSync(src))copy(src,path.join(backup,rel));
}
copy(payload,root);
fs.rmSync(payload,{recursive:true,force:true});

console.log(`Backup outside project: ${backup}`);
console.log("Premium Admin v3.3 Brand + Ops installed.");
console.log("Payload removed.");
console.log("Next: npm run build");
