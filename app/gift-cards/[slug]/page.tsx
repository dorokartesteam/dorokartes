import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import MerchantLogo from "@/components/public/MerchantLogo";
import GiftCardCard from "@/components/public/GiftCardCard";
import { getRelatedCards } from "@/lib/public/data";
import { prisma } from "@/lib/prisma";
import CatalogView from "@/components/analytics/CatalogView";
import CatalogOutboundLink from "@/components/analytics/CatalogOutboundLink";

export const dynamic = "force-dynamic";

const variantTypeLabels: Record<string, string> = {
  DIGITAL: "Ψηφιακή",
  PHYSICAL: "Φυσική κάρτα",
  DIGITAL_AND_PHYSICAL: "Ψηφιακή & φυσική",
  CORPORATE: "Εταιρική",
  EXPERIENCE: "Εμπειρία",
  THIRD_PARTY_PREPAID: "Προπληρωμένη",
};

const redemptionLabels: Record<string, string> = {
  ONLINE: "Online",
  PHYSICAL_STORE: "Σε κατάστημα",
  APP: "Σε εφαρμογή",
  PHONE: "Τηλεφωνικά",
  EMAIL: "Μέσω email",
};

const deliveryLabels: Record<string, string> = {
  EMAIL: "Email",
  SMS: "SMS",
  VIBER: "Viber",
  PHYSICAL_DELIVERY: "Αποστολή",
  STORE_PICKUP: "Παραλαβή από κατάστημα",
  INSTANT_CODE: "Άμεσος κωδικός",
  PRINTABLE: "Εκτυπώσιμη",
};

type VariantSummary = {
  name: string | null;
  type: string;
  currency: string;
  minValue: { toString(): string } | null;
  maxValue: { toString(): string } | null;
  customValueAllowed: boolean;
  validityText: string | null;
  validityMonths: number | null;
  values: { value: { toString(): string } }[];
  redemptions: { channel: string }[];
  deliveries: { method: string }[];
};

const fallbackBaseUrl = "https://dorokartes.gr";

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

const getGiftCardPage = cache(async (slug: string) =>
  prisma.giftCard.findFirst({
    where: {
      slug: decodeSlug(slug),
      status: "ACTIVE",
      merchant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      shortDescription: true,
      description: true,
      seoTitle: true,
      metaDescription: true,
      officialUrl: true,
      termsUrl: true,
      validityText: true,
      validityMonths: true,
      personalizationAvailable: true,
      corporateAvailable: true,
      verificationStatus: true,
      lastVerifiedAt: true,
      merchant: {
        select: {
          id: true,
          name: true,
          slug: true,
          websiteUrl: true,
          logoUrl: true,
        },
      },
      categories: {
        where: { category: { active: true } },
        orderBy: { primary: "desc" },
        take: 4,
        select: {
          primary: true,
          category: { select: { name: true, slug: true } },
        },
      },
      occasions: {
        where: { occasion: { active: true } },
        take: 6,
        orderBy: { relevance: "desc" },
        select: {
          occasion: { select: { name: true, slug: true } },
        },
      },
      variants: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          type: true,
          currency: true,
          minValue: true,
          maxValue: true,
          customValueAllowed: true,
          validityText: true,
          validityMonths: true,
          values: {
            orderBy: { value: "asc" },
            select: { value: true },
          },
          redemptions: { select: { channel: true } },
          deliveries: { select: { method: true } },
        },
      },
    },
  }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await getGiftCardPage(slug);

  if (!card) {
    return {
      title: "Η δωροκάρτα δεν βρέθηκε",
      robots: { index: false, follow: false },
    };
  }

  const title = card.seoTitle?.trim() || card.title + " από " + card.merchant.name;
  const description =
    card.metaDescription?.trim() ||
    card.shortDescription?.trim() ||
    card.description?.trim() ||
    "Δες πληροφορίες για τη " + card.title + " από " + card.merchant.name + " και συνέχισε στη σελίδα αγοράς του εμπόρου.";
  const baseUrl = getBaseUrl();
  const canonical = baseUrl + "/gift-cards/" + encodeURIComponent(card.slug);
  const indexable = card.verificationStatus === "VERIFIED";

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      siteName: "Dorokartes.gr",
      images: card.merchant.logoUrl
        ? [{ url: new URL(card.merchant.logoUrl, baseUrl + "/").toString(), alt: card.merchant.name }]
        : undefined,
    },
  };
}

function formatMoney(value: { toString(): string }, currency: string) {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value.toString()));
}

function amountSummary(variant: VariantSummary) {
  if (variant.values.length > 0) {
    const values = variant.values.slice(0, 8).map(({ value }) => formatMoney(value, variant.currency));
    const extra = variant.values.length - values.length;
    return `${values.join(", ")}${extra > 0 ? ` +${extra}` : ""}`;
  }

  if (variant.minValue && variant.maxValue) {
    const range = `${formatMoney(variant.minValue, variant.currency)} – ${formatMoney(variant.maxValue, variant.currency)}`;
    return variant.customValueAllowed ? `${range} · επιλογή ποσού` : range;
  }

  if (variant.minValue) return `Από ${formatMoney(variant.minValue, variant.currency)}`;
  if (variant.maxValue) return `Έως ${formatMoney(variant.maxValue, variant.currency)}`;
  if (variant.customValueAllowed) return "Ελεύθερη επιλογή ποσού";
  return "Δεν έχει καταχωρηθεί";
}

export default async function GiftCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getGiftCardPage(slug);

  if (!card) notFound();

  const logo = card.merchant.logoUrl || null;
  const verified = card.verificationStatus === "VERIFIED";
  const relatedCards = await getRelatedCards({ ...card, merchantId: card.merchant.id });
  const analyticsContext = {
    merchantId: card.merchant.id, giftCardId: card.id,
    category: card.categories[0]?.category.slug,
    pageType: "gift_card" as const, sourcePath: `/gift-cards/${encodeURIComponent(card.slug)}`,
  };

  return (
    <div className="dk-public">
      <CatalogView {...analyticsContext} />
      <PublicHeader />

      <main className="dk24-detail">
        <div className="dk20-shell">
          <div className="dk24-breadcrumbs">
            <Link href="/">Αρχική</Link>
            <span>›</span>
            <Link href="/browse">Δωροκάρτες</Link>
            <span>›</span>
            <b>{card.merchant.name}</b>
          </div>

          <section className="dk24-detail-hero">
            <div className="dk24-detail-visual">
              <div className="dk24-detail-glow one" />
              <div className="dk24-detail-glow two" />

              <div className="dk24-detail-logo">
                <MerchantLogo name={card.merchant.name} src={logo} variant="detail" />
              </div>

              <div className="dk24-detail-visual-label">
                <span>ΔΩΡΟΚΑΡΤΑ</span>
                <b>{card.merchant.name}</b>
              </div>
            </div>

            <div className="dk24-detail-info">
              {verified && (
                <div className="dk24-detail-kicker">
                  <span className="verified">✓ Επιβεβαιωμένη καταχώρηση</span>
                  <span>Επίσημος έμπορος</span>
                </div>
              )}

              <h1>{card.title}</h1>

              <p className="dk24-detail-description">
                {card.shortDescription ||
                  card.description ||
                  `Δωροκάρτα από ${card.merchant.name}. Δες τις διαθέσιμες πληροφορίες και συνέχισε στον ιστότοπο του εμπόρου.`}
              </p>

              <div className="dk24-detail-tags">
                {card.categories.map((x) => (
                  <Link key={x.category.slug} href={`/categories/${x.category.slug}`}>
                    {x.category.name}
                  </Link>
                ))}
              </div>

              <div className="dk24-detail-actions">
                <CatalogOutboundLink className="primary" context={analyticsContext}>
                  {verified ? "Μετάβαση στον επίσημο έμπορο" : "Μετάβαση στον ιστότοπο του εμπόρου"} <b>↗</b>
                </CatalogOutboundLink>

                <Link className="secondary" href={`/brands/${card.merchant.slug}`}>
                  Προφίλ καταστήματος
                </Link>
              </div>

              <div className="dk24-trust-note">
                <b>{verified ? "Αγορά από τον επίσημο έμπορο" : "Η αγορά ολοκληρώνεται στον έμπορο"}</b>
                <span>Το Dorokartes δεν εκδίδει ούτε πουλά δωροκάρτες.</span>
              </div>
            </div>
          </section>

          <section className="dk24-detail-grid">
            <article className="dk24-info-card">
              <span>ΠΛΗΡΟΦΟΡΙΕΣ</span>
              <h2>Στοιχεία δωροκάρτας</h2>

              <dl>
                <div>
                  <dt>Έμπορος</dt>
                  <dd>{card.merchant.name}</dd>
                </div>
                {(card.validityText || card.validityMonths != null) && (
                  <div>
                    <dt>Ισχύς</dt>
                    <dd>{card.validityText || `${card.validityMonths} μήνες`}</dd>
                  </div>
                )}
                {card.personalizationAvailable === true && (
                  <div>
                    <dt>Προσωποποίηση</dt>
                    <dd>Διαθέσιμη</dd>
                  </div>
                )}
                {card.corporateAvailable === true && (
                  <div>
                    <dt>Εταιρικά δώρα</dt>
                    <dd>Διαθέσιμα</dd>
                  </div>
                )}
              </dl>
            </article>

            <article className="dk24-info-card">
              <span>{verified ? "ΕΠΙΣΗΜΟΙ ΣΥΝΔΕΣΜΟΙ" : "ΣΥΝΔΕΣΜΟΙ ΕΜΠΟΡΟΥ"}</span>
              <h2>Στον έμπορο</h2>

              <div className="dk24-link-stack">
                <CatalogOutboundLink context={analyticsContext}>
                  {verified ? "Επίσημη σελίδα δωροκάρτας" : "Σελίδα δωροκάρτας στον έμπορο"} <b>↗</b>
                </CatalogOutboundLink>

                {card.merchant.websiteUrl && (
                  <a href={card.merchant.websiteUrl} target="_blank" rel="noreferrer">
                    Ιστότοπος {card.merchant.name} <b>↗</b>
                  </a>
                )}

                {card.termsUrl && (
                  <a href={card.termsUrl} target="_blank" rel="noreferrer">
                    Όροι δωροκάρτας <b>↗</b>
                  </a>
                )}
              </div>
            </article>
          </section>

          {card.variants.length > 0 && (
            <section className="dk25-variants">
              <div className="dk25-variants-head">
                <div>
                  <span>ΔΙΑΘΕΣΙΜΕΣ ΕΠΙΛΟΓΕΣ</span>
                  <h2>Μορφές, ποσά και χρήση</h2>
                </div>
                <p>Οι τελικές επιλογές και η διαθεσιμότητα επιβεβαιώνονται στον ιστότοπο του εμπόρου.</p>
              </div>

              <div className="dk25-variant-grid">
                {card.variants.map((variant, index) => (
                  <article key={`${variant.type}-${variant.name || "variant"}-${index}`}>
                    <span>{variantTypeLabels[variant.type] || variant.type}</span>
                    <h3>{variant.name || `Επιλογή ${index + 1}`}</h3>
                    <dl>
                      <div>
                        <dt>Ποσά</dt>
                        <dd>{amountSummary(variant)}</dd>
                      </div>
                      {variant.redemptions.length > 0 && (
                        <div>
                          <dt>Εξαργύρωση</dt>
                          <dd>{variant.redemptions.map((x) => redemptionLabels[x.channel] || x.channel).join(", ")}</dd>
                        </div>
                      )}
                      {variant.deliveries.length > 0 && (
                        <div>
                          <dt>Παράδοση</dt>
                          <dd>{variant.deliveries.map((x) => deliveryLabels[x.method] || x.method).join(", ")}</dd>
                        </div>
                      )}
                      {(variant.validityText || variant.validityMonths) && (
                        <div>
                          <dt>Ισχύς</dt>
                          <dd>{variant.validityText || `${variant.validityMonths} μήνες`}</dd>
                        </div>
                      )}
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          )}

          {card.occasions.length > 0 && (
            <section className="dk24-occasion-row">
              <span>ΤΑΙΡΙΑΖΕΙ ΓΙΑ</span>
              <div>
                {card.occasions.map((x) => (
                  <Link key={x.occasion.slug} href={`/occasions/${x.occasion.slug}`}>
                    {x.occasion.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {relatedCards.length > 0 && (
            <section aria-labelledby="related-cards-heading">
              <div className="dk25-taxonomy-results">
                <div><span>ΔΕΣ ΕΠΙΣΗΣ</span><h2 id="related-cards-heading">Σχετικές δωροκάρτες</h2></div>
                <Link href="/browse">Όλος ο κατάλογος <b>→</b></Link>
              </div>
              <div className="dk-public-card-grid dk-public-browse-grid">
                {relatedCards.map(related => <GiftCardCard key={related.id} card={related} />)}
              </div>
              <nav className="dk-public-filter-row" aria-label="Σχετικά καταστήματα">
                {relatedCards.map(related => (
                  <Link key={related.merchant.id} prefetch={false} href={`/brands/${encodeURIComponent(related.merchant.slug)}`}>
                    {related.merchant.name}
                  </Link>
                ))}
              </nav>
            </section>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
