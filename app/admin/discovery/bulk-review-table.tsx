"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type BulkReviewItem = {
  id: string;
  merchantName: string | null;
  title: string | null;
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  possibleOfficialUrl: string | null;
  status: string;
  reviewState: string;
  confidence: number | null;
  notes: string | null;
};

export default function BulkReviewTable({
  items,
}: {
  items: BulkReviewItem[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allSelected = useMemo(
    () => items.length > 0 && items.every((x) => selected.has(x.id)),
    [items, selected],
  );

  function toggleAll() {
    setSelected((current) => {
      if (allSelected) return new Set();
      return new Set(items.map((x) => x.id));
    });
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: "ACCEPT" | "REJECT" | "NEEDS_REVIEW") {
    const ids = [...selected];
    if (!ids.length) return;

    const labels = {
      ACCEPT: "accept",
      REJECT: "reject",
      NEEDS_REVIEW: "mark for review",
    };

    if (!confirm(`${labels[action]} ${ids.length} selected items?`)) return;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/discovery/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || "Bulk action failed.");
      }

      setSelected(new Set());
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Bulk action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="bulkToolbar">
        <label className="selectAll">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={!items.length || busy}
          />
          Select all on page
        </label>

        <div className="bulkCount">
          <strong>{selected.size}</strong> selected
        </div>

        <div className="bulkActions">
          <button
            className="bulkAccept"
            disabled={!selected.size || busy}
            onClick={() => runBulk("ACCEPT")}
          >
            Accept selected
          </button>
          <button
            className="bulkReview"
            disabled={!selected.size || busy}
            onClick={() => runBulk("NEEDS_REVIEW")}
          >
            Needs review
          </button>
          <button
            className="bulkReject"
            disabled={!selected.size || busy}
            onClick={() => runBulk("REJECT")}
          >
            Reject selected
          </button>
        </div>
      </div>

      <div className="bulkCards">
        {items.map((item) => (
          <article
            key={item.id}
            className={`bulkCard ${selected.has(item.id) ? "selected" : ""}`}
          >
            <div className="bulkCheck">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleOne(item.id)}
                disabled={busy}
              />
            </div>

            <div className="bulkMain">
              <div className="bulkHead">
                <div>
                  <div className="bulkBadges">
                    <span className="badge">{item.status}</span>
                    <span className="badge soft">{item.reviewState}</span>
                    {item.confidence !== null && (
                      <span className="badge score">{item.confidence}/100</span>
                    )}
                  </div>
                  <h2>{item.merchantName || "Unnamed merchant"}</h2>
                  {item.title && <p>{item.title}</p>}
                </div>

                <div className="bulkSource">
                  <strong>{item.sourceName}</strong>
                  <span>{item.sourceType}</span>
                </div>
              </div>

              <div className="bulkLinks">
                {item.possibleOfficialUrl && (
                  <a href={item.possibleOfficialUrl} target="_blank" rel="noreferrer">
                    Proposed official ↗
                  </a>
                )}
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  Source ↗
                </a>
              </div>

              {item.notes && (
                <details>
                  <summary>Evidence / notes</summary>
                  <p>{item.notes}</p>
                </details>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
