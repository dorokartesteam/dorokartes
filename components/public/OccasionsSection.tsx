import Link from "next/link";

const occasionIcons: Record<string, string> = {
  cake: "🎂",
  gift: "🎁",
  heart: "♥",
  ring: "💍",
  baby: "👶",
  tree: "🎄",
  flower: "🌷",
  trophy: "🏅",
  party: "🎉",
  briefcase: "💼",
  "teddy-bear": "🧸",
  sparkles: "✨",
};

export type OccasionItem = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  _count?: { giftCards?: number };
};

export function occasionDisplayIcon(icon: string | null) {
  if (!icon) return "✦";
  return occasionIcons[icon.toLowerCase()] ||
    (/\p{Extended_Pictographic}/u.test(icon) ? icon : "✦");
}

export default function OccasionsSection({ occasions }: { occasions: OccasionItem[] }) {
  return (
    <section className="dk20-section dk20-occasions" id="occasions">
      <div className="dk20-shell">
        <div className="dk20-heading-row">
          <div>
            <div className="dk20-section-eyebrow">ΓΙΑ ΚΑΘΕ ΣΤΙΓΜΗ</div>
            <h2>Για ποια περίσταση;</h2>
            <p>Γενέθλια, γιορτή, επέτειος, νέο μωρό, Χριστούγεννα και πολλά ακόμη.</p>
          </div>
          <Link href="/occasions">Όλες οι περιστάσεις <span>→</span></Link>
        </div>

        <div className="dk20-occasion-grid">
          {occasions.map((occasion, index) => (
            <Link key={occasion.id} prefetch={false} href={`/occasions/${occasion.slug}`} className={`tone-${index % 6}`}>
              <div className="dk20-occasion-icon" aria-hidden="true">{occasionDisplayIcon(occasion.icon)}</div>
              <b>{occasion.name}</b>
              <span>
                {occasion._count?.giftCards || 0}
                {" "}
                {occasion._count?.giftCards === 1 ? "δωροκάρτα" : "δωροκάρτες"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
