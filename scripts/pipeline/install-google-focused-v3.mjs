import fs from "node:fs";
const p="package.json";
const pkg=JSON.parse(fs.readFileSync(p,"utf8"));
pkg.scripts??={};
pkg.scripts["pipeline:harvest-google-focused"]="tsx scripts/pipeline/discovery/harvest-google-focused-v3.ts";
fs.writeFileSync(p,JSON.stringify(pkg,null,2)+"\n");
console.log("Installed pipeline:harvest-google-focused");
