import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import GiftCardCard from "@/components/public/GiftCardCard";
import { prisma } from "@/lib/prisma";
import { publicCardSelect } from "@/lib/public/data";
import {
  getGiftCardIdsForRegion,
  getRegionOptions,
} from "@/lib/regions/region-assignment";

export const dynamic = "force-dynamic";

function decodeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

async function getRegion(slug: string) {
  const decoded = decodeSlug(slug);
  const regions = await getRegionOptions();
  return regions.find((region) => region.slug === decoded) || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const region = await getRegion(slug);

  if (!region) {
    return {
      title: "Περιοχή δεν βρέθηκε",
      robots: { index: false, follow: false },
    };
  }

  const indexable = region.count >= 3;
  const title = `Δωροκάρτες σε ${region.label}`;
  const description =
    `Ανακάλυψε δωροκάρτες από επιχειρήσεις με επαληθευμένη φυσική παρουσία σε ${region.label}. ` +
    `${region.count} διαθέσιμες επιλογές στο Dorokartes.gr.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/regions/${encodeURIComponent(region.slug)}`,
    },
    robots: {
      index: indexable,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: `/regions/${encodeURIComponent(region.slug)}`,
    },
  };
}

export default async function RegionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const region = await getRegion(slug);

  if (!region) notFound();

  const ids = await getGiftCardIdsForRegion(region.slug);

  const cards = ids.length
    ? await prisma.giftCard.findMany({
        where: {
          id: { in: ids },
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
        },
        orderBy: [{ featured: "desc" }, { title: "asc" }],
        select: publicCardSelect,
      })
    : [];

  return (
    <div className="dk-public">
      <PublicHeader />

      <main>
        <section className="dk20-shell" style={{ paddingTop: "48px", paddingBottom: "24px" }}>
          <nav className="dk-public-filter-row" aria-label="Πλοήγηση περιοχών">
            <Link href="/regions">Όλες οι περιοχές</Link>
            <span aria-current="page">{region.label}</span>
          </nav>

          <div style={{ maxWidth: "820px", marginTop: "28px" }}>
            <span>ΔΩΡΟΚΑΡΤΕΣ ΑΝΑ ΠΕΡΙΟΧΗ</span>
            <h1>Δωροκάρτες σε {region.label}</h1>
            <p>
              Ανακάλυψε δωροκάρτες από επιχειρήσεις με επαληθευμένη φυσική παρουσία
              στην περιοχή {region.label}. Η φυσική παρουσία ενός εμπόρου δεν σημαίνει
              απαραίτητα ότι κάθε δωροκάρτα αγοράζεται ή εξαργυρώνεται στο κατάστημα.
            </p>
          </div>
        </section>

        <section className="dk20-shell" style={{ paddingBottom: "72px" }}>
          <div className="dk28-section-heading">
            <div>
              <span>{region.label}</span>
              <h2>{cards.length} δωροκάρτες</h2>
            </div>
            <Link href={`/regions?region=${encodeURIComponent(region.slug)}`}>
              Δες τα φυσικά σημεία
            </Link>
          </div>

          {cards.length ? (
            <div className="dk20-card-grid">
              {cards.map((card) => (
                <GiftCardCard key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="dk28-region-empty">
              <b>Δεν υπάρχουν διαθέσιμες δωροκάρτες για αυτή την περιοχή.</b>
              <p>Η κάλυψη ενημερώνεται καθώς επαληθεύονται νέα φυσικά σημεία.</p>
              <Link href="/regions">Δες όλες τις περιοχές</Link>
            </div>
          )}
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
