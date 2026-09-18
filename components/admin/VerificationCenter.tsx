"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import VerificationActions from "@/components/admin/VerificationActions";

type CardRow = {
  id: string;
  title?: string | null;
  officialUrl?: string | null;
  verificationStatus?: string | null;
  lastVerifiedAt?: string | Date | null;
  nextReviewAt?: string | Date | null;
  merchant?: { name?: string | null } | null;
};

type FlagRow = {
  id: string;
  giftCardId?: string | null;
  type?: string | null;
  reason?: string | null;
  createdAt?: string | Date | null;
  status?: string | null;
};

type EventRow = {
  id: string;
  giftCardId?: string | null;
  result?: string | null;
  notes?: string | null;
  checkedAt?: string | Date | null;
};

function hostname(url?: string | null) {
  if (!url) return "No official URL";
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function dateLabel(v?: string | Date | null) {
  if (!v) return "Never";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("el-GR");
}

function VerificationRow({ card, queue }: { card: CardRow; queue: "review" | "due" }) {
  return (
    <div className="dk-ver-row-v42">
      <Link href={`/admin/gift-cards/${card.id}`} className="dk-ver-card-v42">
        <div className="dk-ver-main-v42">
          <b>{card.merchant?.name || "Unknown merchant"}</b>
          <span>{card.title || "Untitled gift card"}</span>
          <small>{hostname(card.officialUrl)}</small>
        </div>

        <div className="dk-ver-meta-v42">
          <span>
            {queue === "due" ? "LAST CHECK" : "STATUS"}
            <b>{queue === "due" ? dateLabel(card.lastVerifiedAt) : "Needs review"}</b>
          </span>
          {queue === "due" && (
            <span>
              NEXT REVIEW
              <b>{dateLabel(card.nextReviewAt)}</b>
            </span>
          )}
        </div>
      </Link>

      <VerificationActions
        cardId={card.id}
        officialUrl={card.officialUrl}
        verificationStatus={card.verificationStatus}
      />
    </div>
  );
}

export default function VerificationCenter({
  review,
  stale,
  flags,
  events,
}: {
  review: CardRow[];
  stale: CardRow[];
  flags: FlagRow[];
  events: EventRow[];
}) {
  const [tab, setTab] = useState<"review" | "due" | "flags">("review");

  const tabs = useMemo(() => [
    { key: "review" as const, label: "Needs review", count: review.length },
    { key: "due" as const, label: "Due for recheck", count: stale.length },
    { key: "flags" as const, label: "Flags", count: flags.length },
  ], [review.length, stale.length, flags.length]);

  return (
    <>
      <section className="dk-ver-center-v42">
        <div className="dk-ver-tabs-v42" role="tablist" aria-label="Verification queues">
          {tabs.map((x) => (
            <button
              key={x.key}
              className={tab === x.key ? "active" : ""}
              onClick={() => setTab(x.key)}
              role="tab"
              aria-selected={tab === x.key}
            >
              <span>{x.label}</span>
              <em>{x.count}</em>
            </button>
          ))}
        </div>

        <div className="dk-ver-toolbar-v42">
          <div>
            <b>
              {tab === "review" && "Manual decision queue"}
              {tab === "due" && "Previously verified cards due for a new check"}
              {tab === "flags" && "Production changes requiring attention"}
            </b>
            <span>
              {tab === "review" && "Open the merchant destination, confirm it is a real gift-card page, then verify it."}
              {tab === "due" && "Re-open the destination and confirm the program still exists and the URL is still correct."}
              {tab === "flags" && "Flags are signals from monitoring or content changes. Inspect before resolving the underlying card."}
            </span>
          </div>
        </div>

        <div className="dk-ver-queue-v42" role="tabpanel">
          {tab === "review" && (
            review.length
              ? review.slice(0, 100).map((card) => <VerificationRow key={card.id} card={card} queue="review" />)
              : <div className="dk-ver-empty-v42">No cards are waiting for manual review.</div>
          )}

          {tab === "due" && (
            stale.length
              ? stale.slice(0, 100).map((card) => <VerificationRow key={card.id} card={card} queue="due" />)
              : <div className="dk-ver-empty-v42">Nothing is due for recheck.</div>
          )}

          {tab === "flags" && (
            flags.length
              ? flags.slice(0, 100).map((f) => (
                <div className="dk-ver-flag-v42" key={f.id}>
                  <div>
                    <span>{String(f.type || "REVIEW FLAG").replaceAll("_", " ")}</span>
                    <b>{f.reason || "Production review required"}</b>
                    <small>{dateLabel(f.createdAt)}</small>
                  </div>
                  {f.giftCardId ? <Link href={`/admin/gift-cards/${f.giftCardId}`}>Open card →</Link> : null}
                </div>
              ))
              : <div className="dk-ver-empty-v42">No open production flags.</div>
          )}
        </div>
      </section>

      <section className="dk-ver-history-v42">
        <div className="dk-ver-history-head-v42">
          <div>
            <b>Recent verification history</b>
            <span>Latest manual and automated verification decisions</span>
          </div>
        </div>

        <div className="dk-ver-history-list-v42">
          {events.length ? events.slice(0, 12).map((e) => (
            <div key={e.id}>
              <span className={`result ${String(e.result || "").toLowerCase()}`}>{e.result || "EVENT"}</span>
              <div>
                <b>{e.notes || "Verification event"}</b>
                <small>{dateLabel(e.checkedAt)}</small>
              </div>
              {e.giftCardId ? <Link href={`/admin/gift-cards/${e.giftCardId}`}>Card →</Link> : null}
            </div>
          )) : <div className="dk-ver-empty-v42">No verification history yet.</div>}
        </div>
      </section>
    </>
  );
}
