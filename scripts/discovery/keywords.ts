export const STRONG_KEYWORDS = [
  "gift card",
  "giftcard",
  "e-gift",
  "egift",
  "gift voucher",
  "digital gift card",
  "δωροκάρτα",
  "δωροκαρτα",
  "δώρο κάρτα",
  "δωροεπιταγή",
  "δωροεπιταγη",
];

export const URL_KEYWORDS = [
  "gift-card",
  "giftcard",
  "gift-cards",
  "egift",
  "e-gift",
  "voucher",
  "dwrokarta",
  "dorokarta",
  "doroepitagi",
  "gift",
];

export const SUPPORTING_KEYWORDS = [
  "αγορά",
  "purchase",
  "buy",
  "αξία",
  "ποσό",
  "value",
  "€",
  "eur",
  "email",
  "sms",
  "εξαργύρωση",
  "redeem",
  "ισχύ",
  "valid",
  "κατάστημα",
  "online",
];

export function normalizeText(input: string): string {
  return input
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectKeywords(text: string) {
  const normalized = normalizeText(text);

  const strong = STRONG_KEYWORDS.filter((k) =>
    normalized.includes(normalizeText(k)),
  );

  const supporting = SUPPORTING_KEYWORDS.filter((k) =>
    normalized.includes(normalizeText(k)),
  );

  return { strong, supporting };
}

export function looksLikeGiftCardUrl(url: string): boolean {
  const normalized = normalizeText(url);
  return URL_KEYWORDS.some((k) => normalized.includes(normalizeText(k)));
}
