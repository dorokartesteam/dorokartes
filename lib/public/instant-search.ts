import { greekToLatin, normalizeSearchText } from "@/lib/public/search";

export type InstantSearchIndexItem = {
  id: string;
  title: string;
  slug: string;
  merchantName: string;
  merchantLogoUrl: string | null;
  titleSearch: string;
  merchantSearch: string;
  contextSearch: string;
  featured: boolean;
  verified: boolean;
};

const aliasGroups = [
  ["ρουχα", "ρούχα", "rouxa", "fashion", "μοδα", "μόδα", "moda", "clothing", "ενδυση", "ένδυση"],
  ["beauty", "ομορφια", "ομορφιά", "omorfia", "καλλυντικα", "καλλυντικά", "makeup", "cosmetics"],
  ["spa", "wellness", "ευεξια", "ευεξία", "eyexia", "massage", "μασαζ", "μασάζ"],
  ["παιδι", "παιδί", "paidi", "kids", "kid", "παιδικα", "παιδικά", "baby", "μωρο", "μωρό"],
  ["γυναικα", "γυναίκα", "gynaika", "woman", "women", "for her", "for-her", "γυναικειο", "γυναικείο"],
  ["αντρας", "άντρας", "andras", "ανδρας", "άνδρας", "man", "men", "for him", "for-him", "ανδρικο", "ανδρικό"],
  ["gaming", "game", "games", "παιχνιδια", "παιχνίδια", "paixnidia", "playstation", "xbox", "nintendo"],
  ["φαγητο", "φαγητό", "fagito", "food", "restaurant", "restaurants", "εστιατοριο", "εστιατόριο", "delivery"],
  ["travel", "ταξιδι", "ταξίδι", "taxidi", "ταξιδια", "ταξίδια", "hotel", "hotels", "διακοπες", "διακοπές"],
  ["sport", "sports", "fitness", "gym", "γυμναστηριο", "γυμναστήριο", "athlisi", "αθληση", "άθληση"],
  ["home", "σπιτι", "σπίτι", "spiti", "decor", "decoration", "διακοσμηση", "διακόσμηση"],
  ["jewelry", "jewellery", "κοσμημα", "κόσμημα", "kosmima", "ρολοι", "ρολόι", "watch", "watches"],
  ["experience", "experiences", "εμπειρια", "εμπειρία", "empeiria", "δραστηριοτητα", "δραστηριότητα"],
  ["birthday", "γενεθλια", "γενέθλια", "genethlia", "γενεθλιων", "γενεθλίων"],
  ["wedding", "γαμος", "γάμος", "gamos"],
  ["christmas", "χριστουγεννα", "χριστούγεννα", "xristougenna"],
  ["anniversary", "επετειος", "επέτειος", "epeteios"],
  ["gift card", "giftcard", "giftcards", "δωροκαρτα", "δωροκάρτα", "dorokarta", "δωροεπιταγη", "δωροεπιταγή"],
];

function formsForQuery(raw: string) {
  const normalized = normalizeSearchText(raw);
  const latin = greekToLatin(raw);
  const forms = new Set<string>();

  if (normalized) forms.add(normalized);
  if (latin) forms.add(latin);

  if (normalized.length >= 2 || latin.length >= 2) {
    for (const group of aliasGroups) {
      const normalizedGroup = group.flatMap((value) => [
        normalizeSearchText(value),
        greekToLatin(value),
      ]);

      const matched = normalizedGroup.some((value) =>
        value &&
        (
          normalized === value ||
          latin === value ||
          normalized.includes(value) ||
          latin.includes(value)
        ),
      );

      if (matched) {
        for (const value of normalizedGroup) {
          if (value) forms.add(value);
        }
      }
    }
  }

  return [...forms];
}

function words(value: string) {
  return value.split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function exactPrefixContainsScore(query: string, value: string, base: number) {
  if (!query || !value) return 0;

  if (value === query) return base + 420;
  if (value.startsWith(query)) return base + 330;

  const valueWords = words(value);
  if (valueWords.some((word) => word.startsWith(query))) return base + 250;
  if (value.includes(query)) return base + 170;

  return 0;
}

function fuzzyScore(query: string, value: string, base: number) {
  if (query.length < 3) return 0;

  const queryWords = words(query);
  const valueWords = words(value);

  let best = 0;

  for (const q of queryWords) {
    if (q.length < 3) continue;

    for (const candidate of valueWords) {
      if (candidate.length < 3) continue;

      const maxLen = Math.max(q.length, candidate.length);
      const allowed = maxLen >= 8 ? 2 : 1;
      const distance = levenshtein(q, candidate);

      if (distance <= allowed) {
        best = Math.max(
          best,
          base + 110 - distance * 45 + Math.min(q.length, candidate.length),
        );
      }
    }
  }

  return best;
}

function scoreItem(item: InstantSearchIndexItem, query: string) {
  const forms = formsForQuery(query);
  if (!forms.length) return 0;

  const shortQuery = normalizeSearchText(query).length <= 1;
  let best = 0;

  for (const form of forms) {
    best = Math.max(best, exactPrefixContainsScore(form, item.titleSearch, 1650));
    best = Math.max(best, exactPrefixContainsScore(form, item.merchantSearch, 1580));

    if (!shortQuery) {
      best = Math.max(best, exactPrefixContainsScore(form, item.contextSearch, 760));
      best = Math.max(best, fuzzyScore(form, item.titleSearch, 1180));
      best = Math.max(best, fuzzyScore(form, item.merchantSearch, 1120));
    }
  }

  if (!best) return 0;
  if (item.featured) best += 20;
  if (item.verified) best += 12;

  return best;
}

export function rankInstantGiftCards(
  items: InstantSearchIndexItem[],
  query: string,
  limit = 8,
) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return items
    .map((item) => ({ item, score: scoreItem(item, trimmed) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.merchantName.localeCompare(b.item.merchantName, "el") ||
        a.item.title.localeCompare(b.item.title, "el"),
    )
    .slice(0, limit)
    .map(({ item }) => item);
}
