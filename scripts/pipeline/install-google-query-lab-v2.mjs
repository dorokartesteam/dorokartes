import fs from "node:fs";
const p="package.json";
const pkg=JSON.parse(fs.readFileSync(p,"utf8"));
pkg.scripts??={};
pkg.scripts["pipeline:google-query-lab"]="tsx scripts/pipeline/discovery/google-query-lab-v2.ts";
fs.writeFileSync(p,JSON.stringify(pkg,null,2)+"\n");
console.log("Installed pipeline:google-query-lab");
