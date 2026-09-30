import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const pageDir = path.join(root, "app", "kaliteres-dorokartes");
const pageFile = path.join(pageDir, "page.tsx");
const sitemapFile = path.join(root, "app", "sitemap.ts");
const templateFile = path.join(root, "scripts", "seo", "kaliteres-dorokartes-page-v1.template.tsx");

async function main() {
  const pageTemplate = await fs.readFile(templateFile, "utf8");
  const sitemap = await fs.readFile(sitemapFile, "utf8");
  const anchor = '    { url: `${base}/browse`, changeFrequency: "daily", priority: 0.9 },';
  if (sitemap.includes('`${base}/kaliteres-dorokartes`')) throw new Error("STOP: sitemap entry already exists. No files changed.");
  if (!sitemap.includes(anchor)) throw new Error("STOP: sitemap anchor not found. No files changed.");
  try { await fs.access(pageFile); throw new Error("STOP: flagship page already exists. No files changed."); } catch (e: any) { if (e?.message?.startsWith("STOP:")) throw e; }
  await fs.mkdir(pageDir, { recursive: true });
  await fs.writeFile(sitemapFile + ".before-flagship-v1", sitemap, "utf8");
  await fs.writeFile(pageFile, pageTemplate, "utf8");
  await fs.writeFile(sitemapFile, sitemap.replace(anchor, anchor + '\n    { url: `${base}/kaliteres-dorokartes`, changeFrequency: "weekly", priority: 0.88 },'), "utf8");
  console.log("PASS: flagship landing created.");
  console.log("PASS: sitemap entry added.");
  console.log("Backup: app/sitemap.ts.before-flagship-v1");
}
main().catch((e)=>{ console.error(e); process.exitCode=1; });
