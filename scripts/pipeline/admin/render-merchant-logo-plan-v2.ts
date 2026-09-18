import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type LogoAction = {
  merchantName: string;
  merchantSlug: string;
  websiteUrl: string;
  sourceUrl: string;
  source: string;
  evidence: string;
  score: number;
  width: number;
  height: number;
};

type LogoPlan = {
  planId: string;
  generatedAt: string;
  summary: Record<string, number>;
  actions: LogoAction[];
};

const repoRoot = path.resolve(process.cwd());
const inputArg = process.argv.find((arg) => arg.startsWith("--input="))?.slice("--input=".length);
const outputArg = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
const inputPath = inputArg
  ? path.resolve(repoRoot, inputArg)
  : path.join(repoRoot, "reports", "merchant-logo-harvest-v2-plan.json");
const outputPath = outputArg
  ? path.resolve(repoRoot, outputArg)
  : path.join(repoRoot, "reports", "merchant-logo-harvest-v2-preview.html");

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function main() {
  const plan = JSON.parse(await readFile(inputPath, "utf8")) as LogoPlan;
  const actions = [...plan.actions].sort((a, b) => a.merchantName.localeCompare(b.merchantName, "el"));

  const cards = actions
    .map(
    (action, index) => `
      <article class="card" data-index="${index + 1}">
        <div class="preview">
          <img loading="lazy" src="${escapeHtml(action.sourceUrl)}" alt="${escapeHtml(action.merchantName)}" />
        </div>
        <div class="meta">
          <strong>${index + 1}. ${escapeHtml(action.merchantName)}</strong>
          <span>${escapeHtml(action.source)} · score ${action.score} · ${action.width}×${action.height}</span>
          <span class="evidence">${escapeHtml(action.evidence)}</span>
          <a href="${escapeHtml(action.websiteUrl)}" target="_blank" rel="noreferrer">official site</a>
        </div>
      </article>`,
  )
    .join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Dorokartes logo plan ${escapeHtml(plan.planId.slice(0, 12))}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #eef0f3; color: #18181b; font: 14px/1.4 system-ui, sans-serif; }
      header { position: sticky; top: 0; z-index: 2; margin: -24px -24px 24px; padding: 16px 24px; background: rgba(255,255,255,.96); border-bottom: 1px solid #d4d4d8; }
      h1 { margin: 0 0 4px; font-size: 20px; }
      header p { margin: 0; color: #52525b; }
      main { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
      .card { overflow: hidden; border: 1px solid #d4d4d8; border-radius: 10px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
      .preview { display: grid; place-items: center; height: 150px; padding: 20px; background: linear-gradient(90deg, #fff 0 50%, #27272a 50%); }
      .preview img { display: block; max-width: 100%; max-height: 110px; object-fit: contain; }
      .meta { display: grid; gap: 4px; padding: 12px; }
      .meta span { color: #52525b; font-size: 12px; }
      .meta .evidence { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .meta a { color: #6d28d9; font-weight: 600; }
      img:not([src]), img[src=""] { outline: 3px solid red; }
    </style>
  </head>
  <body>
    <header>
      <h1>Dorokartes logo plan — ${actions.length} safe actions</h1>
      <p>Plan ${escapeHtml(plan.planId)} · ${escapeHtml(plan.generatedAt)} · split light/dark background</p>
    </header>
    <main>${cards}</main>
  </body>
</html>`;

  await writeFile(outputPath, html, "utf8");
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
