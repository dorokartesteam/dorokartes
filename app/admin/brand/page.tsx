import Image from "next/image";
import { PageIntro, Panel } from "@/components/admin/AdminUI";

export default function BrandPage(){
  return <>
    <PageIntro title="Brand Assets" text="Approved Dorokartes identity currently used by the admin."/>
    <div className="dk-grid2 cms">
      <Panel title="Primary Mark" subtitle="/public/brand/dorokartes-mark.png">
        <div className="dk-brandasset"><div className="dk-checker"><Image src="/brand/dorokartes-mark.png" width={360} height={360} alt="Dorokartes mark"/></div><p>Use for favicon, app icon, social avatar and compact admin navigation.</p></div>
      </Panel>
      <Panel title="Wordmark" subtitle="/public/brand/dorokartes-wordmark.png">
        <div className="dk-brandasset"><div className="dk-checker"><Image src="/brand/dorokartes-wordmark.png" width={520} height={360} alt="Dorokartes.gr wordmark"/></div><p>Use where the domain/name must be explicit.</p></div>
      </Panel>
    </div>
  </>;
}
