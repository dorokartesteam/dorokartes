import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "reports", "sale-readiness");
const OUT = path.join(OUT_DIR, "handover-source-v2.md");

function read(rel: string) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function walk(dir: string, depth = 0, maxDepth = 4): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs) || depth > maxDepth) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "build", "coverage"].includes(e.name)) continue;
    const rel = path.join(dir, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) out.push(...walk(rel, depth + 1, maxDepth));
    else out.push(rel);
  }
  return out;
}

const pkg = JSON.parse(read("package.json") || "{}");
const schema = read("prisma/schema.prisma");
const files = walk(".");
const codeFiles = files.filter(f => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));

const envUsage = new Map<string, Set<string>>();
for (const rel of codeFiles) {
  const txt = read(rel);
  for (const m of txt.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    if (!envUsage.has(m[1])) envUsage.set(m[1], new Set());
    envUsage.get(m[1])!.add(rel);
  }
  for (const m of txt.matchAll(/process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) {
    if (!envUsage.has(m[1])) envUsage.set(m[1], new Set());
    envUsage.get(m[1])!.add(rel);
  }
}

const models = [...schema.matchAll(/^\s*model\s+([A-Za-z0-9_]+)\s*\{/gm)].map(m => m[1]);
const enums = [...schema.matchAll(/^\s*enum\s+([A-Za-z0-9_]+)\s*\{/gm)].map(m => m[1]);

const routeFiles = files
  .filter(f =>
    /^app\/.+\/(page|route)\.(ts|tsx|js|jsx)$/.test(f) ||
    /^pages\/.+\.(ts|tsx|js|jsx)$/.test(f)
  )
  .sort();

const configFiles = [
  "next.config.ts","next.config.js","next.config.mjs","vercel.json",
  "tsconfig.json","tsconfig.build.json","eslint.config.mjs",
  "middleware.ts","proxy.ts","prisma/schema.prisma",
  "pnpm-lock.yaml","package-lock.json","yarn.lock"
].filter(f => fs.existsSync(path.join(ROOT, f)));

const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const integrationMatchers: [string, RegExp][] = [
  ["Prisma", /(^|\/)prisma|@prisma\//i],
  ["PostgreSQL", /(^|\/)pg$|postgres/i],
  ["Neon", /neon/i],
  ["Vercel", /vercel/i],
  ["NextAuth/Auth.js", /next-auth|auth\.js/i],
  ["Resend", /resend/i],
  ["Stripe", /stripe/i],
  ["Sentry", /sentry/i],
  ["UploadThing", /uploadthing/i],
  ["Upstash", /upstash/i],
  ["Supabase", /supabase/i],
  ["Cloudflare", /cloudflare/i],
];
const depNames = Object.keys(deps);
const integrations = integrationMatchers
  .filter(([, re]) => depNames.some(d => re.test(d)) || codeFiles.some(f => re.test(read(f))))
  .map(([name]) => name);

const readme = read("README.md");
const readmePreview = readme.split(/\r?\n/).slice(0, 160).join("\n");

const lines: string[] = [];
lines.push("# Dorokartes Handover Source v2", "");
lines.push(`Generated: ${new Date().toISOString()}`, "");

lines.push("## package.json", "");
lines.push(`- name: ${pkg.name ?? "N/A"}`);
lines.push(`- version: ${pkg.version ?? "N/A"}`);
lines.push(`- packageManager: ${pkg.packageManager ?? "N/A"}`);
lines.push(`- engines: ${JSON.stringify(pkg.engines ?? {})}`, "");

lines.push("### scripts", "");
for (const [k, v] of Object.entries(pkg.scripts ?? {})) lines.push(`- ${k}: ${v}`);
lines.push("");

lines.push("### dependencies", "");
for (const [k, v] of Object.entries(pkg.dependencies ?? {}).sort()) lines.push(`- ${k}: ${v}`);
lines.push("");

lines.push("### devDependencies", "");
for (const [k, v] of Object.entries(pkg.devDependencies ?? {}).sort()) lines.push(`- ${k}: ${v}`);
lines.push("");

lines.push("## Config files", "");
for (const f of configFiles) lines.push(`- ${f}`);
lines.push("");

lines.push("## Environment variables (names only)", "");
for (const [name, refs] of [...envUsage.entries()].sort(([a],[b]) => a.localeCompare(b))) {
  lines.push(`- ${name}`);
  for (const ref of [...refs].sort().slice(0, 8)) lines.push(`  - used in: ${ref}`);
}
lines.push("");

lines.push("## Prisma models", "");
for (const m of models) lines.push(`- ${m}`);
lines.push("");

lines.push("## Prisma enums", "");
for (const e of enums) lines.push(`- ${e}`);
lines.push("");

lines.push("## Detected integrations", "");
for (const i of integrations) lines.push(`- ${i}`);
lines.push("");

lines.push("## Routes", "");
for (const r of routeFiles) lines.push(`- ${r}`);
lines.push("");

lines.push("## README preview", "");
lines.push("```md");
lines.push(readmePreview);
lines.push("```", "");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, lines.join("\n"), "utf8");

console.log("Dorokartes Handover Source v2");
console.log("=============================");
console.log(`Scripts: ${Object.keys(pkg.scripts ?? {}).length}`);
console.log(`Env variables: ${envUsage.size}`);
console.log(`Prisma models: ${models.length}`);
console.log(`Prisma enums: ${enums.length}`);
console.log(`Routes: ${routeFiles.length}`);
console.log(`Integrations: ${integrations.join(", ") || "None detected"}`);
console.log(`Output: ${OUT}`);
console.log("READ-ONLY — no secrets collected, no database changes.");
