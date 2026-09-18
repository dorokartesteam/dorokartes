import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const groups = await prisma.discoveryItem.groupBy({
    by: ["sourceName", "sourceType"],
    _count: { _all: true },
    orderBy: { _count: { sourceName: "desc" } },
  });

  return (
    <div className="pageStack">
      <section className="pageHero compact">
        <div>
          <div className="sectionEyebrow">Discovery</div>
          <h1>Sources</h1>
          <p>Where candidate merchants and gift-card evidence came from.</p>
        </div>
      </section>

      <div className="tablePanel">
        <div className="dataTable sourceTable header">
          <span>Source</span>
          <span>Type</span>
          <span>Discovery Items</span>
        </div>
        {groups.map((group) => (
          <div className="dataTable sourceTable" key={`${group.sourceName}-${group.sourceType}`}>
            <strong>{group.sourceName}</strong>
            <span className="pill soft">{group.sourceType}</span>
            <strong>{group._count._all}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
