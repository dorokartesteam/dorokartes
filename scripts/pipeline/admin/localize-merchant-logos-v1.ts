import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma";

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((x) => x.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split("=")[1])) : undefined;

function normalizeHost(hostname: string) {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function sameMerchantHost(assetUrl: string, websiteUrl: string) {
  try {
    const asset = new URL(assetUrl);
    const website = new URL(websiteUrl);

    const ah = normalizeHost(asset.hostname);
    const wh = normalizeHost(website.hostname);

    return ah === wh || ah.endsWith("." + wh) || wh.endsWith("." + ah);
  } catch {
    return false;
  }
}

function safeSlug(value: string) {
  const s = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  return s || crypto.randomBytes(5).toString("hex");
}

function extensionFromContentType(contentType: string, url: string) {
  const type = contentType.split(";")[0].trim().toLowerCase();

  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/gif": ".gif",
    "image/avif": ".avif",
  };

  if (map[type]) return map[type];

  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {}

  return null;
}

function isRemoteHttpUrl(value?: string | null) {
  if (!value) return false;

  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchLogo(url: string, websiteUrl: string) {
  if (!sameMerchantHost(url, websiteUrl)) {
    return { ok: false as const, reason: "external-host" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DorokartesLogoLocalizer/1.0; +https://dorokartes.gr)",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: websiteUrl,
      },
    });

    if (!response.ok) {
      return { ok: false as const, reason: `HTTP-${response.status}` };
    }

    if (!sameMerchantHost(response.url, websiteUrl)) {
      return { ok: false as const, reason: "redirected-external-host" };
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const ext = extensionFromContentType(contentType, response.url);

    if (!contentType.startsWith("image/") && !response.url.toLowerCase().endsWith(".svg")) {
      return { ok: false as const, reason: `not-image:${contentType || "unknown"}` };
    }

    if (!ext) {
      return { ok: false as const, reason: `unsupported-image:${contentType || "unknown"}` };
    }

    const buf = Buffer.from(await response.arrayBuffer());

    // Avoid broken/tracking/empty files.
    if (buf.length < 350) {
      return { ok: false as const, reason: `too-small:${buf.length}bytes` };
    }

    // Keep accidental huge hero images out of /public/merchant-logos.
    if (buf.length > 4 * 1024 * 1024) {
      return { ok: false as const, reason: `too-large:${Math.round(buf.length / 1024)}KB` };
    }

    return {
      ok: true as const,
      bytes: buf,
      ext,
      finalUrl: response.url,
      contentType,
    };
  } catch (e: any) {
    return {
      ok: false as const,
      reason: e?.name === "AbortError" ? "timeout" : "fetch-failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const merchants = await prisma.merchant.findMany({
    where: {
      websiteUrl: { not: null },
      logoUrl: { not: null },
    },
    orderBy: { name: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
    select: {
      id: true,
      name: true,
      slug: true,
      websiteUrl: true,
      logoUrl: true,
    },
  });

  const candidates = merchants.filter(
    (m) =>
      isRemoteHttpUrl(m.logoUrl) &&
      !!m.websiteUrl &&
      sameMerchantHost(m.logoUrl!, m.websiteUrl!)
  );

  console.log(`Mode: ${APPLY ? "APPLY" : "PREVIEW"}`);
  console.log(`Remote merchant logos eligible: ${candidates.length}`);
  console.log("");

  const publicDir = path.join(process.cwd(), "public", "merchant-logos");

  let ready = 0;
  let updated = 0;
  let rejected = 0;

  for (const merchant of candidates) {
    const remoteLogo = merchant.logoUrl!;
    const websiteUrl = merchant.websiteUrl!;

    const result = await fetchLogo(remoteLogo, websiteUrl);

    if (!result.ok) {
      console.log(`REJECT | ${merchant.name} | ${result.reason} | ${remoteLogo}`);
      rejected++;
      continue;
    }

    const nameBase = safeSlug(merchant.slug || merchant.name);
    const filename = `${nameBase}${result.ext}`;
    const relativeUrl = `/merchant-logos/${filename}`;
    const absolutePath = path.join(publicDir, filename);

    console.log(
      `${APPLY ? "READY" : "CANDIDATE"} | ${merchant.name} | ${Math.round(result.bytes.length / 1024)}KB | ${relativeUrl}`
    );

    ready++;

    if (!APPLY) continue;

    fs.mkdirSync(publicDir, { recursive: true });

    // Write atomically to avoid half-written image files.
    const tempPath = `${absolutePath}.tmp`;
    fs.writeFileSync(tempPath, result.bytes);
    fs.renameSync(tempPath, absolutePath);

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: { logoUrl: relativeUrl },
    });

    console.log(`UPDATED | ${merchant.name} | ${relativeUrl}`);
    updated++;
  }

  console.log("");
  console.log("Summary");
  console.log(`Ready: ${ready}`);
  console.log(`Rejected: ${rejected}`);
  if (APPLY) {
    console.log(`Updated DB + local files: ${updated}`);
  } else {
    console.log("PREVIEW ONLY — no files written, database unchanged.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
