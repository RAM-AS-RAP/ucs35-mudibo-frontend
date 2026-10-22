import { useCallback } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ClipboardList } from 'lucide-react';
import { useAdminOrders } from '@/api/queries/admin';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { StatusBadge } from '@/components/display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, useFilterParams } from '@/components/admin/FilterBar';
import { LoadMore, pagesOf, RefreshButton, ShowingCount } from '@/components/admin/ListParts';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import { SearchInput } from '@/components/admin/SearchInput';
import { ORDER_STATUS_FILTERS, ORDERS_TEXT } from '@/lib/adminMessages';
import { formatDateTime, formatKES, formatQuantity } from '@/lib/format';
import { cropLabel } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

/** @typedef {import('@/api/endpoints/admin').AdminOrder} AdminOrder */

const RULES = Object.freeze({
  status: { values: ORDER_STATUS_FILTERS.map((f) => f.value), fallback: 'all' },
  q: { accept: (/** @type {string} */ v) => v.trim().length >= 2 && v.length <= 50 },
});

/** @param {AdminOrder} order */
const needsReview = (order) => order.status === 'needs_reconciliation';

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<AdminOrder>>} */
const COLUMNS = [
  {
    key: 'reference',
    header: ORDERS_TEXT.reference,
    cell: (o) => (
      <span className="flex flex-col gap-1">
        <Link
          to={`/admin/orders/${o.id}`}
          aria-label={`Order ${o.reference}`}
          className="inline-flex min-h-11 items-center font-mono text-primary underline underline-offset-2"
        >
          {o.reference}
        </Link>
        {needsReview(o) && (
          <span
            className="flex items-center gap-1.5 font-sans text-sm font-semibold text-negative-text"
            data-testid="needs-review"
          >
            <AlertTriangle aria-hidden="true" className="size-4 text-negative" />
            {ORDERS_TEXT.needsReview}
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'status',
    header: ORDERS_TEXT.status,
    cell: (o) => <StatusBadge kind="adminOrder" status={o.status} />,
  },
  { key: 'buyer', header: ORDERS_TEXT.buyer, cell: (o) => o.buyer_name },
  { key: 'seller', header: ORDERS_TEXT.seller, cell: (o) => o.seller_name },
  {
    key: 'produce',
    header: ORDERS_TEXT.produce,
    wrap: true,
    cell: (o) =>
      ORDERS_TEXT.produceSummary(cropLabel(o.crop), formatQuantity(o.quantity), o.market),
  },
  {
    key: 'total',
    header: ORDERS_TEXT.total,
    numeric: true,
    cell: (o) => <span data-testid="order-total">{formatKES(o.total_amount)}</span>,
  },
  {
    key: 'payment',
    header: ORDERS_TEXT.payment,
    cell: (o) =>
      o.latest_payment_status ? (
        <StatusBadge kind="adminPayment" status={o.latest_payment_status} />
      ) : (
        ORDERS_TEXT.noPayment
      ),
  },
  {
    key: 'receipt',
    header: ORDERS_TEXT.receipt,
    cell: (o) =>
      o.latest_mpesa_receipt_number ? (
        <span className="font-mono">{o.latest_mpesa_receipt_number}</span>
      ) : (
        ORDERS_TEXT.noReceipt
      ),
  },
  { key: 'created', header: ORDERS_TEXT.created, cell: (o) => formatDateTime(o.created_at) },
];

/**
 * Orders (/admin/orders): every order with one status chip per API status (Needs review,
 * Waiting for payment, Paid, Expired, Cancelled, Failed) and a search by reference or buyer name.
 * Rows stay in the order the API returns them; orders that need review are marked with an icon
 * and the words "Needs review". Each reference links to the order's detail screen. Totals are
 * the server's `total_amount`.
 */
export default function AdminOrdersScreen() {
  const headingRef = usePageTitle(ORDERS_TEXT.title);
  const filters = useFilterParams(RULES);
  const { status, q } = filters.values;
  const query = useAdminOrders({
    status: status === 'all' ? null : /** @type {any} */ (status),
    q,
  });
  const setFilters = filters.set;
  const onSearch = useCallback(
    (/** @type {string | null} */ text) => setFilters({ q: text }),
    [setFilters],
  );

  const { items, total } = pagesOf(query.data);
  let body;
  if (query.isPending) {
    body = <LoadingState label={ORDERS_TEXT.loading} rows={3} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={ORDERS_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={ClipboardList}
        title={filters.active ? ORDERS_TEXT.emptyFilteredTitle : ORDERS_TEXT.emptyTitle}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ShowingCount shown={items.length} total={total} />
        <ResponsiveTable
          caption={ORDERS_TEXT.caption}
          captionHidden
          columns={COLUMNS}
          rows={items}
          rowKey={(o) => o.id}
          rowClassName={(o) =>
            needsReview(o) ? 'border-l-4 border-l-negative bg-neutral-bg' : undefined
          }
        />
        <LoadMore query={query} errorTitle={ORDERS_TEXT.errorTitle} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ORDERS_TEXT.title}
        description={ORDERS_TEXT.description}
        headingRef={headingRef}
        actions={
          <RefreshButton
            onRefresh={() => query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            disabled={query.isPending}
          />
        }
      />
      <FilterBar label={ORDERS_TEXT.filterLabel} active={filters.active} onClear={filters.clear}>
        <Segmented
          legend={ORDERS_TEXT.statusLegend}
          name="admin-order-status"
          options={ORDER_STATUS_FILTERS}
          value={/** @type {any} */ (status)}
          onChange={(value) => filters.set({ status: value })}
        />
        <SearchInput label={ORDERS_TEXT.searchLabel} value={q} onSearch={onSearch} />
      </FilterBar>
      {body}
    </div>
  );
}
