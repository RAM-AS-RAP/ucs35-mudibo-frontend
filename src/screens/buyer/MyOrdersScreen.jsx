import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, RefreshCw, ShoppingBag, Smartphone } from 'lucide-react';
import { queryKeys, useMyBuyerOrders } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { OrderSummaryCard } from '@/components/buyer/OrderSummaryCard';
import {
  cleanFilterParams,
  filterNotPaid,
  ORDER_FILTER_OPTIONS,
  ORDER_FILTERS,
  orderFilterStatus,
  pickValue,
} from '@/lib/filterParams';
import { MY_ORDERS_TEXT } from '@/lib/buyerMessages';
import { usePageTitle } from '@/lib/usePageTitle';

const STATUSES = ORDER_FILTERS.filter((s) => s !== 'all');

/**
 * My orders (/buyer/orders). The `status` URL parameter holds the filter (all, paid,
 * pending_payment, not_paid, needs_reconciliation). GET /orders/mine accepts one status, so
 * "Not paid" loads all orders and keeps the expired, cancelled and failed ones from the pages
 * loaded so far, exactly as the farmer's orders screen does (lib/filterParams.js).
 * Refreshes on window focus and with Refresh; never polls. Every refresh of the list also
 * refreshes the waiting count behind the navigation badge.
 */
export default function MyOrdersScreen() {
  const headingRef = usePageTitle(MY_ORDERS_TEXT.title);
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const filter = pickValue(params.get('status'), ORDER_FILTERS, 'all');
  const notPaid = filter === 'not_paid';
  const query = useMyBuyerOrders({ status: orderFilterStatus(filter) });

  useEffect(() => {
    const next = cleanFilterParams(params, { statuses: STATUSES });
    if (next) setParams(next, { replace: true });
  }, [params, setParams]);

  // The list and the badge's count come from the same orders: refresh the count whenever the
  // list was fetched again (focus, Refresh, Load more).
  const firstUpdate = useRef(query.dataUpdatedAt);
  useEffect(() => {
    if (!query.dataUpdatedAt) return;
    if (!firstUpdate.current) {
      // The first load: the count was fetched at the same time by the navigation badge.
      firstUpdate.current = query.dataUpdatedAt;
      return;
    }
    if (query.dataUpdatedAt === firstUpdate.current) return;
    void client.invalidateQueries({ queryKey: queryKeys.waitingOrdersCount() });
  }, [client, query.dataUpdatedAt]);

  /** @param {(typeof ORDER_FILTERS)[number]} value */
  function changeFilter(value) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setParams(next, { replace: true });
  }

  const pages = query.data?.pages ?? [];
  const loaded = pages.flatMap((page) => page.items);
  const total = pages.length ? pages[pages.length - 1].total : 0;
  const items = notPaid ? filterNotPaid(loaded) : loaded;

  let body;
  if (query.isPending) {
    body = <LoadingState label={MY_ORDERS_TEXT.loading} rows={2} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={MY_ORDERS_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else {
    const browse = (
      <Button asChild>
        <Link to="/buyer/browse">{MY_ORDERS_TEXT.browse}</Link>
      </Button>
    );
    const nothing =
      items.length === 0 &&
      (filter === 'all' ? (
        <EmptyState icon={ShoppingBag} title={MY_ORDERS_TEXT.emptyTitle} action={browse} />
      ) : (
        <EmptyState icon={ShoppingBag} title={MY_ORDERS_TEXT.emptyFilteredTitle} />
      ));
    body = (
      <div className="flex flex-col gap-4">
        {notPaid && (
          <p
            className="flex items-start gap-2 text-sm text-text-secondary"
            data-testid="not-paid-note"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{MY_ORDERS_TEXT.notPaidNote}</span>
          </p>
        )}
        {(items.length > 0 || (notPaid && total > 0)) && (
          <p className="text-sm text-text-secondary" data-testid="orders-count">
            {notPaid
              ? MY_ORDERS_TEXT.notPaidShowing(items.length, loaded.length, total)
              : MY_ORDERS_TEXT.showing(items.length, total)}
          </p>
        )}
        {nothing}
        {items.length > 0 && (
          <ul className="grid gap-4 lg:grid-cols-2">
            {items.map((order) => (
              <li key={order.id} className="flex flex-col">
                <OrderSummaryCard order={order} to={`/buyer/orders/${order.id}`}>
                  {order.can_pay === true && (
                    <Button asChild className="w-full sm:w-fit">
                      <Link to={`/buyer/orders/${order.id}`}>
                        <Smartphone aria-hidden="true" />
                        <span>{MY_ORDERS_TEXT.continuePayment}</span>
                        <span className="sr-only">{` for order ${order.reference}`}</span>
                      </Link>
                    </Button>
                  )}
                </OrderSummaryCard>
              </li>
            ))}
          </ul>
        )}
        {query.isFetchNextPageError && (
          <ErrorState
            error={query.error}
            title={MY_ORDERS_TEXT.errorTitle}
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
            {query.isFetchingNextPage ? MY_ORDERS_TEXT.loadingMore : MY_ORDERS_TEXT.loadMore}
          </Button>
        )}
      </div>
    );
  }

  const refreshing = query.isRefetching && !query.isFetchingNextPage;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={MY_ORDERS_TEXT.title}
        headingRef={headingRef}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={query.isPending || refreshing}
            onClick={() => query.refetch()}
          >
            <RefreshCw aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
            {MY_ORDERS_TEXT.refresh}
          </Button>
        }
      />
      <Segmented
        legend={MY_ORDERS_TEXT.filterLegend}
        name="buyer-order-status"
        options={ORDER_FILTER_OPTIONS}
        value={filter}
        onChange={changeFilter}
      />
      {body}
    </div>
  );
}
