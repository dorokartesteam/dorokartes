Dorokartes Search/UI v2

Changes:
1. Predictive search now returns ONLY gift cards.
2. No Popular/Proposals headings, no category/occasion/merchant suggestions.
3. Search starts at 2 characters and uses a 70ms debounce for faster feedback.
4. Category index: removed the large gradient hero/snapshot entirely.
5. Occasion index: removed the large gradient hero/snapshot entirely.

Install:
Copy the included folders over D:\dorokartes preserving paths.
Then run:
  npm run build
If successful:
  git add .
  git commit -m "Simplify predictive search and taxonomy pages"
  git push origin main
  npx vercel deploy --prod
