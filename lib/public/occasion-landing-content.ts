export type OccasionLandingContent = {
  seoTitle: string;
  metaDescription: string;
  heading: string;
  intro: string;
  relatedSlugs: readonly string[];
};

const occasionLandingContent: Record<string, OccasionLandingContent> = {
  birthday: {
    seoTitle: "Δωροκάρτες Γενεθλίων: Ιδέες για Κάθε Ηλικία",
    metaDescription:
      "Βρες ενεργές δωροκάρτες για γενέθλια, σύγκρινε επιλογές ανά ενδιαφέρον και συνέχισε στον επίσημο ιστότοπο κάθε εμπόρου.",
    heading: "Δωροκάρτες για γενέθλια και κάθε ηλικία",
    intro:
      "Ανακάλυψε ιδέες για δώρο γενεθλίων από διαφορετικές κατηγορίες και καταστήματα. Η δωροκάρτα αφήνει τον παραλήπτη να επιλέξει αυτό που θέλει, όταν τον εξυπηρετεί.",
    relatedSlugs: ["name-day", "for-her", "for-him"],
  },
  "for-her": {
    seoTitle: "Δωροκάρτες για Εκείνη: Ιδέες Δώρου",
    metaDescription:
      "Ανακάλυψε ενεργές δωροκάρτες για εκείνη από διαφορετικές κατηγορίες και έλεγξε αξίες και όρους στον επίσημο έμπορο.",
    heading: "Δωροκάρτες για εκείνη",
    intro:
      "Εξερεύνησε δωροκάρτες από διαφορετικές κατηγορίες και άφησε την τελική επιλογή στην ίδια. Σύγκρινε τις ενεργές επιλογές και βρες ένα δώρο που ταιριάζει στα ενδιαφέροντά της.",
    relatedSlugs: ["birthday", "anniversary", "mothers-day"],
  },
  "for-him": {
    seoTitle: "Δωροκάρτες για Εκείνον: Ιδέες Δώρου",
    metaDescription:
      "Βρες ενεργές δωροκάρτες για εκείνον από διαφορετικές κατηγορίες και συνέχισε στον επίσημο έμπορο για αξίες και όρους.",
    heading: "Δωροκάρτες για εκείνον",
    intro:
      "Εξερεύνησε δωροκάρτες από διαφορετικές κατηγορίες και άφησε την τελική επιλογή στον ίδιο. Σύγκρινε τις ενεργές επιλογές με βάση τα ενδιαφέροντα και την περίσταση.",
    relatedSlugs: ["birthday", "anniversary", "fathers-day"],
  },
  "new-baby": {
    seoTitle: "Δωροκάρτες για Νέο Μωρό & Νέους Γονείς",
    metaDescription:
      "Βρες δωροκάρτες για νέο μωρό και νέους γονείς, σύγκρινε ενεργές επιλογές και έλεγξε τους όρους στον επίσημο έμπορο.",
    heading: "Δωροκάρτες για νέο μωρό και νέους γονείς",
    intro:
      "Μια πρακτική επιλογή για τον ερχομό ενός μωρού, ώστε οι γονείς να διαλέξουν αυτό που χρειάζονται πραγματικά. Δες ενεργές δωροκάρτες για βρεφικά και οικογενειακά δώρα.",
    relatedSlugs: ["for-kids", "christening", "just-because"],
  },
  christmas: {
    seoTitle: "Χριστουγεννιάτικες Δωροκάρτες & Ιδέες Δώρου",
    metaDescription:
      "Ανακάλυψε ενεργές δωροκάρτες για τα Χριστούγεννα, σύγκρινε γιορτινές επιλογές και επισκέψου τον επίσημο έμπορο.",
    heading: "Δωροκάρτες για τα Χριστούγεννα",
    intro:
      "Βρες χριστουγεννιάτικες ιδέες για φίλους, οικογένεια και αγαπημένα πρόσωπα χωρίς να μαντεύεις το σωστό προϊόν. Ο παραλήπτης επιλέγει το δώρο που του ταιριάζει.",
    relatedSlugs: ["for-kids", "for-her", "for-him"],
  },
  anniversary: {
    seoTitle: "Δωροκάρτες Επετείου για Ξεχωριστές Στιγμές",
    metaDescription:
      "Βρες ενεργές δωροκάρτες για επέτειο, από προσωπικά δώρα έως εμπειρίες, και έλεγξε τις λεπτομέρειες στον επίσημο έμπορο.",
    heading: "Δωροκάρτες για επέτειο",
    intro:
      "Γιόρτασε μια ξεχωριστή ημερομηνία με μια δωροκάρτα που δίνει ελευθερία επιλογής. Σύγκρινε ιδέες για προσωπικά δώρα και εμπειρίες από τον ενεργό κατάλογο.",
    relatedSlugs: ["valentines", "for-her", "for-him"],
  },
};

export const TEMPORARILY_NOINDEXED_OCCASION_SLUGS = [
  "anniversary",
  "christmas",
  "for-her",
  "for-him",
] as const;

const temporarilyNoindexedOccasionSlugs = new Set<string>(
  TEMPORARILY_NOINDEXED_OCCASION_SLUGS,
);

export const OCCASION_LANDING_SLUGS = Object.freeze(
  Object.keys(occasionLandingContent),
);

export function isOccasionLandingReadyForIndexing(slug: string) {
  return !temporarilyNoindexedOccasionSlugs.has(slug);
}

export function getOccasionLandingContent(slug: string): OccasionLandingContent | null {
  return occasionLandingContent[slug] ?? null;
}
