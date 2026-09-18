import fs from "node:fs";

function patchFile(file, transforms) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}`);
    process.exit(1);
  }
  let s = fs.readFileSync(file, "utf8");
  for (const [from, to] of transforms) {
    s = s.replace(from, to);
  }
  fs.writeFileSync(file, s, "utf8");
  console.log(`Patched ${file}`);
}

// MediaAsset in the real Prisma schema has no `type` field.
// Remove every use of it from the Media Center query/UI/API.
patchFile("lib/admin/media.ts", [
  [/\n\s*type:\s*true,/g, ""],
]);

patchFile("components/admin/MediaCenter.tsx", [
  [/  const \[type,setType\] = useState\("IMAGE"\);\n/g, ""],
  [/,\s*type\}\),/g, "}),"],
  [/\n\s*<label><span>Type<\/span><select value=\{type\} onChange=\{e=>setType\(e\.target\.value\)\}><option>IMAGE<\/option><option>LOGO<\/option><option>THUMBNAIL<\/option><\/select><\/label>/g, ""],
  [/\{m\.type\|\|"IMAGE"\}/g, '"MEDIA"'],
]);

patchFile("app/api/admin/media/route.ts", [
  [/\n\s*const type = String\(body\.type \|\| "IMAGE"\)\.trim\(\);/g, ""],
  [/\{ giftCardId, url, altText, type \}/g, "{ giftCardId, url, altText }"],
]);

console.log("Media schema fix complete.");
console.log("Next: remove .next cache and run npm run build");
