import { getMediaCenterData } from "@/lib/admin/media";
import MediaCenter from "@/components/admin/MediaCenter";

export default async function MediaPage(){
  const d = await getMediaCenterData();

  return <div>
    <div className="dk-pageintro">
      <div>
        <span>CONTENT</span>
        <h2>Media Center</h2>
        <p>Central visual asset management for gift cards and launch-readiness cleanup.</p>
      </div>
    </div>

    <div className="dk-launchmetrics">
      <article><span>TOTAL ASSETS</span><strong>{d.mediaCount}</strong><small>media records</small></article>
      <article><span>CARDS WITH MEDIA</span><strong>{d.cardsWithMedia}</strong><small>covered</small></article>
      <article><span>MISSING MEDIA</span><strong>{d.cardsMissingMedia}</strong><small>launch blocker</small></article>
      <article><span>MISSING ALT</span><strong>{d.cardsMissingAlt}</strong><small>SEO/accessibility</small></article>
    </div>

    <MediaCenter rows={d.rows}/>
  </div>;
}
