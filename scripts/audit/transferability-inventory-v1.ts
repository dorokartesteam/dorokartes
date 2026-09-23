import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports", "sale-readiness");
const OUTPUT_JSON = path.join(REPORT_DIR, "transferability-inventory-v1.json");
const OUTPUT_MD = path.join(REPORT_DIR, "transferability-inventory-v1.md");

function exists(rel: string) {
  return fs.existsSync(path.join(ROOT, rel));
}
function readText(rel: string) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}
function safeJson(rel: string): any | null {
  try {
    const txt = readText(rel);
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}
function walk(dir: string, maxDepth = 5, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", "dist", "build", "coverage"].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) out.push(...walk(rel, maxDepth, depth + 1));
    else out.push(rel.replace(/^\.\//, ""));
  }
  return out;
}
function extractEnvNames(files: string[]) {
  const names = new Set<string>();
  for (const rel of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) continue;
    const txt = readText(rel);
    if (!txt) continue;
    for (const m of txt.matchAll(/process\.env\.([A-Z0-9_]+)/g)) names.add(m[1]);
    for (const m of txt.matchAll(/process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) names.add(m[1]);
  }
  for (const rel of [".env.example", ".env.sample", ".env.template"]) {
    const txt = readText(rel);
    if (!txt) continue;
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (m) names.add(m[1]);
    }
  }
  return [...names].sort();
}
function prismaModels(schema: string | null) {
  return schema ? [...schema.matchAll(/^\s*model\s+([A-Za-z0-9_]+)\s*\{/gm)].map((m) => m[1]) : [];
}
function prismaEnums(schema: string | null) {
  return schema ? [...schema.matchAll(/^\s*enum\s+([A-Za-z0-9_]+)\s*\{/gm)].map((m) => m[1]) : [];
}

const files = walk(".");
const pkg = safeJson("package.json");
const prismaSchema = readText("prisma/schema.prisma");
const docs = ["README.md","HANDOVER.md","ARCHITECTURE.md","DEPLOYMENT.md","OPERATIONS.md","SECURITY.md","CONTRIBUTING.md",".env.example"];

const report = {
  generatedAt: new Date().toISOString(),
  package: pkg ? {
    name: pkg.name ?? null,
    version: pkg.version ?? null,
    packageManager: pkg.packageManager ?? null,
    engines: pkg.engines ?? null,
    scripts: pkg.scripts ?? {},
    dependencies: Object.keys(pkg.dependencies ?? {}),
    devDependencies: Object.keys(pkg.devDependencies ?? {}),
  } : null,
  detectedConfigFiles: [
    "next.config.ts","next.config.js","next.config.mjs","vercel.json","tsconfig.json",
    "tsconfig.build.json","eslint.config.mjs","middleware.ts","proxy.ts","prisma/schema.prisma",
    "pnpm-lock.yaml","package-lock.json","yarn.lock","Dockerfile","docker-compose.yml","docker-compose.yaml"
  ].filter(exists),
  envVariableNames: extractEnvNames(files),
  prisma: {
    schemaPresent: !!prismaSchema,
    models: prismaModels(prismaSchema),
    enums: prismaEnums(prismaSchema),
  },
  documentation: docs.map((file) => ({ file, exists: exists(file) })),
  appStructure: {
    app: exists("app"),
    pages: exists("pages"),
    components: exists("components"),
    lib: exists("lib"),
    scripts: exists("scripts"),
    public: exists("public"),
    prisma: exists("prisma"),
  },
  relevantFiles: files.filter((f) =>
    /^(app|pages|components|lib|prisma|scripts)\//.test(f) ||
    /^(README|HANDOVER|ARCHITECTURE|DEPLOYMENT|OPERATIONS|SECURITY|CONTRIBUTING)\.md$/i.test(f) ||
    /^(next\.config|vercel\.json|tsconfig|package\.json|pnpm-lock\.yaml|middleware|proxy)/.test(f)
  ).slice(0, 1000),
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

const md = `# Dorokartes Transferability Inventory v1

Generated: ${report.generatedAt}

## Package
- Name: ${report.package?.name ?? "N/A"}
- Version: ${report.package?.version ?? "N/A"}
- Package manager: ${report.package?.packageManager ?? "N/A"}

## Scripts
${Object.entries(report.package?.scripts ?? {}).map(([k,v]) => `- \`${k}\`: \`${v}\``).join("\n") || "- None detected"}

## Config files
${report.detectedConfigFiles.map((x) => `- ${x}`).join("\n") || "- None detected"}

## Environment variable names
${report.envVariableNames.map((x) => `- ${x}`).join("\n") || "- None detected"}

## Prisma
- Schema present: ${report.prisma.schemaPresent}
- Models: ${report.prisma.models.join(", ") || "None detected"}
- Enums: ${report.prisma.enums.join(", ") || "None detected"}

## Documentation status
${report.documentation.map((x) => `- ${x.exists ? "✅" : "❌"} ${x.file}`).join("\n")}
`;

fs.writeFileSync(OUTPUT_MD, md + "\n", "utf8");

console.log("Dorokartes Transferability Inventory v1");
console.log("======================================");
console.log(`Package: ${report.package?.name ?? "N/A"}`);
console.log(`Package manager: ${report.package?.packageManager ?? "N/A"}`);
console.log(`Env variable names: ${report.envVariableNames.length}`);
console.log(`Prisma models: ${report.prisma.models.length}`);
console.log("");
console.log("Documentation:");
for (const d of report.documentation) console.log(`${d.exists ? "YES" : "NO "}  ${d.file}`);
console.log("");
console.log(`JSON: ${OUTPUT_JSON}`);
console.log(`MD:   ${OUTPUT_MD}`);
console.log("READ-ONLY — no database or application files changed.");
