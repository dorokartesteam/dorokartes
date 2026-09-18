"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type SearchSuggestion = {
  id: string;
  type: "merchant" | "giftCard" | "category" | "occasion";
  label: string;
  meta: string;
  href: string;
};

type SuggestionResponse = {
  suggestions: SearchSuggestion[];
};

const typeLabels: Record<SearchSuggestion["type"], string> = {
  merchant: "Brand",
  giftCard: "Δωροκάρτα",
  category: "Κατηγορία",
  occasion: "Περίσταση",
};

export default function HeroSearch({
  initial = "",
  category,
  occasion,
}: {
  initial?: string;
  category?: string;
  occasion?: string;
}) {
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const listboxId = useId();

  useEffect(() => setQuery(initial), [initial]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (category) params.set("category", category);
        if (occasion) params.set("occasion", occasion);
        const response = await fetch(`/api/public/search/suggestions?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Suggestion request failed");
        const payload = (await response.json()) as SuggestionResponse;
        setSuggestions(payload.suggestions ?? []);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim() ? 160 : 60);

    return () => window.clearTimeout(timer);
  }, [query, category, occasion, open]);

  const browseParams = new URLSearchParams();
  if (query.trim()) browseParams.set("q", query.trim());
  if (category) browseParams.set("category", category);
  if (occasion) browseParams.set("occasion", occasion);
  const browseHref = browseParams.toString() ? `/browse?${browseParams}` : "/browse";

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      window.location.assign(suggestions[activeIndex].href);
    }
  }

  return (
    <div className="dk-search-shell" ref={rootRef}>
      <form className="dk14-search" action="/browse" method="get" role="search">
        <span className="dk14-search-icon" aria-hidden="true">⌕</span>
        <input
          name="q"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Sephora, spa, gaming, παιδί, ρούχα..."
          aria-label="Αναζήτηση δωροκάρτας"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
        />
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {occasion ? <input type="hidden" name="occasion" value={occasion} /> : null}
        <button type="submit">Αναζήτηση</button>
      </form>

      {open ? (
        <div className="dk-search-predict" id={listboxId} role="listbox" aria-label="Προτάσεις αναζήτησης">
          <div className="dk-search-predict-head">
            <span>{query.trim() ? "ΠΡΟΤΑΣΕΙΣ" : "ΔΗΜΟΦΙΛΗ"}</span>
            {loading ? <small>Αναζήτηση…</small> : null}
          </div>

          {suggestions.length ? (
            <div className="dk-search-predict-list">
              {suggestions.map((item, index) => (
                <Link
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  className={activeIndex === index ? "active" : ""}
                  key={`${item.type}-${item.id}`}
                  href={item.href}
                  prefetch={false}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => setOpen(false)}
                >
                  <span className={`dk-search-type ${item.type}`} aria-hidden="true">
                    {item.type === "merchant" ? "B" : item.type === "giftCard" ? "🎁" : item.type === "category" ? "#" : "✦"}
                  </span>
                  <span className="dk-search-copy">
                    <b>{item.label}</b>
                    <small>{typeLabels[item.type]}{item.meta ? ` · ${item.meta}` : ""}</small>
                  </span>
                  <span className="dk-search-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : !loading ? (
            <div className="dk-search-empty">Δεν βρήκαμε άμεση πρόταση. Δες όλα τα αποτελέσματα.</div>
          ) : null}

          {query.trim() ? (
            <Link className="dk-search-all" href={browseHref} prefetch={false} onClick={() => setOpen(false)}>
              <span>Δες όλα τα αποτελέσματα για «{query.trim()}»</span>
              <b aria-hidden="true">→</b>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
