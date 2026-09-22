import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";

type Brand = {
  name: string;
  merchantSlug: string;
  sourceUrl: string;
};

const APPLY = process.argv.includes("--apply");
const REQUESTED_PLAN_ID =
  process.argv.find((x) => x.startsWith("--plan-id="))?.split("=")[1] || null;

const ROOT = process.cwd();
const LOGO_DIR = path.join(ROOT, "public", "merchant-logos");
const REPORT_DIR = path.join(ROOT, "reports", "postlaunch");

const BRANDS: Brand[] = [
  {
    name: "Nike",
    merchantSlug: "nike",
    sourceUrl: "https://cdn.simpleicons.org/nike/000000",
  },
  {
    name: "Zara",
    merchantSlug: "zara",
    sourceUrl: "https://cdn.simpleicons.org/zara/000000",
  },
  {
    name: "H&M",
    merchantSlug: "h-m",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/H%26M-Logo.svg",
  },
  {
    name: "Bershka",
    merchantSlug: "bershka",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Bershka_logo.svg",
  },
  {
    name: "Pull&Bear",
    merchantSlug: "pull-and-bear",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Pull%26Bear_logo_2023.svg",
  },
  {
    name: "Stradivarius",
    merchantSlug: "stradivarius",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Stradivarius_logo.svg",
  },
  {
    name: "Oysho",
    merchantSlug: "oysho",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Logo_oysho.svg",
  },
  {
    name: "Massimo Dutti",
    merchantSlug: "massimo-dutti",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Massimo_Dutti_logo_2024.svg",
  },
  {
    name: "Zara Home",
    merchantSlug: "zara-home",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Zara_Home_logo_2023.svg",
  },
];

function stableHash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function safeLocalName(slug: string, hash: string) {
  return `${slug}-official-${hash.slice(0, 12)}.svg`;
}

async function fetchSvg(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "DorokartesMajorBrandLogo/1.0 (+https://dorokartes.gr)",
      accept: "image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const text = await response.text();
  const type = (response.headers.get("content-type") || "").toLowerCase();

  if (!text.trim().startsWith("<svg") && !text.includes("<svg")) {
    throw new Error(`Not SVG: ${url} (${type || "unknown content-type"})`);
  }

  const buffer = Buffer.from(text, "utf8");
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    buffer,
    hash,
    finalUrl: response.url || url,
    bytes: buffer.length,
  };
}

async function buildPlan() {
  const rows = [];

  for (const brand of BRANDS) {
    const merchant = await prisma.merchant.findUnique({
      where: { slug: brand.merchantSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        logoSourceUrl: true,
        updatedAt: true,
      },
    });

    if (!merchant) {
      rows.push({
        brand,
        status: "ERROR",
        error: "MERCHANT_NOT_FOUND",
      });
      continue;
    }

    try {
      const src = brand.sourceUrl;
      const svg = await fetchSvg(src);
      const filename = safeLocalName(merchant.slug, svg.hash);
      const localUrl = `/merchant-logos/${filename}`;

      rows.push({
        brand,
        status: "READY",
        merchantId: merchant.id,
        merchantName: merchant.name,
        merchantSlug: merchant.slug,
        oldLogoUrl: merchant.logoUrl,
        oldLogoSourceUrl: merchant.logoSourceUrl,
        oldUpdatedAt: merchant.updatedAt.toISOString(),
        sourceUrl: src,
        sha256: svg.hash,
        bytes: svg.bytes,
        localUrl,
      });
    } catch (error) {
      rows.push({
        brand,
        status: "ERROR",
        merchantId: merchant.id,
        merchantName: merchant.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const material = {
    version: 1,
    brands: rows.map((row) => {
      if (row.status === "ERROR") return row;
      return {
        brand: row.brand,
        status: row.status,
        merchantId: row.merchantId,
        merchantName: row.merchantName,
        merchantSlug: row.merchantSlug,
        oldLogoUrl: row.oldLogoUrl,
        oldLogoSourceUrl: row.oldLogoSourceUrl,
        oldUpdatedAt: row.oldUpdatedAt,
        sourceUrl: row.sourceUrl,
        sha256: row.sha256,
        bytes: row.bytes,
        localUrl: row.localUrl,
      };
    }),
  };

  return {
    ...material,
    generatedAt: new Date().toISOString(),
    planId: stableHash(material),
  };
}

async function applyPlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  if (!REQUESTED_PLAN_ID) {
    throw new Error("Apply requires --plan-id=<preview-plan-id>");
  }
  if (REQUESTED_PLAN_ID !== plan.planId) {
    throw new Error("Plan ID changed. Re-run preview.");
  }

  const ready = plan.brands.filter((x: any) => x.status === "READY") as any[];
  if (ready.length !== BRANDS.length) {
    throw new Error(`Refusing apply: READY=${ready.length}/${BRANDS.length}`);
  }

  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const downloaded: Array<{ row: any; buffer: Buffer }> = [];

  for (const row of ready) {
    const current = await prisma.merchant.findUnique({
      where: { id: row.merchantId },
      select: {
        id: true,
        slug: true,
        logoUrl: true,
        logoSourceUrl: true,
        updatedAt: true,
      },
    });

    if (
      !current ||
      current.slug !== row.merchantSlug ||
      current.logoUrl !== row.oldLogoUrl ||
      current.logoSourceUrl !== row.oldLogoSourceUrl ||
      current.updatedAt.toISOString() !== row.oldUpdatedAt
    ) {
      throw new Error(`Merchant changed after preview: ${row.merchantName}`);
    }

    const svg = await fetchSvg(row.sourceUrl);
    if (svg.hash !== row.sha256) {
      throw new Error(`Asset hash changed after preview: ${row.merchantName}`);
    }

    downloaded.push({ row, buffer: svg.buffer });
  }

  const createdFiles: string[] = [];

  try {
    for (const { row, buffer } of downloaded) {
      const fullPath = path.join(ROOT, "public", row.localUrl.replace(/^\/+/, ""));
      if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, buffer);
        createdFiles.push(fullPath);
      } else {
        const existingHash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(fullPath))
          .digest("hex");
        if (existingHash !== row.sha256) {
          throw new Error(`Existing local file hash mismatch: ${row.localUrl}`);
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const { row } of downloaded) {
        const result = await tx.merchant.updateMany({
          where: {
            id: row.merchantId,
            slug: row.merchantSlug,
            logoUrl: row.oldLogoUrl,
            logoSourceUrl: row.oldLogoSourceUrl,
          },
          data: {
            logoUrl: row.localUrl,
            logoSourceUrl: row.sourceUrl,
          },
        });

        if (result.count !== 1) {
          throw new Error(`Merchant precondition failed: ${row.merchantName}`);
        }

        await tx.mediaAsset.updateMany({
          where: { merchantId: row.merchantId, isPrimary: true },
          data: { isPrimary: false },
        });

        await tx.mediaAsset.create({
          data: {
            merchantId: row.merchantId,
            url: row.localUrl,
            sourceUrl: row.sourceUrl,
            altText: `Λογότυπο ${row.merchantName}`,
            usageStatus: "APPROVED",
            isPrimary: true,
          },
        });
      }
    });
  } catch (error) {
    for (const file of createdFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    throw error;
  }

  return downloaded.length;
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const plan = await buildPlan();

  console.log(`Dorokartes New Major Brand Logos v1.1 — ${APPLY ? "APPLY" : "PREVIEW"}`);
  console.log(`Plan ID: ${plan.planId}`);
  console.log("");

  for (const row of plan.brands as any[]) {
    if (row.status === "READY") {
      console.log(`${row.brand.name.padEnd(16)} READY`);
      console.log(`  ${row.sourceUrl}`);
      console.log(`  -> ${row.localUrl}`);
    } else {
      console.log(`${row.brand.name.padEnd(16)} ERROR | ${row.error}`);
    }
  }

  const ready = (plan.brands as any[]).filter((x) => x.status === "READY").length;
  const errors = BRANDS.length - ready;

  console.log("");
  console.log(`READY: ${ready}`);
  console.log(`ERROR: ${errors}`);

  const reportFile = path.join(
    REPORT_DIR,
    `new-major-brand-logos-v1-${APPLY ? "apply" : "preview"}.json`,
  );

  fs.writeFileSync(reportFile, JSON.stringify(plan, null, 2) + "\n", "utf8");
  console.log(`Report: ${reportFile}`);

  if (!APPLY) {
    console.log("PREVIEW ONLY — no files or database rows changed.");
    if (ready === BRANDS.length) {
      console.log("");
      console.log("To apply this exact plan:");
      console.log(
        `npx tsx scripts/audit/new-major-brand-logos-v1.ts --apply --plan-id=${plan.planId}`,
      );
    }
    return;
  }

  const applied = await applyPlan(plan);
  console.log(`APPLIED: ${applied} brand logos`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
