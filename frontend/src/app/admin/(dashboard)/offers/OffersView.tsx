"use client";

import { useState } from "react";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { Badge } from "@/components/admin/StatusBadge";
import { LocaleChips, titledLocales } from "@/components/admin/content/LocaleChips";
import { refreshPublicSite } from "@/components/admin/content/publicRefresh";
import { Thumb } from "@/components/admin/content/Thumb";
import { OFFER_STATUS_STYLE, offerStatus, offerTitle } from "@/components/admin/offers/offerForm";
import { adminApi } from "@/lib/admin/api";
import { formatDate, formatDateTime } from "@/lib/admin/format";
import { useAdminLocales, useAdminMutation, useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import type { AdminPage, DeleteOut, OfferAdmin } from "@/lib/admin/types";
import { CACHE_TAGS } from "@/lib/api/tags";

const PAGE_SIZE = 20;

function windowLabel(offer: OfferAdmin): string {
  if (!offer.starts_at && !offer.ends_at) return "Always";
  if (offer.starts_at && offer.ends_at) {
    return `${formatDate(offer.starts_at)} – ${formatDate(offer.ends_at)}`;
  }
  return offer.starts_at
    ? `From ${formatDate(offer.starts_at)}`
    : `Until ${formatDate(offer.ends_at)}`;
}

function OfferStatusBadges({ offer }: { offer: OfferAdmin }) {
  const style = OFFER_STATUS_STYLE[offerStatus(offer)];
  return (
    <>
      <Badge tone={style.tone} dot title={style.description}>
        {style.label}
      </Badge>
      {offer.show_banner ? (
        <Badge tone="navy" title="Shown in the site-wide banner">
          Banner
        </Badge>
      ) : null}
    </>
  );
}

/** /admin/offers — promotions and banners, with their live status. */
export function OffersView() {
  const { locales, defaultLocale } = useAdminLocales();
  const [params, setParams] = useUrlParams();
  const page = parsePage(params.get("page"));
  const query = useAdminQuery<AdminPage<OfferAdmin>>("/offers", {
    query: { page, page_size: PAGE_SIZE },
  });
  const [toDelete, setToDelete] = useState<OfferAdmin | null>(null);
  const remove = useAdminMutation(
    (offer: OfferAdmin) => adminApi.delete<DeleteOut>(`/offers/${offer.id}`),
    {
      successMessage: (_, offer) => `Offer “${offer.slug}” deleted`,
      errorMessage: false, // shown inside the confirmation dialog
      onSuccess: async () => {
        refreshPublicSite(CACHE_TAGS.offers);
        await query.refetch();
      },
    },
  );

  const columns: DataTableColumn<OfferAdmin>[] = [
    {
      id: "offer",
      header: "Offer",
      cell: (offer) => (
        <span className="flex min-w-0 items-center gap-3">
          <Thumb src={offer.image_url} icon="offers" className="max-sm:hidden" />
          <span className="min-w-0">
            <span className="block truncate">{offerTitle(offer, defaultLocale)}</span>
            <span className="block truncate font-mono text-xs font-normal text-ink-soft">
              {offer.slug}
            </span>
            <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
              <OfferStatusBadges offer={offer} />
            </span>
          </span>
        </span>
      ),
      className: "max-w-[15rem] sm:max-w-[22rem]",
      skeletonClassName: "w-48",
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "sm",
      cell: (offer) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <OfferStatusBadges offer={offer} />
        </span>
      ),
      skeletonClassName: "w-16",
    },
    {
      id: "discount",
      header: "Discount",
      hideBelow: "md",
      cell: (offer) =>
        offer.discount_code ? (
          <span className="font-mono text-[0.8125rem]" dir="ltr">
            {offer.discount_code}
          </span>
        ) : (
          <span className="text-stone-400">—</span>
        ),
      skeletonClassName: "w-20",
    },
    {
      id: "window",
      header: "Runs",
      hideBelow: "lg",
      cell: (offer) => (
        <span
          className="whitespace-nowrap text-ink-soft"
          title={
            offer.starts_at || offer.ends_at
              ? `${formatDateTime(offer.starts_at)} → ${formatDateTime(offer.ends_at)}`
              : undefined
          }
        >
          {windowLabel(offer)}
        </span>
      ),
    },
    {
      id: "languages",
      header: "Languages",
      hideBelow: "md",
      cell: (offer) => (
        <LocaleChips locales={locales} available={titledLocales(offer.translations, locales)} />
      ),
      skeletonClassName: "w-14",
    },
    {
      id: "order",
      header: "Order",
      align: "end",
      hideBelow: "lg",
      cell: (offer) => <span className="tabular-nums text-ink-soft">{offer.sort_order}</span>,
      skeletonClassName: "w-6",
    },
    {
      id: "actions",
      header: "Actions",
      srOnlyHeader: true,
      align: "end",
      cell: (offer) => (
        <AdminButton
          size="sm"
          variant="dangerGhost"
          icon="trash"
          iconOnly
          onClick={() => {
            remove.reset();
            setToDelete(offer);
          }}
        >
          {`Delete offer ${offer.slug}`}
        </AdminButton>
      ),
      className: "w-12",
      skeletonClassName: "w-6",
    },
  ];

  return (
    <>
      <PageHeader
        title="Offers"
        description="Promotions shown on the offers page and, when enabled, in the banner across the site. An offer is live while it is active and inside its dates."
        actions={
          <AdminButtonLink href="/admin/offers/new" variant="primary" icon="plus">
            New offer
          </AdminButtonLink>
        }
      />
      <Panel
        padding="none"
        footer={
          query.data && query.data.total > 0 ? (
            <Pagination
              page={page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(p) => setParams({ page: p > 1 ? p : null })}
              disabled={query.fetching}
              itemLabel="offers"
            />
          ) : undefined
        }
      >
        <DataTable
          caption="Offers"
          rows={query.data?.items}
          loading={query.loading}
          stale={query.isPlaceholder}
          error={query.error}
          onRetry={query.refetch}
          getRowId={(offer) => offer.id}
          rowHref={(offer) => `/admin/offers/${offer.id}`}
          columns={columns}
          emptyTitle="No offers yet"
          emptyDescription="Create a promotion with its own page, an optional banner and a discount code."
          emptyAction={
            <AdminButtonLink href="/admin/offers/new" size="sm" icon="plus">
              New offer
            </AdminButtonLink>
          }
        />
      </Panel>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => (toDelete ? remove.mutateAsync(toDelete) : undefined)}
        tone="danger"
        title="Delete this offer?"
        description="It disappears from the site at once. The linked discount code is kept."
        confirmLabel="Delete offer"
      >
        {toDelete ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200 ring-inset">
            <span className="block font-medium">{offerTitle(toDelete, defaultLocale)}</span>
            <span className="font-mono text-xs text-ink-soft">{toDelete.slug}</span>
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
