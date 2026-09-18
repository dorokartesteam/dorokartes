import Link from "next/link";
import { getHomepageMerchandisingData } from "@/lib/admin/launch";

export default async function HomepageAdminPage(){
  const d=await getHomepageMerchandisingData();

  const topCategories=d.categories.slice().sort((a:any,b:any)=>(b._count?.giftCards||0)-(a._count?.giftCards||0)).slice(0,8);
  const topOccasions=d.occasions.slice().sort((a:any,b:any)=>(b._count?.giftCards||0)-(a._count?.giftCards||0)).slice(0,8);

  return <div className="dk-merch">
    <div className="dk-pageintro">
      <div>
        <span>CONTENT</span>
        <h2>Homepage Merchandising</h2>
        <p>Preview the homepage inventory mix using existing featured cards, categories and occasions.</p>
      </div>
      <Link className="dk-btn primary" href="/admin/bulk">Manage featured cards →</Link>
    </div>

    <section className="dk-editor dk-merchhero">
      <div>
        <span className="dk-merchkicker">HOMEPAGE HERO</span>
        <h3>Βρες όλες τις δωροκάρτες σε ένα μέρος.</h3>
        <p>Discovery-first positioning. No checkout language, no universal-card implication.</p>
      </div>
      <div className="dk-merchstats">
        <div><strong>{d.featured.length}</strong><span>featured</span></div>
        <div><strong>{d.categories.length}</strong><span>categories</span></div>
        <div><strong>{d.occasions.length}</strong><span>occasions</span></div>
      </div>
    </section>

    <section className="dk-editor">
      <div className="dk-editorheading"><h3>Featured cards</h3><p>These are the strongest candidates for a “Featured” rail on the public homepage.</p></div>
      {d.featured.length ? <div className="dk-featuredgrid">
        {d.featured.slice(0,12).map((x:any)=><Link href={`/admin/gift-cards/${x.id}`} key={x.id}>
          <div className="dk-featuredthumb">{x._count?.mediaAssets ? "MEDIA" : "NO MEDIA"}</div>
          <b>{x.merchant?.name}</b>
          <span>{x.title}</span>
          <small>{x.verificationStatus} · V{x._count?.variants||0} · M{x._count?.mediaAssets||0}</small>
        </Link>)}
      </div> : <div className="dk-emptymerch">No featured cards yet. Use Bulk Editor → Feature.</div>}
    </section>

    <div className="dk-grid2">
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Browse by category</h3><p>Suggested homepage category rail based on catalog depth.</p></div>
        <div className="dk-merchchips">
          {topCategories.map((x:any)=><div key={x.id}><b>{x.name}</b><span>{x._count?.giftCards||0} cards</span></div>)}
        </div>
      </section>
      <section className="dk-editor">
        <div className="dk-editorheading"><h3>Gift by occasion</h3><p>Suggested occasion rail based on available coverage.</p></div>
        <div className="dk-merchchips">
          {topOccasions.map((x:any)=><div key={x.id}><b>{x.name}</b><span>{x._count?.giftCards||0} cards</span></div>)}
        </div>
      </section>
    </div>

    <section className="dk-editor">
      <div className="dk-editorheading"><h3>Recommended public homepage order</h3><p>Launch-oriented structure using the data you already have.</p></div>
      <div className="dk-sectionorder">
        <div><em>01</em><b>Hero + universal search</b><span>Find a merchant, category or occasion fast.</span></div>
        <div><em>02</em><b>Featured gift cards</b><span>Curated strong cards with verified URLs and media.</span></div>
        <div><em>03</em><b>Shop by occasion</b><span>Birthday, wedding, thank-you, family moments and more.</span></div>
        <div><em>04</em><b>Popular categories</b><span>Fashion, travel, beauty, food, tech and other high-depth groups.</span></div>
        <div><em>05</em><b>Popular merchants</b><span>Recognizable brands and high-confidence Greek merchants.</span></div>
        <div><em>06</em><b>How Dorokartes works</b><span>Discover → compare → continue to the official merchant.</span></div>
      </div>
    </section>
  </div>;
}
