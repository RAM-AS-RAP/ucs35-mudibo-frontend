import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Handshake, Info, Loader2, RefreshCw, X } from 'lucide-react';
import { useMyOrders } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { OrderCard } from '@/components/orders/OrderCard';
import { ORDER_TEXT } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  cleanFilterParams,
  isUuid,
  NOT_PAID_STATUSES,
  ORDER_FILTER_OPTIONS,
  ORDER_FILTERS,
  pickValue,
} from './params';

const STATUSES = ORDER_FILTERS.filter((s) => s !== 'all');

/**
 * Orders on my listings (/farmer/orders). Filters live in the URL: `status` (all, paid,
 * pending_payment, not_paid, needs_reconciliation) and `listing` (one listing's id).
 *
 * GET /listings/mine/orders accepts one status, so "Not paid" loads all orders and keeps the
 * expired, cancelled and failed ones from the pages loaded so far (a note says so).
 * Refreshes on window focus and with the Refresh button; never polls.
 */
export default function OrdersScreen() {
  const headingRef = usePageTitle(ORDER_TEXT.title);
  const [params, setParams] = useSearchParams();
  const filter = pickValue(params.get('status'), ORDER_FILTERS, 'all');
  const listingParam = params.get('listing');
  const listingId = isUuid(listingParam) ? listingParam : null;
  const notPaid = filter === 'not_paid';
  const status = filter === 'all' || notPaid ? null : filter;
  const query = useMyOrders({ status, listingId });

  useEffect(() => {
    const next = cleanFilterParams(params, { statuses: STATUSES, listing: true });
    if (next) setParams(next, { replace: true });
  }, [params, setParams]);

  /** @param {(typeof ORDER_FILTERS)[number]} value */
  function changeFilter(value) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setParams(next, { replace: true });
  }

  function clearListing() {
    const next = new URLSearchParams(params);
    next.delete('listing');
    setParams(next, { replace: true });
    headingRef.current?.focus();
  }

  const pages = query.data?.pages ?? [];
  const loaded = pages.flatMap((page) => page.items);
  const total = pages.length ? pages[pages.length - 1].total : 0;
  const items = notPaid
    ? loaded.filter((order) => NOT_PAID_STATUSES.includes(order.status))
    : loaded;
  const serverNote = pages[0]?.note;
  const note =
    typeof serverNote === 'string' && serverNote.trim() ? serverNote : ORDER_TEXT.noteFallback;

  let body;
  if (query.isPending) {
    body = <LoadingState label={ORDER_TEXT.loading} rows={2} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={ORDER_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else {
    const nothing =
      items.length === 0 &&
      (filter === 'all' && !listingId ? (
        <EmptyState title={ORDER_TEXT.emptyTitle} description={ORDER_TEXT.emptyText} />
      ) : (
        <EmptyState title={ORDER_TEXT.emptyFilteredTitle} description={ORDER_TEXT.emptyText} />
      ));
    body = (
      <div className="flex flex-col gap-4">
        {notPaid && (
          <p
            className="flex items-start gap-2 text-sm text-text-secondary"
            data-testid="not-paid-note"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{ORDER_TEXT.notPaidNote}</span>
          </p>
        )}
        {(items.length > 0 || (notPaid && total > 0)) && (
          <p className="text-sm text-text-secondary" data-testid="orders-count">
            {notPaid
              ? ORDER_TEXT.notPaidShowing(items.length, loaded.length, total)
              : ORDER_TEXT.showing(items.length, total)}
          </p>
        )}
        {nothing}
        {items.length > 0 && (
          <ul className="grid gap-4 lg:grid-cols-2">
            {items.map((order) => (
              <li key={order.order_id} className="flex flex-col">
                <OrderCard order={order} />
              </li>
            ))}
          </ul>
        )}
        {query.isFetchNextPageError && (
          <ErrorState
            error={query.error}
            title={ORDER_TEXT.errorTitle}
            onRetry={() => query.fetchNextPage()}
          />
        )}
        {query.hasNextPage && !query.isFetchNextPageError && (
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-fit"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage && <Loader2 aria-hidden="true" className="animate-spin" />}
            {query.isFetchingNextPage ? ORDER_TEXT.loadingMore : ORDER_TEXT.loadMore}
          </Button>
        )}
      </div>
    );
  }

  const refreshing = query.isRefetching && !query.isFetchingNextPage;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ORDER_TEXT.title}
        headingRef={headingRef}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={query.isPending || refreshing}
            onClick={() => query.refetch()}
          >
            <RefreshCw aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
            {ORDER_TEXT.refresh}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-neutral-bg p-4 text-neutral-text">
        <p className="flex items-start gap-2" data-testid="orders-note">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{note}</span>
        </p>
        <p className="flex items-start gap-2">
          <Handshake aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{ORDER_TEXT.delivery}</span>
        </p>
      </div>
      <Segmented
        legend={ORDER_TEXT.filterLegend}
        name="order-status"
        options={ORDER_FILTER_OPTIONS}
        value={filter}
        onChange={changeFilter}
      />
      {listingId && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center rounded-full border border-primary bg-card px-4 text-base text-text">
            {ORDER_TEXT.oneListingChip}
          </span>
          <Button type="button" variant="ghost" onClick={clearListing}>
            <X aria-hidden="true" />
            {ORDER_TEXT.clearListing}
          </Button>
        </div>
      )}
      {body}
    </div>
  );
}
