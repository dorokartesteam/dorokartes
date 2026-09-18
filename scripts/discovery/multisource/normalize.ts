import { createHash } from "node:crypto";
import type { RawDiscovery, NormalizedDiscovery } from "./types";

export function normalizeMerchantName(input?: string | null): string {
  if (!input) return "";

  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&amp;/g, "&")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(ae|sa|ike|oe|ee|ltd|limited|greece|hellas)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUrl(input: string): string {
  const url = new URL(input);

  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (
      lower.startsWith("utm_") ||
      ["gclid", "fbclid", "mc_cid", "mc_eid"].includes(lower)
    ) {
      url.searchParams.delete(key);
    }
  }

  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  let result = url.toString();
  result = result.replace(/\/$/, "");

  return result;
}

export function normalizeOfficialUrl(input?: string | null): string | null {
  if (!input) return null;

  try {
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    return `${url.protocol}//${url.hostname.toLowerCase().replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

export function makeFingerprint(input: {
  merchantName?: string | null;
  sourceUrl: string;
  possibleOfficialUrl?: string | null;
}) {
  const merchant = normalizeMerchantName(input.merchantName);
  const sourceUrl = normalizeUrl(input.sourceUrl);
  const official = normalizeOfficialUrl(input.possibleOfficialUrl) ?? "";

  return createHash("sha256")
    .update(`${merchant}|${official}|${sourceUrl}`)
    .digest("hex");
}

export function normalizeDiscovery(item: RawDiscovery): NormalizedDiscovery {
  return {
    ...item,
    normalizedMerchantName: normalizeMerchantName(item.merchantName),
    normalizedSourceUrl: normalizeUrl(item.sourceUrl),
    normalizedOfficialUrl: normalizeOfficialUrl(item.possibleOfficialUrl),
    fingerprint: makeFingerprint(item),
  };
}
