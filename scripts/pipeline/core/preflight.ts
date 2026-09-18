import type { EvidencePackage } from "./fetch-evidence";

export type PreflightKind =
  | "OK"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "BLOCKED"
  | "EMPTY"
  | "ERROR_PAGE";

export type PreflightResult = {
  kind: PreflightKind;
  usableForLlm: boolean;
  reasonCodes: string[];
  note: string;
};

function norm(s: string | null | undefined) {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyPreflight(
  evidence: EvidencePackage | null,
): PreflightResult {
  if (!evidence) {
    return {
      kind: "EMPTY",
      usableForLlm: false,
      reasonCodes: ["NO_EVIDENCE"],
      note: "No usable HTTP/Playwright evidence.",
    };
  }

  const title = norm(evidence.title);
  const headings = norm((evidence.headings ?? []).join(" "));
  const body = norm(evidence.visibleText);
  const status = evidence.httpStatus ?? null;

  // Hard HTTP signals first.
  if (status === 404 || status === 410) {
    return {
      kind: "NOT_FOUND",
      usableForLlm: false,
      reasonCodes: ["HTTP_NOT_FOUND"],
      note: `Candidate URL returned HTTP ${status}.`,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: "ACCESS_DENIED",
      usableForLlm: false,
      reasonCodes: ["HTTP_ACCESS_DENIED"],
      note: `Candidate URL returned HTTP ${status}.`,
    };
  }

  if (status === 429) {
    return {
      kind: "BLOCKED",
      usableForLlm: false,
      reasonCodes: ["HTTP_RATE_LIMITED"],
      note: "Candidate URL returned HTTP 429.",
    };
  }

  if (status && status >= 500) {
    return {
      kind: "ERROR_PAGE",
      usableForLlm: false,
      reasonCodes: ["HTTP_SERVER_ERROR"],
      note: `Candidate URL returned HTTP ${status}.`,
    };
  }

  // Strong soft-404 signals. Do NOT match bare "404" anywhere in page chrome/scripts.
  const soft404Phrases = [
    "page not found",
    "the page you are looking for could not be found",
    "η σελίδα που αναζητάτε δεν βρέθηκε",
    "η σελιδα που αναζητατε δεν βρεθηκε",
  ];

  const soft404 =
    soft404Phrases.some((p) => title.includes(p)) ||
    soft404Phrases.some((p) => headings.includes(p)) ||
    soft404Phrases.some((p) => body.includes(p));

  if (soft404) {
    return {
      kind: "NOT_FOUND",
      usableForLlm: false,
      reasonCodes: ["SOFT_NOT_FOUND"],
      note: "Rendered page contains a strong not-found message.",
    };
  }

  // Strong access-denied signals only. Do NOT match generic vendor names
  // like "cloudflare" or "akamai" because they can exist in normal page assets.
  const deniedPhrases = [
    "access denied",
    "you don't have permission to access",
    "you do not have permission to access",
    "permission denied",
    "request blocked",
    "this request has been blocked",
  ];

  const denied =
    deniedPhrases.some((p) => title.includes(p)) ||
    deniedPhrases.some((p) => headings.includes(p)) ||
    deniedPhrases.some((p) => body.includes(p));

  if (denied) {
    return {
      kind: "ACCESS_DENIED",
      usableForLlm: false,
      reasonCodes: ["SOFT_ACCESS_DENIED"],
      note: "Rendered page contains a strong access-denied message.",
    };
  }

  const challengePhrases = [
    "verify you are human",
    "checking your browser",
    "complete the security check",
    "security verification",
    "captcha",
  ];

  const challenged =
    challengePhrases.some((p) => title.includes(p)) ||
    challengePhrases.some((p) => headings.includes(p)) ||
    challengePhrases.some((p) => body.includes(p));

  if (challenged) {
    return {
      kind: "BLOCKED",
      usableForLlm: false,
      reasonCodes: ["HUMAN_VERIFICATION_CHALLENGE"],
      note: "Rendered page is a human-verification/anti-bot challenge.",
    };
  }

  // Tiny content is suspicious, but this should be retried once by the caller.
  if (body.length < 80) {
    return {
      kind: "EMPTY",
      usableForLlm: false,
      reasonCodes: ["INSUFFICIENT_VISIBLE_CONTENT"],
      note: "Rendered page has too little visible content for semantic verification.",
    };
  }

  return {
    kind: "OK",
    usableForLlm: true,
    reasonCodes: [],
    note: "Evidence is suitable for semantic verification.",
  };
}
