import { safeCount } from "@/lib/admin/data";
import { Metric, PageIntro, Panel } from "@/components/admin/AdminUI";

export default async function SEOPage() {
  const [cards, activeCards, merchants, categories, occasions, missingCardSeo, missingMerchantSeo, noCategory] = await Promise.all([
    safeCount("giftCard"),
    safeCount("giftCard", { status: "ACTIVE" }),
    safeCount("merchant"),
    safeCount("category", { active: true }),
    safeCount("occasion", { active: true }),
    safeCount("giftCard", { OR: [{ seoTitle: null }, { metaDescription: null }] }),
    safeCount("merchant", { OR: [{ seoTitle: null }, { metaDescription: null }] }),
    safeCount("giftCard", { categories: { none: {} } }),
  ]);

  return <>
    <PageIntro
      title="SEO Center"
      text="Indexing readiness for merchant, gift-card, category and occasion pages. These are production counts, not a mock checklist."
    />

    <div className="dk-metricgrid small">
      <Metric label="Gift cards" value={cards} tone="purple" />
      <Metric label="Active cards" value={activeCards} />
      <Metric label="Merchants" value={merchants} />
      <Metric label="Categories" value={categories} />
      <Metric label="Occasions" value={occasions} />
    </div>

    <div className="dk-grid3">
      <Panel title="Gift-card SEO">
        <div className="dk-seo-health">
          <strong>{missingCardSeo}</strong>
          <span>cards missing SEO title or meta</span>
          <a href="/admin/gift-cards">Review cards →</a>
        </div>
      </Panel>
      <Panel title="Merchant SEO">
        <div className="dk-seo-health">
          <strong>{missingMerchantSeo}</strong>
          <span>merchants missing SEO title or meta</span>
          <a href="/admin/merchants">Review merchants →</a>
        </div>
      </Panel>
      <Panel title="Taxonomy coverage">
        <div className="dk-seo-health">
          <strong>{noCategory}</strong>
          <span>gift cards without category</span>
          <a href="/admin/taxonomy">Open taxonomy →</a>
        </div>
      </Panel>
    </div>

    <div className="dk-grid2">
      <Panel title="Public URL architecture" subtitle="Target structure for launch">
        <div className="dk-route-list">
          <div><code>/gift-cards/[slug]</code><span>canonical gift-card landing page</span></div>
          <div><code>/brands/[slug]</code><span>merchant profile and available gift cards</span></div>
          <div><code>/categories/[slug]</code><span>category collection / internal linking hub</span></div>
          <div><code>/occasions/[slug]</code><span>gift-intent landing page</span></div>
        </div>
      </Panel>
      <Panel title="Launch indexing gates" subtitle="What must be true before Search Console submission">
        <ul className="dk-checklist">
          <li>Canonical metadata generated from one public URL per entity</li>
          <li>Thin / empty entities are noindex until useful</li>
          <li>Sitemap includes only indexable public pages</li>
          <li>Structured data does not claim Dorokartes sells the gift card</li>
          <li>Official outbound URL is clearly external merchant destination</li>
          <li>Search Console verification + sitemap submission after public deploy</li>
        </ul>
      </Panel>
    </div>
  </>;
}
