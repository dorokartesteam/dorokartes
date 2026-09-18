import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const payload=path.join(root,"dorokartes-admin-v3-8-2-payload");

if(!fs.existsSync(payload)){
  console.error("Extract ZIP at D:\\dorokartes first.");
  process.exit(1);
}

const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const backup=path.join(path.dirname(root),`dorokartes-admin-backup-v3-8-2-${stamp}`);

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

const currentAdmin=path.join(root,"app/admin");
if(fs.existsSync(currentAdmin)) copy(currentAdmin,path.join(backup,"app/admin"));

copy(payload,root);

/* Remove the four stacked scale/override files from the active project.
   Their backups remain outside the project. */
for(const name of [
  "typography-polish.css",
  "ui-readability.css",
  "ui-large.css",
  "nav-cleanup-large.css",
  "ui-balanced-scale.css"
]){
  fs.rmSync(path.join(root,"app/admin",name),{force:true});
}

fs.rmSync(payload,{recursive:true,force:true});

console.log(`Backup outside project: ${backup}`);
console.log("Clean admin scale reset installed.");
console.log("Removed old stacked typography/scale overrides.");
console.log("One final scale file is active: app/admin/admin-scale.css");
console.log("Next: clear .next and run npm run build");
