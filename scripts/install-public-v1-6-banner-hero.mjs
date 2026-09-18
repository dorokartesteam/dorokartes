import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const payload = path.join(root, "payload");

if (!fs.existsSync(payload)) {
  console.error("Missing payload folder. Extract ZIP into project root.");
  process.exit(1);
}

function copyDir(src,dst){
  fs.mkdirSync(dst,{recursive:true});

  for(const e of fs.readdirSync(src,{withFileTypes:true})){
    const s=path.join(src,e.name);
    const d=path.join(dst,e.name);

    if(e.isDirectory()) copyDir(s,d);
    else fs.copyFileSync(s,d);
  }
}

copyDir(payload,root);

const patchFile="app/patch-layout-v1-6.mjs";
const r=spawnSync(process.execPath,[patchFile],{stdio:"inherit"});

if(r.status!==0) process.exit(r.status||1);

fs.rmSync(path.join(root,patchFile),{force:true});
fs.rmSync(payload,{recursive:true,force:true});

console.log("Dorokartes Public v1.6 banner hero installed.");
