import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const payload=path.join(root,"dorokartes-admin-v3-3-1-payload");

if(!fs.existsSync(payload)){
  console.error("Extract ZIP at D:\\dorokartes first.");
  process.exit(1);
}

const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const backup=path.join(path.dirname(root),`dorokartes-admin-backup-v3-3-1-${stamp}`);

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

const adminLayout=path.join(root,"app/admin/layout.tsx");
if(fs.existsSync(adminLayout)){
  const dest=path.join(backup,"app/admin/layout.tsx");
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(adminLayout,dest);
}

copy(payload,root);
fs.rmSync(payload,{recursive:true,force:true});

console.log(`Backup outside project: ${backup}`);
console.log("Admin typography polish v3.3.1 installed.");
console.log("Next: npm run build");
