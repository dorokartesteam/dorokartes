import Link from "next/link";
import GiftCardCard from "@/components/public/GiftCardCard";
import PublicPagination from "@/components/public/PublicPagination";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import type { PublicCard } from "@/lib/public/data";

type TaxonomyLandingProps = {
  kind: "category" | "occasion";
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  cards: PublicCard[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
};

const iconAliases: Record<string, string> = {
  shirt: "👕",
  sparkles: "✨",
  laptop: "💻",
  gamepad: "🎮",
  "gamepad-2": "🎮",
  play: "▶",
  home: "🏠",
  house: "🏠",
  dumbbell: "🏋",
  baby: "👶",
  book: "📚",
  "book-open": "📚",
  palette: "🎨",
  music: "🎵",
  utensils: "🍴",
  "chef-hat": "🍽",
  plane: "✈",
  hotel: "🏨",
  ticket: "🎟",
  "graduation-cap": "🎓",
  diamond: "💎",
  gem: "💎",
  "flower-2": "🌿",
  "heart-pulse": "✚",
  stethoscope: "🩺",
  "paw-print": "🐾",
  "car-front": "🚗",
  cigarette: "🚬",
  store: "🏬",
  "shopping-bag": "🛍",
  "briefcase-business": "💼",
  cake: "🎂",
  gift: "🎁",
  heart: "♥",
  ring: "💍",
  tree: "🎄",
  flower: "🌷",
  trophy: "🏅",
  party: "🎉",
  briefcase: "💼",
  "teddy-bear": "🧸",
};

function displayIcon(icon: string | null, fallback: string) {
  if (!icon) return fallback;
  const alias = iconAliases[icon.toLowerCase()];
  if (alias) return alias;
  return /\p{Extended_Pictographic}/u.test(icon) ? icon : fallback;
}

export default function TaxonomyLanding({
  kind,
  name,
  slug,
  description,
  icon,
  cards,
  totalCount,
  currentPage,
  totalPages,
}: TaxonomyLandingProps) {
  const isCategory = kind === "category";
  const label = isCategory ? "ΚΑΤΗΓΟΡΙΑ" : "ΠΕΡΙΣΤΑΣΗ";
  const browseParam = isCategory ? "category" : "occasion";
  const fallback = isCategory
    ? `Ανακάλυψε ενεργές δωροκάρτες στην κατηγορία «${name}» και συνέχισε στον ιστότοπο του εμπόρου.`
    : `Ιδέες για δωροκάρτες που ταιριάζουν στην περίσταση «${name}», από καταστήματα και υπηρεσίες.`;

  return (
    <div className="dk-public">
      <PublicHeader />

      <main className="dk25-taxonomy-page">
        <div className="dk20-shell">
          <nav className="dk24-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Αρχική</Link>
            <span>›</span>
            <Link href={isCategory ? "/categories" : "/occasions"}>
              {isCategory ? "Κατηγορίες" : "Περιστάσεις"}
            </Link>
            <span>›</span>
            <b>{name}</b>
          </nav>

          <section className={`dk25-taxonomy-hero ${isCategory ? "category" : "occasion"}`}>
            <div className="dk25-taxonomy-icon" aria-hidden="true">
              {displayIcon(icon, isCategory ? "▦" : "✦")}
            </div>
            <div className="dk25-taxonomy-copy">
              <span>{label}</span>
              <h1>{name}</h1>
              <p>{description || fallback}</p>
            </div>
            <Link href={`/browse?${browseParam}=${encodeURIComponent(slug)}`}>
              Προβολή στον κατάλογο <b>→</b>
            </Link>
          </section>

          <div className="dk25-taxonomy-results">
            <div>
              <span>ΕΝΕΡΓΕΣ ΕΠΙΛΟΓΕΣ</span>
              <h2>{totalCount.toLocaleString("el-GR")} {totalCount === 1 ? "δωροκάρτα" : "δωροκάρτες"}</h2>
              {totalPages > 1 ? (
                <p className="dk29-pagination-summary">
                  Σελίδα {currentPage} από {totalPages}
                </p>
              ) : null}
            </div>
            <Link href="/browse">Όλος ο κατάλογος <b>→</b></Link>
          </div>

          {cards.length > 0 ? (
            <div className="dk-public-card-grid dk-public-browse-grid">
              {cards.map((card) => (
                <GiftCardCard key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="dk-public-empty">
              <b>Δεν υπάρχουν ακόμη ενεργές δωροκάρτες εδώ.</b>
              <p>Ο κατάλογος ενημερώνεται συνεχώς με νέες επιλογές.</p>
              <Link href="/browse">Δες όλες τις δωροκάρτες</Link>
            </div>
          )}

          <PublicPagination
            basePath={isCategory ? `/categories/${slug}` : `/occasions/${slug}`}
            currentPage={currentPage}
            totalPages={totalPages}
            ariaLabel={`Σελιδοποίηση για ${name}`}
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
