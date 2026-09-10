import type { MetadataRoute } from "next";

const fallbackBaseUrl = "https://dorokartes.gr";

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || fallbackBaseUrl;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackBaseUrl;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallbackBaseUrl;
  }
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/admin/"] }],
    sitemap: getBaseUrl() + "/sitemap.xml",
  };
}
