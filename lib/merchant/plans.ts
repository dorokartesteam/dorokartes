export const MERCHANT_PLAN_DETAILS = {
  PARTNER: {
    label: "Partner",
    price: "9,99€",
    priceCents: 999,
    description: "Ενεργή εμπορική παρουσία στο Dorokartes.",
  },
  FEATURED: {
    label: "Featured",
    price: "19,99€",
    priceCents: 1999,
    description: "Αυξημένη προβολή σε κατηγορίες, περιοχές και περιστάσεις.",
  },
  PREMIUM_BANNER: {
    label: "Premium Banner",
    price: "39,99€",
    priceCents: 3999,
    description: "Προβολή στο μεγάλο κεντρικό banner της αρχικής.",
  },
} as const;

export type MerchantPlanKey = keyof typeof MERCHANT_PLAN_DETAILS;

export function formPlanToDb(value: string | null | undefined): MerchantPlanKey | null {
  if (value === "partner") return "PARTNER";
  if (value === "featured") return "FEATURED";
  if (value === "premium") return "PREMIUM_BANNER";
  return null;
}

export function planLabel(value: string | null | undefined) {
  if (!value) return "Δεν έχει επιλεγεί";
  return MERCHANT_PLAN_DETAILS[value as MerchantPlanKey]?.label ?? value;
}
