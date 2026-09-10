export default function HeroSearch({
  initial = "",
  category,
  occasion,
}: {
  initial?: string;
  category?: string;
  occasion?: string;
}) {
  return (
    <form className="dk14-search" action="/browse" method="get" role="search">
      <span className="dk14-search-icon" aria-hidden="true">⌕</span>
      <input
        name="q"
        defaultValue={initial}
        placeholder="Sephora, spa, gaming, παιδί, ρούχα..."
        aria-label="Αναζήτηση δωροκάρτας"
      />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      {occasion ? <input type="hidden" name="occasion" value={occasion} /> : null}
      <button type="submit">Αναζήτηση</button>
    </form>
  );
}
