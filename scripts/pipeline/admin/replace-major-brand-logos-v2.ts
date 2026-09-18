import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma";

type CuratedLogo = {
  merchantNames: string[];
  sourceUrl: string;
  allowedHosts: string[];
  note: string;
};

const APPLY = process.argv.includes("--apply");
const MODE = APPLY ? "APPLY" : "PREVIEW";

const LOGO_DIR = path.resolve(process.cwd(), "public", "merchant-logos");
const REPORT_DIR = path.resolve(process.cwd(), "reports");

const CURATED: CuratedLogo[] = [
  {
    merchantNames: ["Rituals"],
    sourceUrl: "https://www.rituals.com/images/svg/rituals-primary-logo.svg",
    allowedHosts: ["rituals.com"],
    note: "Official Rituals primary logo.",
  },
  {
    merchantNames: ["KIKO"],
    sourceUrl: "https://assets.kikocosmetics.gr/media/logo/default/kiko-logo-text.png",
    allowedHosts: ["kikocosmetics.gr"],
    note: "Official KIKO logo asset.",
  },
  {
    merchantNames: ["Mothercare Greece", "Mothercare"],
    sourceUrl: "https://www.mothercare.gr/assets/logo.svg",
    allowedHosts: ["mothercare.gr"],
    note: "Official Mothercare Greece logo asset.",
  },
  {
    merchantNames: ["LEGO Store Greece"],
    sourceUrl: "https://www.lego.com/cdn/cs/aboutus/assets/blt06799f014ed2650e/LEGO_logo_RGB.svg",
    allowedHosts: ["lego.com"],
    note: "Official LEGO Group RGB SVG logo asset.",
  },
];

const MIME_EXT: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

function normalizeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostAllowed(url: string, allowedHosts: string[]) {
  const h = normalizeHost(url);
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase().replace(/^www\./, "");
    return h === a || h.endsWith(`.${a}`);
  });
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extFromUrl(url: string) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if ([".svg", ".png", ".jpg", ".jpeg", ".webp", ".avif"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {}
  return null;
}

async function fetchImage(url: string, allowedHosts: string[]) {
  if (!hostAllowed(url, allowedHosts)) {
    throw new Error(`Source host is not in curated allowlist: ${normalizeHost(url)}`);
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; DorokartesBrandAsset/2.0; +https://dorokartes.gr)",
      accept: "image/svg+xml,image/png,image/jpeg,image/webp,image/avif,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const finalUrl = response.url || url;

  if (!hostAllowed(finalUrl, allowedHosts)) {
    throw new Error(
      `Redirected outside curated allowlist: ${normalizeHost(finalUrl)}`,
    );
  }

  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image: ${contentType || "unknown content-type"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error("Downloaded asset is empty.");
  }

  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("Downloaded asset is larger than 5 MB.");
  }

  const ext =
    MIME_EXT[contentType] ||
    extFromUrl(finalUrl) ||
    extFromUrl(url);

  if (!ext) {
    throw new Error(`Unsupported asset type: ${contentType}`);
  }

  return {
    buffer,
    contentType,
    finalUrl,
    ext,
    sizeBytes: buffer.length,
  };
}

async function findMerchant(names: string[]) {
  for (const name of names) {
    const exact = await prisma.merchant.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        logoUrl: true,
        logoSourceUrl: true,
      },
    });

    if (exact) return exact;
  }

  for (const name of names) {
    const partial = await prisma.merchant.findFirst({
      where: { name: { contains: name, mode: "insensitive" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        logoUrl: true,
        logoSourceUrl: true,
      },
    });

    if (partial) return partial;
  }

  return null;
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.mkdirSync(LOGO_DIR, { recursive: true });

  console.log(`=== CURATED MAJOR BRAND LOGOS V2 (${MODE}) ===`);
  if (!APPLY) {
    console.log("PREVIEW ONLY — no files and no DB rows will be changed.\n");
  } else {
    console.log("APPLY MODE — curated assets will be downloaded and DB updated.\n");
  }

  const results: any[] = [];

  for (const entry of CURATED) {
    const merchant = await findMerchant(entry.merchantNames);

    if (!merchant) {
      console.log(`- [NOT_FOUND] ${entry.merchantNames.join(" / ")}`);
      results.push({
        target: entry.merchantNames,
        status: "NOT_FOUND",
        sourceUrl: entry.sourceUrl,
      });
      continue;
    }

    try {
      const image = await fetchImage(entry.sourceUrl, entry.allowedHosts);

      const hash = crypto
        .createHash("sha256")
        .update(image.buffer)
        .digest("hex")
        .slice(0, 12);

      const filename = `${slugify(merchant.name)}-official-${hash}${image.ext}`;
      const publicLogoUrl = `/merchant-logos/${filename}`;
      const diskPath = path.join(LOGO_DIR, filename);

      console.log(`- [${APPLY ? "APPLY" : "READY"}] ${merchant.name}`);
      console.log(`  old logo:   ${merchant.logoUrl ?? "none"}`);
      console.log(`  old source: ${merchant.logoSourceUrl ?? "none"}`);
      console.log(`  source:     ${image.finalUrl}`);
      console.log(`  type:       ${image.contentType}`);
      console.log(`  bytes:      ${image.sizeBytes}`);
      console.log(`  new logo:   ${publicLogoUrl}`);
      console.log(`  note:       ${entry.note}`);

      if (APPLY) {
        fs.writeFileSync(diskPath, image.buffer);

        await prisma.merchant.update({
          where: { id: merchant.id },
          data: {
            logoUrl: publicLogoUrl,
            logoSourceUrl: image.finalUrl,
          },
        });
      }

      results.push({
        merchantId: merchant.id,
        merchantName: merchant.name,
        websiteUrl: merchant.websiteUrl,
        oldLogoUrl: merchant.logoUrl,
        oldLogoSourceUrl: merchant.logoSourceUrl,
        sourceUrl: image.finalUrl,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
        proposedLogoUrl: publicLogoUrl,
        note: entry.note,
        status: APPLY ? "APPLIED" : "READY",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`- [FAILED] ${merchant.name}`);
      console.log(`  source: ${entry.sourceUrl}`);
      console.log(`  error:  ${message}`);

      results.push({
        merchantId: merchant.id,
        merchantName: merchant.name,
        sourceUrl: entry.sourceUrl,
        status: "FAILED",
        error: message,
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = path.join(
    REPORT_DIR,
    `curated-major-brand-logos-v2-${APPLY ? "apply" : "preview"}-${stamp}.json`,
  );

  fs.writeFileSync(
    report,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: APPLY ? "apply" : "preview",
        curatedOnly: true,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\nReport: ${path.relative(process.cwd(), report)}`);

  if (!APPLY) {
    console.log(
      "\nIf ALL four entries show [READY], send me this output before running --apply.",
    );
  } else {
    console.log(
      "\nDone. Run npm run build, visually verify the four logos, then commit.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
