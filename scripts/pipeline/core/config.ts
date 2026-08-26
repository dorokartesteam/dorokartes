export const SCORING_MODEL_KEY = "canonical-v1";

export const SCORING_CONFIG = {
  verified: 50,
  queued: 15,
  canonicalUrl: 40,
  checkout: 10,
  terms: -40,
  promotion: -80,
  content: -70,
  homepage: -20,
  strongTitle: 20,
  greekLocale: 12,
  explicitSendGiftCard: 18,
  concreteGiftCardProduct: 18,
  redirectedToHomepage: -45,
} as const;

export const RESERVED_SOURCE_LABELS = new Set([
  "official website scanner",
  "official websites",
  "official website verifier",
  "mass discovery v2",
  "mass discovery v2.1",
  "manual research",
  "google discovery",
  "bestprice",
  "baladeur",
]);

export function normalizeLabel(input: string) {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isReservedSourceLabel(input?: string | null) {
  if (!input) return false;
  return RESERVED_SOURCE_LABELS.has(normalizeLabel(input));
}

export function isInvalidMerchantName(input?: string | null) {
  if (!input) return true;
  const value = input.trim();
  if (value.length < 2 || value.length > 60) return true;
  if (isReservedSourceLabel(value)) return true;

  const n = normalizeLabel(value);
  if (["gift card","giftcard","gift voucher","δωροκαρτα","δωροεπιταγη"].includes(n)) return true;
  if (n.includes("scanner") || n.includes("verifier") || n.includes("discovery source")) return true;
  return false;
}

export const VERIFICATION_MODEL =
  process.env.OPENAI_VERIFICATION_MODEL || "gpt-5.6-luna";

export const VERIFY_POSITIVE_THRESHOLD = 0.90;
export const VERIFY_NEGATIVE_THRESHOLD = 0.92;
export const VERIFY_NONCANONICAL_THRESHOLD = 0.97;
