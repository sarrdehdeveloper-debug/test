"use client";

import { useState } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EmptyState } from "@/components/admin/EmptyState";
import { Icon } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/admin/Panel";
import { ErrorState, Skeleton } from "@/components/admin/QueryState";
import { Badge } from "@/components/admin/StatusBadge";
import { LocaleChips, titledLocales } from "@/components/admin/content/LocaleChips";
import { refreshPublicSite } from "@/components/admin/content/publicRefresh";
import { Thumb } from "@/components/admin/content/Thumb";
import {
  LibraryItemDialog,
  type LibraryDialogTarget,
} from "@/components/admin/library/LibraryItemDialog";
import {
  applyOrder,
  libraryTitle,
  moveItem,
  nextSortOrder,
  sortByOrder,
} from "@/components/admin/library/libraryForm";
import { adminApi, toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { useAdminLocales, useAdminMutation, useAdminQuery } from "@/lib/admin/hooks";
import { toast } from "@/lib/admin/toast";
import { localeDir } from "@/lib/admin/translations";
import type { AdminPage, BookAdmin, DeleteOut, Locale, SeriesAdmin } from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";
import { cn } from "@/lib/cn";

/* ================================================================== small pieces */

function MoveButtons({
  label,
  index,
  count,
  disabled,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  const button =
    "flex size-7 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-ink disabled:pointer-events-none disabled:opacity-30";
  return (
    <span className="inline-flex flex-col" role="group" aria-label={`Reorder ${label}`}>
      <button
        type="button"
        className={button}
        onClick={() => onMove(-1)}
        disabled={disabled || index === 0}
        aria-label={`Move ${label} up`}
        title="Move up"
      >
        <Icon name="chevronDown" className="size-4 rotate-180" />
      </button>
      <button
        type="button"
        className={button}
        onClick={() => onMove(1)}
        disabled={disabled || index === count - 1}
        aria-label={`Move ${label} down`}
        title="Move down"
      >
        <Icon name="chevronDown" className="size-4" />
      </button>
    </span>
  );
}

function PublishedBadge({ published }: { published: boolean }) {
  return (
    <Badge tone={published ? "success" : "neutral"} dot>
      {published ? "Published" : "Draft"}
    </Badge>
  );
}

function SecondaryTitle({
  row,
  locales,
  defaultLocale,
}: {
  row: { translations: SeriesAdmin["translations"] };
  locales: Locale[];
  defaultLocale: Locale;
}) {
  const other = locales.find(
    (locale) => locale !== defaultLocale && row.translations[locale]?.title?.trim(),
  );
  if (!other) return null;
  return (
    <span className="block min-w-0">
      <span
        lang={other}
        dir={localeDir(other)}
        className="inline-block max-w-full truncate align-top text-[0.8125rem] text-ink-soft"
      >
        {row.translations[other]?.title}
      </span>
    </span>
  );
}

/* ================================================================== books */

interface BookListProps {
  series: SeriesAdmin;
  locales: Locale[];
  defaultLocale: Locale;
  reordering: boolean;
  onMove: (books: BookAdmin[], index: number, delta: -1 | 1) => void;
  onEdit: (book: BookAdmin) => void;
  onDelete: (book: BookAdmin) => void;
  onAdd: () => void;
}

function BookList({
  series,
  locales,
  defaultLocale,
  reordering,
  onMove,
  onEdit,
  onDelete,
  onAdd,
}: BookListProps) {
  const books = sortByOrder(series.books);
  if (!books.length) {
    return (
      <EmptyState
        compact
        icon="library"
        title="No books in this series yet"
        description="Add the first book with its cover and purchase link."
        action={
          <AdminButton size="sm" icon="plus" onClick={onAdd}>
            Add book
          </AdminButton>
        }
      />
    );
  }
  return (
    <ol
      className="divide-y divide-stone-100"
      aria-label={`Books of ${libraryTitle(series, defaultLocale)}`}
    >
      {books.map((book, index) => {
        const title = libraryTitle(book, defaultLocale);
        return (
          <li
            key={book.id}
            id={`book-${book.id}`}
            className="flex scroll-mt-24 items-center gap-3 px-4 py-3 target:bg-gold-pale/40 sm:px-5"
          >
            <MoveButtons
              label={title}
              index={index}
              count={books.length}
              disabled={reordering}
              onMove={(delta) => onMove(books, index, delta)}
            />
            <Thumb src={book.cover_image_url} shape="portrait" icon="library" />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onEdit(book)}
                className="block max-w-full truncate text-start text-sm font-medium text-ink decoration-gold/50 underline-offset-2 hover:underline"
              >
                {title}
              </button>
              <SecondaryTitle row={book} locales={locales} defaultLocale={defaultLocale} />
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                <span className="font-mono" dir="ltr">
                  {book.slug}
                </span>
                {book.purchase_url ? (
                  <a
                    href={book.purchase_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-ink hover:underline"
                  >
                    <Icon name="external" className="size-3.5" />
                    Purchase link
                  </a>
                ) : (
                  <span className="text-stone-400">No purchase link</span>
                )}
              </span>
            </div>
            <div className="hidden shrink-0 items-center gap-3 sm:flex">
              <LocaleChips
                locales={locales}
                available={titledLocales(book.translations, locales)}
              />
              <PublishedBadge published={book.is_published} />
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <AdminButton
                size="sm"
                variant="ghost"
                onClick={() => onEdit(book)}
                className="max-sm:hidden"
              >
                Edit<span className="sr-only"> {title}</span>
              </AdminButton>
              <AdminButton
                size="sm"
                variant="dangerGhost"
                icon="trash"
                iconOnly
                onClick={() => onDelete(book)}
              >
                {`Delete book ${title}`}
              </AdminButton>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ================================================================== page */

type DeleteTarget =
  | { entity: "series"; item: SeriesAdmin }
  | { entity: "book"; item: BookAdmin; series: SeriesAdmin };

/** /admin/library — Galaxy Library series with their books. */
export function LibraryView() {
  const { locales, defaultLocale } = useAdminLocales();
  const query = useAdminQuery<AdminPage<SeriesAdmin>>("/book-series", {
    query: { page_size: 100 },
  });
  const allSeries = sortByOrder(query.data?.items ?? []);
  const [dialog, setDialog] = useState<LibraryDialogTarget | null>(null);
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const [reordering, setReordering] = useState(false);

  const remove = useAdminMutation(
    (target: DeleteTarget) =>
      adminApi.delete<DeleteOut>(
        target.entity === "series" ? `/book-series/${target.item.id}` : `/books/${target.item.id}`,
      ),
    {
      errorMessage: false, // shown in the dialog
      successMessage: (_, target) =>
        `${target.entity === "series" ? "Series" : "Book"} “${libraryTitle(target.item, defaultLocale)}” deleted`,
      onSuccess: async () => {
        refreshPublicSite(CACHE_TAGS.library);
        await query.refetch();
      },
    },
  );

  /** Swap with the neighbour and renumber; PATCHes each changed sort_order. */
  const move = async (
    kind: "series" | "book",
    items: Array<SeriesAdmin | BookAdmin>,
    index: number,
    delta: -1 | 1,
  ) => {
    const changes = moveItem(items, index, delta);
    if (!changes.length || reordering) return;
    setReordering(true);
    // Optimistic: show the new order at once.
    query.setData((prev) => {
      if (!prev) return prev;
      if (kind === "series") return { ...prev, items: applyOrder(prev.items, changes) };
      return {
        ...prev,
        items: prev.items.map((series) =>
          series.books.some((b) => changes.some((c) => c.id === b.id))
            ? { ...series, books: applyOrder(series.books, changes) }
            : series,
        ),
      };
    });
    try {
      for (const change of changes) {
        await adminApi.patch(
          kind === "series" ? `/book-series/${change.id}` : `/books/${change.id}`,
          { sort_order: change.sort_order },
        );
      }
      refreshPublicSite(CACHE_TAGS.library);
    } catch (err) {
      const error = toAdminApiError(err);
      if (!error.isUnauthorized) {
        toast.error("The new order was not saved", { description: adminErrorMessage(error) });
      }
    } finally {
      await query.refetch();
      setReordering(false);
    }
  };

  const deleteDescription = (() => {
    if (!toDelete) return undefined;
    if (toDelete.entity === "book") return "It disappears from its series on the site at once.";
    const count = toDelete.item.books_count;
    return count
      ? `Its ${count} ${count === 1 ? "book is" : "books are"} deleted too. This cannot be undone.`
      : "This cannot be undone.";
  })();

  return (
    <>
      <PageHeader
        title="Galaxy Library"
        description="Book series and their books. Only published series and books appear on the site; use the arrows to change their order."
        actions={
          <>
            <AdminButtonLink href={`/${defaultLocale}/library`} external size="sm" icon="external">
              View library
            </AdminButtonLink>
            <AdminButton
              variant="primary"
              icon="plus"
              onClick={() =>
                setDialog({ entity: "series", item: null, sortOrder: nextSortOrder(allSeries) })
              }
            >
              New series
            </AdminButton>
          </>
        }
      />

      {query.error && !query.data ? (
        <Panel>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Panel>
      ) : query.loading ? (
        <div className="space-y-5" role="status" aria-live="polite">
          <span className="sr-only">Loading library…</span>
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex gap-4">
                <Skeleton className="h-20 w-14" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="mt-5 h-12 w-full" />
              <Skeleton className="mt-2 h-12 w-full" />
            </div>
          ))}
        </div>
      ) : allSeries.length === 0 ? (
        <Panel>
          <EmptyState
            icon="library"
            title="The library is empty"
            description="Create a series, then add its books."
            action={
              <AdminButton
                icon="plus"
                size="sm"
                onClick={() => setDialog({ entity: "series", item: null, sortOrder: 1 })}
              >
                New series
              </AdminButton>
            }
          />
        </Panel>
      ) : (
        <ol
          className={cn("space-y-5", query.fetching && "opacity-90")}
          aria-busy={reordering || undefined}
        >
          {allSeries.map((series, index) => {
            const title = libraryTitle(series, defaultLocale);
            return (
              <li key={series.id} id={`series-${series.id}`} className="scroll-mt-24">
                <Panel padding="none" aria-label={`Series ${title}`}>
                  <div className="flex flex-wrap items-start gap-3 border-b border-stone-200/80 px-4 py-4 sm:gap-4 sm:px-5">
                    <MoveButtons
                      label={title}
                      index={index}
                      count={allSeries.length}
                      disabled={reordering}
                      onMove={(delta) => void move("series", allSeries, index, delta)}
                    />
                    <Thumb
                      src={series.cover_image_url}
                      shape="portrait"
                      icon="library"
                      className="h-20 w-14"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[0.62rem] font-semibold tracking-[0.2em] text-gold-deep uppercase">
                        Series
                      </p>
                      <h2 className="truncate font-serif text-xl leading-tight font-semibold text-ink">
                        {title}
                      </h2>
                      <SecondaryTitle
                        row={series}
                        locales={locales}
                        defaultLocale={defaultLocale}
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                        <PublishedBadge published={series.is_published} />
                        <span>
                          {series.books_count} {series.books_count === 1 ? "book" : "books"}
                        </span>
                        <LocaleChips
                          locales={locales}
                          available={titledLocales(series.translations, locales)}
                        />
                        <span className="font-mono" dir="ltr">
                          /library/{series.slug}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 max-sm:order-last max-sm:w-full max-sm:border-t max-sm:border-stone-100 max-sm:pt-2">
                      <AdminButton
                        size="sm"
                        variant="ghost"
                        icon="plus"
                        onClick={() =>
                          setDialog({
                            entity: "book",
                            series,
                            item: null,
                            sortOrder: nextSortOrder(series.books),
                          })
                        }
                        className="max-sm:hidden"
                      >
                        Add book
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        onClick={() =>
                          setDialog({
                            entity: "series",
                            item: series,
                            sortOrder: series.sort_order,
                          })
                        }
                      >
                        Edit<span className="sr-only"> series {title}</span>
                      </AdminButton>
                      <AdminButton
                        size="sm"
                        variant="dangerGhost"
                        icon="trash"
                        iconOnly
                        onClick={() => {
                          remove.reset();
                          setToDelete({ entity: "series", item: series });
                        }}
                      >
                        {`Delete series ${title}`}
                      </AdminButton>
                    </div>
                  </div>
                  <BookList
                    series={series}
                    locales={locales}
                    defaultLocale={defaultLocale}
                    reordering={reordering}
                    onMove={(books, i, delta) => void move("book", books, i, delta)}
                    onEdit={(book) =>
                      setDialog({ entity: "book", series, item: book, sortOrder: book.sort_order })
                    }
                    onDelete={(book) => {
                      remove.reset();
                      setToDelete({ entity: "book", item: book, series });
                    }}
                    onAdd={() =>
                      setDialog({
                        entity: "book",
                        series,
                        item: null,
                        sortOrder: nextSortOrder(series.books),
                      })
                    }
                  />
                  {series.books.length ? (
                    <div className="border-t border-stone-100 px-4 py-2.5 sm:hidden">
                      <AdminButton
                        size="sm"
                        variant="ghost"
                        icon="plus"
                        onClick={() =>
                          setDialog({
                            entity: "book",
                            series,
                            item: null,
                            sortOrder: nextSortOrder(series.books),
                          })
                        }
                      >
                        Add book
                      </AdminButton>
                    </div>
                  ) : null}
                </Panel>
              </li>
            );
          })}
        </ol>
      )}

      <LibraryItemDialog
        target={dialog}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          void query.refetch();
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => (toDelete ? remove.mutateAsync(toDelete) : undefined)}
        tone="danger"
        title={toDelete?.entity === "series" ? "Delete this series?" : "Delete this book?"}
        description={deleteDescription}
        confirmLabel={toDelete?.entity === "series" ? "Delete series" : "Delete book"}
        confirmText={
          toDelete?.entity === "series" && toDelete.item.books_count > 0
            ? toDelete.item.slug
            : undefined
        }
      >
        {toDelete ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200 ring-inset">
            <span className="block font-medium">{libraryTitle(toDelete.item, defaultLocale)}</span>
            <span className="font-mono text-xs text-ink-soft">{toDelete.item.slug}</span>
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
