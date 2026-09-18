export type SearchField = {
  value: string | null | undefined;
  weight: number;
};

const greekDigraphs: Array<[RegExp, string]> = [
  [/ου/g, "ou"],
  [/αι/g, "ai"],
  [/ει/g, "ei"],
  [/οι/g, "oi"],
  [/υι/g, "yi"],
  [/αυ/g, "av"],
  [/ευ/g, "ev"],
  [/μπ/g, "b"],
  [/ντ/g, "d"],
  [/γκ/g, "g"],
  [/γγ/g, "ng"],
  [/τσ/g, "ts"],
  [/τζ/g, "tz"],
];

const greekChars: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th",
  ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p",
  ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "x", ψ: "ps", ω: "o",
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

function stripMarks(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeSearchText(value: string) {
  return stripMarks(value)
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function greekToLatin(value: string) {
  let normalized = normalizeSearchText(value);
  for (const [pattern, replacement] of greekDigraphs) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized
    .split("")
    .map((char) => greekChars[char] ?? char)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasForms(query: string) {
  const normalized = normalizeSearchText(query);
  const latin = greekToLatin(query);
  const output = new Set<string>([normalized, latin]);

  for (const group of aliasGroups) {
    const groupForms = group.flatMap((term) => [normalizeSearchText(term), greekToLatin(term)]);
    const matched = groupForms.some((term) =>
      term && (normalized === term || latin === term || normalized.includes(term) || latin.includes(term)),
    );
    if (matched) {
      for (const term of groupForms) if (term) output.add(term);
    }
  }

  return [...output].filter(Boolean);
}

function tokens(value: string) {
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
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function fuzzyTokenScore(query: string, candidate: string) {
  if (query.length < 3 || candidate.length < 3) return 0;
  const distance = levenshtein(query, candidate);
  const allowed = Math.max(query.length, candidate.length) >= 7 ? 2 : 1;
  if (distance > allowed) return 0;
  return 0.46 + (allowed - distance) * 0.08;
}

function matchStrength(queryForm: string, candidateRaw: string) {
  const candidateNormalized = normalizeSearchText(candidateRaw);
  const candidateLatin = greekToLatin(candidateRaw);
  const candidateForms = candidateNormalized === candidateLatin
    ? [candidateNormalized]
    : [candidateNormalized, candidateLatin];

  let best = 0;
  for (const candidate of candidateForms) {
    if (!candidate) continue;
    if (candidate === queryForm) best = Math.max(best, 1);
    else if (candidate.startsWith(queryForm)) best = Math.max(best, 0.88);
    else if (candidate.includes(queryForm)) best = Math.max(best, 0.7);

    const qTokens = tokens(queryForm);
    const cTokens = tokens(candidate);
    if (qTokens.length) {
      const matched = qTokens.filter((qToken) => cTokens.some((cToken) => cToken === qToken)).length;
      if (matched) best = Math.max(best, 0.76 * (matched / qTokens.length));

      for (const qToken of qTokens) {
        for (const cToken of cTokens) {
          best = Math.max(best, fuzzyTokenScore(qToken, cToken));
        }
      }
    }
  }

  return best;
}

export function scoreSearchFields(query: string, fields: SearchField[]) {
  const forms = aliasForms(query);
  if (!forms.length) return 0;

  let total = 0;
  for (const field of fields) {
    if (!field.value) continue;
    let fieldBest = 0;
    for (const form of forms) fieldBest = Math.max(fieldBest, matchStrength(form, field.value));
    total = Math.max(total, fieldBest * field.weight);
  }

  return Math.round(total);
}

export function isSearchScoreRelevant(score: number) {
  return score >= 240;
}
