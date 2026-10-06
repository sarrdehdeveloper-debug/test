"use client";

import { AdminButtonLink } from "@/components/admin/AdminButton";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { PageHeader } from "@/components/admin/PageHeader";
import { Pagination } from "@/components/admin/Pagination";
import { Panel } from "@/components/admin/Panel";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  postDisplayStatus,
  POST_STATUS_LABELS,
  type PostDisplayStatus,
} from "@/components/admin/blog/postForm";
import { FilterChips } from "@/components/admin/content/FilterChips";
import { useNow } from "@/components/admin/content/useNow";
import { LocaleChips } from "@/components/admin/content/LocaleChips";
import { Thumb } from "@/components/admin/content/Thumb";
import { formatDate, formatDateTime, formatRelative } from "@/lib/admin/format";
import { useAdminLocales, useAdminQuery, useUrlParams } from "@/lib/admin/hooks";
import { parsePage } from "@/lib/admin/pagination";
import type { AdminPage, PostAdminSummary } from "@/lib/admin/types";

const PAGE_SIZE = 20;
/** "Published" and "Scheduled" are told apart by date, so those filters load up to 100 posts. */
const CLIENT_FILTER_SIZE = 100;

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All posts" },
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Published" },
  { value: "scheduled", label: "Scheduled" },
];

function DateCell({ post }: { post: PostAdminSummary }) {
  const status = postDisplayStatus(post);
  if (status === "draft") {
    return (
      <span className="text-ink-soft" title={formatDateTime(post.updated_at)}>
        Edited {formatRelative(post.updated_at)}
      </span>
    );
  }
  return (
    <time
      dateTime={post.published_at ?? undefined}
      title={formatDateTime(post.published_at)}
      className={status === "scheduled" ? "text-gold-deep" : "text-ink-soft"}
    >
      {status === "scheduled" ? "Publishes " : ""}
      {formatDate(post.published_at)}
    </time>
  );
}

/** /admin/blog — articles with their status (draft / published / scheduled). */
export function BlogView() {
  const { locales, defaultLocale } = useAdminLocales();
  const [params, setParams] = useUrlParams();
  const filter = FILTERS.some((f) => f.value === params.get("status"))
    ? (params.get("status") ?? "")
    : "";
  const page = parsePage(params.get("page"));
  const clientFiltered = filter === "published" || filter === "scheduled";

  const query = useAdminQuery<AdminPage<PostAdminSummary>>("/blog-posts", {
    query: clientFiltered
      ? { status: "published", page: 1, page_size: CLIENT_FILTER_SIZE }
      : { status: filter || undefined, page, page_size: PAGE_SIZE },
  });

  const now = useNow();
  const rows = clientFiltered
    ? query.data?.items.filter((post) => postDisplayStatus(post, now) === filter)
    : query.data?.items;

  const columns: DataTableColumn<PostAdminSummary>[] = [
    {
      id: "post",
      header: "Post",
      cell: (post) => (
        <span className="flex min-w-0 items-center gap-3">
          <Thumb src={post.cover_image_url} icon="blog" className="max-sm:hidden" />
          <span className="min-w-0">
            <span className="block truncate">{post.title || "Untitled post"}</span>
            <span className="block truncate font-mono text-xs font-normal text-ink-soft">
              {post.slug}
            </span>
            <span className="mt-1 block sm:hidden">
              <StatusBadge kind="post" status={postDisplayStatus(post, now)} />
            </span>
          </span>
        </span>
      ),
      className: "max-w-[16rem] sm:max-w-[26rem]",
      skeletonClassName: "w-56",
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "sm",
      cell: (post) => {
        const status: PostDisplayStatus = postDisplayStatus(post, now);
        return <StatusBadge kind="post" status={status} label={POST_STATUS_LABELS[status]} />;
      },
      skeletonClassName: "w-16",
    },
    {
      id: "languages",
      header: "Languages",
      hideBelow: "md",
      cell: (post) => <LocaleChips locales={locales} available={post.available_locales} />,
      skeletonClassName: "w-14",
    },
    {
      id: "author",
      header: "Author",
      hideBelow: "lg",
      cell: (post) => <span className="text-ink-soft">{post.author_name}</span>,
    },
    {
      id: "date",
      header: "Date",
      align: "end",
      cell: (post) => <DateCell post={post} />,
      className: "whitespace-nowrap",
      skeletonClassName: "w-20",
    },
  ];

  return (
    <>
      <PageHeader
        title="Blog"
        description="Articles in every language. Drafts stay private; a published post with a future date is scheduled and appears on that date."
        actions={
          <>
            <AdminButtonLink href={`/${defaultLocale}/blog`} external size="sm" icon="external">
              View blog
            </AdminButtonLink>
            <AdminButtonLink href="/admin/blog/new" variant="primary" icon="plus">
              New post
            </AdminButtonLink>
          </>
        }
      />
      <FilterChips
        label="Status"
        className="mb-4"
        value={filter}
        onChange={(value) => setParams({ status: value || null, page: null })}
        options={FILTERS.map((f) => ({
          ...f,
          count:
            f.value === filter && rows && !query.isPlaceholder
              ? clientFiltered
                ? rows.length
                : query.data?.total
              : undefined,
        }))}
      />
      <Panel
        padding="none"
        footer={
          query.data && !clientFiltered && query.data.total > 0 ? (
            <Pagination
              page={page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(p) => setParams({ page: p > 1 ? p : null })}
              disabled={query.fetching}
              itemLabel="posts"
            />
          ) : clientFiltered && query.data && query.data.total > CLIENT_FILTER_SIZE ? (
            <p className="text-[0.8125rem] text-ink-soft">
              Showing matches among the {CLIENT_FILTER_SIZE} most recently edited published posts.
            </p>
          ) : undefined
        }
      >
        <DataTable
          caption="Blog posts"
          rows={rows}
          loading={query.loading}
          stale={query.isPlaceholder}
          error={query.error}
          onRetry={query.refetch}
          getRowId={(post) => post.id}
          rowHref={(post) => `/admin/blog/${post.id}`}
          columns={columns}
          emptyTitle={
            filter === "draft"
              ? "No drafts"
              : filter === "scheduled"
                ? "Nothing scheduled"
                : filter === "published"
                  ? "No published posts"
                  : "No posts yet"
          }
          emptyDescription={
            filter
              ? "Try another filter, or write a new post."
              : "Write the first article; it stays a draft until you publish it."
          }
          emptyAction={
            <AdminButtonLink href="/admin/blog/new" size="sm" icon="plus">
              New post
            </AdminButtonLink>
          }
        />
      </Panel>
    </>
  );
}
