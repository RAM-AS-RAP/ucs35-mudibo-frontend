import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/feedback/ErrorState';
import { ADMIN_COMMON } from '@/lib/adminMessages';

/**
 * The Refresh button of an admin screen: a manual refetch (admin screens never poll).
 * @param {{ onRefresh: () => void, refreshing?: boolean, disabled?: boolean, className?: string }} props
 */
export function RefreshButton({ onRefresh, refreshing = false, disabled = false, className }) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || refreshing}
      onClick={onRefresh}
      className={className}
    >
      <RefreshCw aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
      {ADMIN_COMMON.refresh}
    </Button>
  );
}

/**
 * "Showing X of Y" above a list, from an infinite query's pages.
 * @param {{ shown: number, total: number }} props
 */
export function ShowingCount({ shown, total }) {
  return (
    <p className="text-sm text-text-secondary" data-testid="list-count">
      {ADMIN_COMMON.showing(shown, total)}
    </p>
  );
}

/**
 * "Load more" under a list, with the error of a failed next page.
 * @param {{
 *   query: { hasNextPage: boolean, isFetchingNextPage: boolean, isFetchNextPageError: boolean, error: unknown, fetchNextPage: () => unknown },
 *   errorTitle: string,
 * }} props
 */
export function LoadMore({ query, errorTitle }) {
  return (
    <>
      {query.isFetchNextPageError && (
        <ErrorState error={query.error} title={errorTitle} onRetry={() => query.fetchNextPage()} />
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
          {query.isFetchingNextPage ? ADMIN_COMMON.loadingMore : ADMIN_COMMON.loadMore}
        </Button>
      )}
    </>
  );
}

/**
 * The items and total of an infinite query's pages.
 * @template T
 * @param {{ pages: Array<{ items: T[], total: number }> } | undefined} data
 * @returns {{ items: T[], total: number }}
 */
export function pagesOf(data) {
  const pages = data?.pages ?? [];
  return {
    items: pages.flatMap((page) => page.items),
    total: pages.length ? pages[pages.length - 1].total : 0,
  };
}
