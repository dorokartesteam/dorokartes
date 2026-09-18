export type AdminReviewState = "UNREVIEWED" | "ACCEPTED" | "REJECTED" | "NEEDS_REVIEW";

const REVIEW_RE = /\[ADMIN_REVIEW:(UNREVIEWED|ACCEPTED|REJECTED|NEEDS_REVIEW)\]/g;

export function getAdminReviewState(notes?: string | null): AdminReviewState {
  const matches = [...String(notes ?? "").matchAll(REVIEW_RE)];
  const last = matches.at(-1)?.[1] as AdminReviewState | undefined;
  return last ?? "UNREVIEWED";
}

export function setAdminReviewState(
  notes: string | null | undefined,
  state: AdminReviewState,
) {
  const clean = String(notes ?? "")
    .replace(REVIEW_RE, "")
    .replace(/\s*\|\s*\|+/g, " | ")
    .trim()
    .replace(/^\|\s*|\s*\|$/g, "");

  const marker = `[ADMIN_REVIEW:${state}]`;
  return clean ? `${clean} | ${marker}` : marker;
}

export function getConfidence(notes?: string | null) {
  const text = String(notes ?? "");
  const patterns = [
    /Wave2Score=(\d+)/i,
    /StrictScore=(\d+)/i,
    /QualityScore=(\d+)/i,
    /confidence[=:]\s*(\d+)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }

  return null;
}
