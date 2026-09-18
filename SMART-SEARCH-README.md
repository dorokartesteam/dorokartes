# Dorokartes Smart Search v1

Changed/new files:
- `components/public/HeroSearch.tsx`
- `lib/public/search.ts`
- `lib/public/data.ts`
- `app/browse/page.tsx`
- `app/api/public/search/suggestions/route.ts`
- `app/public-v2-7-premium.css`

What it adds:
- Shared predictive search for homepage + `/browse`
- Live autocomplete for merchants, gift cards, categories, occasions
- Greek accent/case normalization
- Greek -> Greeklish matching
- Curated aliases/synonyms for major intents
- Typo-tolerant fuzzy fallback
- Weighted relevance (merchant/title > taxonomy > description)
- Featured/verified small ranking boosts
- Keyboard navigation (up/down/enter/escape)
- Popular suggestions on empty focus
- Browse results ranked with the same relevance engine

After copying files into the project:
1. Run `npm run build`.
2. Test homepage search and `/browse` search with: `zarra`, `ρουχα`, `rouxa`, `γυναικα`, `gynaika`, `spa`, `gaming`, `γενεθλια`.
3. Deploy only after the production build passes.
