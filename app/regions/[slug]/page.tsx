import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import GiftCardCard from "@/components/public/GiftCardCard";
import PublicPagination from "@/components/public/PublicPagination";
import { prisma } from "@/lib/prisma";
import {
  parsePublicPage,
  publicCardSelect,
} from "@/lib/public/data";
import {
  getGiftCardIdsForRegion,
  getRegionOptions,
} from "@/lib/regions/region-assignment";

export const dynamic = "force-dynamic";

const fallbackBaseUrl = "https://dorokartes.gr";
const REGION_PAGE_SIZE = 24;

function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || fallbackBaseUrl;

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallbackBaseUrl;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallbackBaseUrl;
  }
}

function decodeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

async function getRegion(slug: string) {
  const decoded = decodeSlug(slug);
  const regions = await getRegionOptions();
  return regions.find((region) => region.slug === decoded) || null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const region = await getRegion(slug);

  if (!region) {
    return {
      title: "Περιοχή δεν βρέθηκε",
      robots: { index: false, follow: false },
    };
  }

  const currentPage = parsePublicPage(query.page);
  const totalPages = Math.max(1, Math.ceil(region.count / REGION_PAGE_SIZE));
  const validPage = currentPage <= totalPages;
  const indexable = region.count >= 3 && validPage;

  const baseTitle = `Δωροκάρτες σε ${region.label}`;
  const title = currentPage > 1 ? `${baseTitle} – Σελίδα ${currentPage}` : baseTitle;
  const description =
    `Ανακάλυψε δωροκάρτες από επιχειρήσεις με επαληθευμένη φυσική παρουσία σε ${region.label}. ` +
    `${region.count} διαθέσιμες επιλογές στο Dorokartes.gr.`;

  const canonical =
    currentPage > 1
      ? `/regions/${encodeURIComponent(region.slug)}?page=${currentPage}`
      : `/regions/${encodeURIComponent(region.slug)}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: {
      index: indexable,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: canonical,
    },
  };
}

export default async function RegionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const region = await getRegion(slug);

  if (!region) notFound();

  const currentPage = parsePublicPage(query.page);
  const ids = await getGiftCardIdsForRegion(region.slug);
  const totalCards = ids.length;
  const totalPages = Math.max(1, Math.ceil(totalCards / REGION_PAGE_SIZE));

  if (currentPage > totalPages) notFound();

  const start = (currentPage - 1) * REGION_PAGE_SIZE;
  const pageIds = ids.slice(start, start + REGION_PAGE_SIZE);

  const cards = pageIds.length
    ? await prisma.giftCard.findMany({
        where: {
          id: { in: pageIds },
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
        },
        orderBy: [{ featured: "desc" }, { title: "asc" }],
        select: publicCardSelect,
      })
    : [];

  const base = getBaseUrl();
  const regionPath = `/regions/${encodeURIComponent(region.slug)}`;
  const regionUrl =
    currentPage > 1
      ? `${base}${regionPath}?page=${currentPage}`
      : `${base}${regionPath}`;

  const description =
    `Ανακάλυψε δωροκάρτες από επιχειρήσεις με επαληθευμένη φυσική παρουσία σε ${region.label}. ` +
    `${totalCards} διαθέσιμες επιλογές στο Dorokartes.gr.`;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${regionUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Αρχική",
            item: `${base}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Περιοχές",
            item: `${base}/regions`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: region.label,
            item: currentPage > 1 ? `${base}${regionPath}` : regionUrl,
          },
        ],
      },
      {
        "@type": "CollectionPage",
        "@id": `${regionUrl}#collection`,
        url: regionUrl,
        name:
          currentPage > 1
            ? `Δωροκάρτες σε ${region.label} – Σελίδα ${currentPage}`
            : `Δωροκάρτες σε ${region.label}`,
        description,
        inLanguage: "el-GR",
        isPartOf: {
          "@type": "WebSite",
          "@id": `${base}/#website`,
          url: base,
          name: "Dorokartes.gr",
        },
        breadcrumb: {
          "@id": `${regionUrl}#breadcrumb`,
        },
        mainEntity: {
          "@id": `${regionUrl}#itemlist`,
        },
      },
      {
        "@type": "ItemList",
        "@id": `${regionUrl}#itemlist`,
        name:
          currentPage > 1
            ? `Δωροκάρτες σε ${region.label} – Σελίδα ${currentPage}`
            : `Δωροκάρτες σε ${region.label}`,
        numberOfItems: cards.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: cards.map((card, index) => ({
          "@type": "ListItem",
          position: start + index + 1,
          url: `${base}/gift-cards/${encodeURIComponent(card.slug)}`,
          name: card.title,
        })),
      },
    ],
  };

  return (
    <div className="dk-public">
      <PublicHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />

      <main>
        <section className="dk20-shell" style={{ paddingTop: "48px", paddingBottom: "24px" }}>
          <nav className="dk-public-filter-row" aria-label="Πλοήγηση περιοχών">
            <Link href="/regions">Όλες οι περιοχές</Link>
            <span aria-current="page">{region.label}</span>
          </nav>

          <div style={{ maxWidth: "820px", marginTop: "28px" }}>
            <span>ΔΩΡΟΚΑΡΤΕΣ ΑΝΑ ΠΕΡΙΟΧΗ</span>
            <h1>
              Δωροκάρτες σε {region.label}
              {currentPage > 1 ? ` – Σελίδα ${currentPage}` : ""}
            </h1>
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
              <h2>{totalCards} δωροκάρτες</h2>
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

          <PublicPagination
            basePath={regionPath}
            currentPage={currentPage}
            totalPages={totalPages}
            query={{}}
            ariaLabel={`Σελιδοποίηση δωροκαρτών για ${region.label}`}
          />
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
