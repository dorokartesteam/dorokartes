import Link from "next/link";
import { Fragment } from "react";

type PublicPaginationProps = {
  basePath: string;
  currentPage: number;
  totalPages: number;
  query?: Record<string, string | undefined>;
  ariaLabel?: string;
};

function paginationItems(currentPage: number, totalPages: number) {
  const pages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);

  return [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

function pageHref(
  basePath: string,
  page: number,
  query: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }

  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

export default function PublicPagination({
  basePath,
  currentPage,
  totalPages,
  query = {},
  ariaLabel = "Σελιδοποίηση αποτελεσμάτων",
}: PublicPaginationProps) {
  if (totalPages <= 1) return null;

  const pages = paginationItems(currentPage, totalPages);

  return (
    <nav className="dk29-pagination" aria-label={ariaLabel}>
      {currentPage > 1 ? (
        <Link
          prefetch={false}
          href={pageHref(basePath, currentPage - 1, query)}
          rel="prev"
          aria-label="Προηγούμενη σελίδα"
        >
          ← Προηγούμενη
        </Link>
      ) : null}

      {pages.map((page, index) => {
        const previousPage = pages[index - 1];
        const hasGap = previousPage != null && page - previousPage > 1;

        return (
          <Fragment key={page}>
            {hasGap ? <span aria-hidden="true">…</span> : null}
            <Link
              prefetch={false}
              className={page === currentPage ? "active" : ""}
              href={pageHref(basePath, page, query)}
              aria-label={`Σελίδα ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </Link>
          </Fragment>
        );
      })}

      {currentPage < totalPages ? (
        <Link
          prefetch={false}
          href={pageHref(basePath, currentPage + 1, query)}
          rel="next"
          aria-label="Επόμενη σελίδα"
        >
          Επόμενη →
        </Link>
      ) : null}
    </nav>
  );
}
