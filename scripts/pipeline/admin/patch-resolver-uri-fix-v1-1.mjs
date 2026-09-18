import fs from "node:fs";

const file = "scripts/pipeline/admin/resolve-official-giftcard-urls-v1.ts";

if (!fs.existsSync(file)) {
  console.error(`Missing ${file}`);
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (!s.includes("function safeDecodeURIComponent")) {
  s = s.replace(
    /function decodeEntities\(s: string\) \{/,
`function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeEntities(s: string) {`
  );
}

s = s.replace(
  /const hayUrl = decodeURIComponent\(url\.pathname \+ url\.search\)\.toLowerCase\(\);/,
  'const hayUrl = safeDecodeURIComponent(url.pathname + url.search).toLowerCase();'
);

fs.writeFileSync(file, s, "utf8");

console.log("Patched resolver URI decoding.");
console.log("Malformed %-encoded URLs will no longer crash the run.");
console.log("Re-run the same PREVIEW command.");
