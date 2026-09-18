Dorokartes Smart Search v3 — instant local index

What changes:
- Search index is prefetched once from /api/public/search/index.
- Every keystroke is ranked locally in the browser: no API round-trip per character.
- Dropdown contains gift cards only.
- No headings, "popular", category, occasion, merchant or extra CTA rows.
- Merchant logo + gift-card title + merchant name only.
- Exact/prefix > merchant/title > aliases/Greeklish > typo fuzzy > context.
- Category and Occasion large gradient hero blocks remain removed.

Install:
1. Extract over D:\dorokartes preserving paths.
2. Run:
   npm run build
3. If build passes:
   git add .
   git commit -m "Add instant local predictive gift card search"
   git push origin main
   npx vercel deploy --prod

Production smoke tests:
- https://dorokartes.gr/api/public/search/index
- Search: adidas, addidas, rouxa, ρουχα, spa, paidi, παιδι, genethlia
