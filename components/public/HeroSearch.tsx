"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type SearchSuggestion = {
  id: string;
  type: "giftCard";
  label: string;
  meta: string;
  href: string;
};

type SuggestionResponse = {
  suggestions: SearchSuggestion[];
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
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const term = query.trim();

    if (!open || term.length < 2) {
      requestRef.current?.abort();
      setSuggestions([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);

      try {
        const params = new URLSearchParams({ q: term });
        if (category) params.set("category", category);
        if (occasion) params.set("occasion", occasion);

        const response = await fetch(
          `/api/public/search/suggestions?${params.toString()}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        );

        if (!response.ok) throw new Error("Suggestion request failed");

        const payload = (await response.json()) as SuggestionResponse;
        setSuggestions(payload.suggestions ?? []);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 70);

    return () => window.clearTimeout(timer);
  }, [query, category, occasion, open]);

  const browseParams = new URLSearchParams();
  if (query.trim()) browseParams.set("q", query.trim());
  if (category) browseParams.set("category", category);
  if (occasion) browseParams.set("occasion", occasion);
  const browseHref = browseParams.toString()
    ? `/browse?${browseParams.toString()}`
    : "/browse";

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, suggestions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, -1));
      return;
    }

    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      window.location.assign(suggestions[activeIndex].href);
    }
  }

  const showDropdown =
    open &&
    query.trim().length >= 2 &&
    (loading || suggestions.length > 0);

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
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Αναζήτησε δωροκάρτα..."
          aria-label="Αναζήτηση δωροκάρτας"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showDropdown}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          autoComplete="off"
          maxLength={160}
        />

        {category ? (
          <input type="hidden" name="category" value={category} />
        ) : null}

        {occasion ? (
          <input type="hidden" name="occasion" value={occasion} />
        ) : null}

        <button type="submit">Αναζήτηση</button>
      </form>

      {showDropdown ? (
        <div
          className="dk-search-predict"
          id={listboxId}
          role="listbox"
          aria-label="Δωροκάρτες"
        >
          {suggestions.length ? (
            <div className="dk-search-predict-list">
              {suggestions.map((item, index) => (
                <Link
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  className={activeIndex === index ? "active" : ""}
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => setOpen(false)}
                >
                  <span
                    className="dk-search-type giftCard"
                    aria-hidden="true"
                  >
                    🎁
                  </span>

                  <span className="dk-search-copy">
                    <b>{item.label}</b>
                    {item.meta ? <small>{item.meta}</small> : null}
                  </span>

                  <span className="dk-search-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          ) : null}

          {!loading && query.trim() ? (
            <Link
              className="dk-search-all"
              href={browseHref}
              prefetch={false}
              onClick={() => setOpen(false)}
            >
              <span>Όλα τα αποτελέσματα</span>
              <b aria-hidden="true">→</b>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
