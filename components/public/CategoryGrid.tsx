import Link from "next/link";

const iconAliases: Record<string, string> = {
  shirt: "👕",
  sparkles: "✨",
  laptop: "💻",
  "gamepad-2": "🎮",
  play: "▶",
  house: "🏠",
  dumbbell: "🏋",
  baby: "👶",
  "book-open": "📚",
  palette: "🎨",
  music: "🎵",
  utensils: "🍴",
  "chef-hat": "🍽",
  plane: "✈",
  hotel: "🏨",
  ticket: "🎟",
  "graduation-cap": "🎓",
  "flower-2": "🌿",
  gem: "💎",
  "heart-pulse": "✚",
  stethoscope: "🩺",
  "paw-print": "🐾",
  "car-front": "🚗",
  cigarette: "🚬",
  store: "🏬",
  "shopping-bag": "🛍",
  "briefcase-business": "💼",
};

export type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  _count?: { giftCards?: number };
};

export default function CategoryGrid({ categories }: { categories: CategoryItem[] }) {
  return (
    <div className="dk21-category-grid">
      {categories.map((category, index) => {
        const count = category._count?.giftCards || 0;
        const icon = category.icon ? iconAliases[category.icon.toLowerCase()] : null;

        return (
          <Link
            key={category.id}
            prefetch={false}
            href={`/categories/${category.slug}`}
            className={`dk21-category-card tone-${index % 6}`}
          >
            <div className="dk21-category-icon" aria-hidden="true">{icon || "▦"}</div>
            <div className="dk21-category-copy">
              <b>{category.name}</b>
              <span>{`${count} ${count === 1 ? "επιλογή" : "επιλογές"}`}</span>
            </div>
            <div className="dk21-category-arrow" aria-hidden="true">→</div>
          </Link>
        );
      })}
    </div>
  );
}
