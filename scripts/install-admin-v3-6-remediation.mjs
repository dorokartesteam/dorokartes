import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const payload=path.join(root,"dorokartes-admin-v3-6-payload");

if(!fs.existsSync(payload)){
  console.error("Extract ZIP at D:\\dorokartes first.");
  process.exit(1);
}

const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const backup=path.join(path.dirname(root),`dorokartes-admin-backup-v3-6-${stamp}`);

function copy(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const e of fs.readdirSync(from,{withFileTypes:true})){
    const a=path.join(from,e.name),b=path.join(to,e.name);
    if(e.isDirectory()) copy(a,b);
    else{
      fs.mkdirSync(path.dirname(b),{recursive:true});
      fs.copyFileSync(a,b);
    }
  }
}

for(const rel of ["app/admin","components/admin","lib/admin"]){
  const src=path.join(root,rel);
  if(fs.existsSync(src)) copy(src,path.join(backup,rel));
}

copy(payload,root);
fs.rmSync(payload,{recursive:true,force:true});

console.log(`Backup outside project: ${backup}`);
console.log("Admin v3.6 Remediation Center installed.");
console.log("Next: npm run build");
