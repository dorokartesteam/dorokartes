import { createHash } from "node:crypto";
import type { Candidate } from "./types";

function cleanUrl(input: string) {
  const url = new URL(input);
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["gclid", "fbclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())
    ) {
      url.searchParams.delete(key);
    }
  }

  return url.toString().replace(/\/$/, "");
}

export function candidateFingerprint(candidate: Candidate): string {
  const normalized = [
    candidate.sourceType,
    cleanUrl(candidate.sourceUrl),
    candidate.merchantName?.trim().toLocaleLowerCase("el-GR") ?? "",
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex");
}

export function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const result: Candidate[] = [];

  for (const candidate of candidates) {
    const fingerprint = candidateFingerprint(candidate);

    if (seen.has(fingerprint)) continue;

    seen.add(fingerprint);
    result.push(candidate);
  }

  return result;
}
