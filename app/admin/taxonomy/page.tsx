import { getTaxonomyData } from "@/lib/admin/data";
import { PageIntro, Panel } from "@/components/admin/AdminUI";

const ICONS: Record<string, string> = {
  shirt: "👕",
  sparkles: "✨",
  laptop: "💻",
  "gamepad-2": "🎮",
  play: "▶",
  house: "⌂",
  dumbbell: "🏋",
  baby: "👶",
  "book-open": "📚",
  utensils: "🍴",
  "chef-hat": "👨‍🍳",
  plane: "✈",
  hotel: "🏨",
  ticket: "🎟",
  "flower-2": "🌸",
  gem: "💎",
  "heart-pulse": "💗",
  store: "🏬",
  "shopping-bag": "🛍",
  "briefcase-business": "💼",
  cake: "🎂",
  gift: "🎁",
  heart: "♥",
  "hand-heart": "🤲",
  "graduation-cap": "🎓",
  "tree-pine": "🎄",
  egg: "🥚",
  flower: "🌷",
  badge: "🏅",
  "party-popper": "🎉",
  venus: "♀",
  mars: "♂",
  "teddy-bear": "🧸",
  smile: "☺",
};

function iconFor(value?: string | null, fallback = "✦") {
  if (!value) return fallback;
  const key = value.trim().toLowerCase();
  return ICONS[key] || (value.length <= 3 ? value : fallback);
}

function TaxonomyList({ rows, kind }: { rows: any[]; kind: "category" | "occasion" }) {
  return (
    <div className="dk-taxgrid dk-taxgrid-v4">
      {rows.map((x: any) => (
        <div className="dk-taxcard dk-taxcard-v4" key={x.id}>
          <span className="dk-taxicon dk-taxicon-v4" aria-hidden="true">
            {iconFor(x.icon, kind === "category" ? "◫" : "✦")}
          </span>

          <div className="dk-taxcopy">
            <b>{x.name}</b>
            <small>/{x.slug}</small>
          </div>

          <em className="dk-taxorder">#{x.sortOrder ?? 0}</em>
        </div>
      ))}
    </div>
  );
}

export default async function TaxonomyPage() {
  const d = await getTaxonomyData();

  return (
    <>
      <PageIntro
        title="Taxonomy"
        text="Categories and occasions power navigation, filters, SEO landing pages and homepage collections."
      />

      <div className="dk-grid2 dk-taxonomy-layout">
        <Panel title={`Categories (${d.categories.length})`} subtitle="Ordering and publication map">
          <TaxonomyList rows={d.categories} kind="category" />
        </Panel>

        <Panel title={`Occasions (${d.occasions.length})`} subtitle="Gift intent and recipient discovery">
          <TaxonomyList rows={d.occasions} kind="occasion" />
        </Panel>
      </div>
    </>
  );
}
