import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root=process.cwd();
const payload=path.join(root,"payload");

function copyDir(src,dst){
  fs.mkdirSync(dst,{recursive:true});
  for(const e of fs.readdirSync(src,{withFileTypes:true})){
    const s=path.join(src,e.name), d=path.join(dst,e.name);
    if(e.isDirectory()) copyDir(s,d); else fs.copyFileSync(s,d);
  }
}

copyDir(payload,root);

const patchFile="lib/public/patch-logo-select-v2-4-1.mjs";
const r=spawnSync(process.execPath,[patchFile],{stdio:"inherit"});
if(r.status!==0) process.exit(r.status||1);
fs.rmSync(path.join(root,patchFile),{force:true});

const cssTarget=path.join(root,"app","public-v2-0.css");
const cssSource=path.join(root,"app","v2-4-1-logo-size.css");

if(!fs.existsSync(cssTarget)){
  console.error("Missing app/public-v2-0.css");
  process.exit(1);
}

const start="/* === DOROKARTES V2.4.1 START === */";
const end="/* === DOROKARTES V2.4.1 END === */";

let css=fs.readFileSync(cssTarget,"utf8");
const a=css.indexOf(start), b=css.indexOf(end);
if(a!==-1 && b!==-1 && b>a){
  css=css.slice(0,a)+css.slice(b+end.length);
}
css += `\n${start}\n${fs.readFileSync(cssSource,"utf8")}\n${end}\n`;
fs.writeFileSync(cssTarget,css,"utf8");

fs.rmSync(cssSource,{force:true});
fs.rmSync(payload,{recursive:true,force:true});

console.log("Dorokartes Public v2.4.1 logo data + size fix installed.");
