"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./HeroSearch.module.css";
import {
  rankInstantGiftCards,
  type InstantSearchIndexItem,
} from "@/lib/public/instant-search";

type SearchIndexResponse = {
  index: InstantSearchIndexItem[];
};

let cachedIndex: InstantSearchIndexItem[] | null = null;
let indexPromise: Promise<InstantSearchIndexItem[]> | null = null;

async function loadSearchIndex() {
  if (cachedIndex) return cachedIndex;

  if (!indexPromise) {
    indexPromise = fetch("/api/public/search/index", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Search index request failed");

        const payload = (await response.json()) as SearchIndexResponse;
        cachedIndex = payload.index ?? [];
        return cachedIndex;
      })
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }

  return indexPromise;
}

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
  const deferredQuery = useDeferredValue(query);
  const [index, setIndex] = useState<InstantSearchIndexItem[]>(
    cachedIndex ?? [],
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => setQuery(initial), [initial]);

  useEffect(() => {
    let alive = true;

    const warm = () => {
      void loadSearchIndex()
        .then((items) => {
          if (alive) setIndex(items);
        })
        .catch(() => {
          // Search form still works through /browse even if preload fails.
        });
    };

    const timer = window.setTimeout(warm, 150);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

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

  const filteredIndex = useMemo(() => {
    if (!category && !occasion) return index;
    return index;
  }, [index, category, occasion]);

  const results = useMemo(() => {
    const value = deferredQuery.trim();
    if (!value) return [];
    return rankInstantGiftCards(filteredIndex, value, 8);
  }, [filteredIndex, deferredQuery]);

  const trimmedQuery = query.trim();
  const showDropdown = open && trimmedQuery.length > 0 && results.length > 0;

  function ensureIndex() {
    if (index.length) return;

    void loadSearchIndex()
      .then(setIndex)
      .catch(() => undefined);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      if (!results.length) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, results.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, -1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      window.location.assign(
        `/gift-cards/${encodeURIComponent(results[activeIndex].slug)}`,
      );
    }
  }

  return (
    <div className={`dk-search-shell ${styles.shell}`} ref={rootRef}>
      <form
        className={`dk14-search ${styles.form}`}
        action="/browse"
        method="get"
        role="search"
      >
        <span className="dk14-search-icon" aria-hidden="true">⌕</span>

        <input
          name="q"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
            ensureIndex();
          }}
          onFocus={() => {
            ensureIndex();
            if (query.trim()) setOpen(true);
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

        {category ? <input type="hidden" name="category" value={category} /> : null}
        {occasion ? <input type="hidden" name="occasion" value={occasion} /> : null}

        <button type="submit">Αναζήτηση</button>
      </form>

      {showDropdown ? (
        <div
          className={`dk-search-predict ${styles.dropdown}`}
          id={listboxId}
          role="listbox"
          aria-label="Δωροκάρτες"
        >
          {results.map((item, indexPosition) => {
            const href = `/gift-cards/${encodeURIComponent(item.slug)}`;
            const active = activeIndex === indexPosition;

            return (
              <Link
                id={`${listboxId}-${indexPosition}`}
                role="option"
                aria-selected={active}
                className={`${styles.result} ${active ? styles.active : ""}`}
                key={item.id}
                href={href}
                prefetch={false}
                onMouseEnter={() => setActiveIndex(indexPosition)}
                onClick={() => setOpen(false)}
              >
                <span className={styles.logo} aria-hidden="true">
                  {item.merchantLogoUrl ? (
                    <img src={item.merchantLogoUrl} alt="" />
                  ) : (
                    <span>🎁</span>
                  )}
                </span>

                <span className={styles.copy}>
                  <b>{item.title}</b>
                  <small>{item.merchantName}</small>
                </span>

                <span className={styles.arrow} aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
