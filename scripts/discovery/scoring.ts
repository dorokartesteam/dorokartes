import { detectKeywords, looksLikeGiftCardUrl } from "./keywords";

export function scoreCandidate(input: {
  url: string;
  title?: string;
  text?: string;
  hasPurchaseAction?: boolean;
  isOfficialDomain?: boolean;
}) {
  let score = 0;
  const matches = new Set<string>();

  if (input.isOfficialDomain) score += 30;
  if (looksLikeGiftCardUrl(input.url)) score += 20;

  const combined = `${input.title ?? ""}\n${input.text ?? ""}`;
  const { strong, supporting } = detectKeywords(combined);

  if (strong.length > 0) score += 30;
  if (strong.length > 1) score += 10;

  score += Math.min(supporting.length * 2, 10);

  for (const item of strong) matches.add(item);
  for (const item of supporting) matches.add(item);

  if (input.hasPurchaseAction) score += 10;

  return {
    score: Math.min(score, 100),
    matchedKeywords: [...matches],
  };
}
