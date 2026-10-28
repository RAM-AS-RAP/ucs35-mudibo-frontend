import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Loader2, Package, PackagePlus, Plus, TrendingUp } from 'lucide-react';
import { ApiError, getUserMessageDetails } from '@/api/errors';
import { invalidateListingData, useMyListings, useRemoveListing } from '@/api/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PageHero, heroButton } from '@/components/display/DashboardHero';
import { Segmented } from '@/components/display/Segmented';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ListingCard } from '@/components/listings/ListingCard';
import { LISTING_STATUS_WORDS, LISTING_TEXT } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { cleanFilterParams, LISTING_FILTER_OPTIONS, LISTING_FILTERS, pickValue } from './params';

/** @typedef {import('@/api/endpoints/listings').Listing} Listing */

const STATUSES = LISTING_FILTERS.filter((s) => s !== 'all');

/**
 * The remove confirmation: the dialog shows a 409 listing_has_pending_orders (or another
 * failure) inside itself with only a Close button.
 * @param {{
 *   target: { listing: Listing, trigger: HTMLElement } | null,
 *   onClose: () => void,
 *   onRemoved: () => void,
 *   onNotFound: () => void,
 *   returnFocus: () => HTMLElement | null,
 * }} props
 */
function RemoveDialog({ target, onClose, onRemoved, onNotFound, returnFocus }) {
  const remove = useRemoveListing();
  const [failure, setFailure] = useState(
    /** @type {{ message: string, reference: string | null } | null} */ (null),
  );

  async function confirm() {
    if (!target || remove.isPending) return;
    try {
      await remove.mutateAsync(target.listing.id);
      onRemoved();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onNotFound();
        return;
      }
      const details = getUserMessageDetails(error);
      setFailure({ message: details.message, reference: details.reference });
    }
  }

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setFailure(null);
          onClose();
        }
      }}
      title={LISTING_TEXT.removeTitle}
      description={LISTING_TEXT.removeText}
      confirmLabel={LISTING_TEXT.removeConfirm}
      cancelLabel={failure ? LISTING_TEXT.close : LISTING_TEXT.cancel}
      pendingLabel={LISTING_TEXT.removing}
      pending={remove.isPending}
      destructive
      hideConfirm={failure !== null}
      onConfirm={confirm}
      returnFocus={returnFocus}
    >
      {failure && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-negative bg-card px-3 py-2 text-sm"
        >
          <p className="font-medium text-negative-text">{failure.message}</p>
          {failure.reference && (
            <p className="text-text-secondary">
              Reference: <span className="font-mono break-all">{failure.reference}</span>
            </p>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}

/**
 * My listings (/farmer/listings): the farmer's listings by status, 20 at a time, with Edit,
 * Remove and View orders. The status filter lives in the URL (`?status=sold_out`).
 */
export default function MyListingsScreen() {
  const headingRef = usePageTitle(LISTING_TEXT.myListingsTitle);
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const filter = pickValue(params.get('status'), LISTING_FILTERS, 'all');
  const status = filter === 'all' ? null : filter;
  const query = useMyListings({ status });
  const [target, setTarget] = useState(
    /** @type {{ listing: Listing, trigger: HTMLElement } | null} */ (null),
  );
  const [notice, setNotice] = useState('');
  // The Remove button that opened the dialog, for focus on close (it outlives `target`).
  const triggerRef = useRef(/** @type {HTMLElement | null} */ (null));

  useEffect(() => {
    const next = cleanFilterParams(params, { statuses: STATUSES });
    if (next) setParams(next, { replace: true });
  }, [params, setParams]);

  /** @param {'all' | 'active' | 'sold_out' | 'removed'} value */
  function changeFilter(value) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setParams(next, { replace: true });
  }

  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const total = pages.length ? pages[pages.length - 1].total : 0;

  let body;
  if (query.isPending) {
    body = <LoadingState label={LISTING_TEXT.loading} rows={2} />;
  } else if (query.isError) {
    body = (
      <ErrorState
        error={query.error}
        title={LISTING_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (items.length === 0) {
    body =
      filter === 'all' ? (
        <EmptyState
          icon={PackagePlus}
          title={LISTING_TEXT.emptyTitle}
          description={LISTING_TEXT.emptyText}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/farmer/listings/new">
                  <Plus aria-hidden="true" />
                  {LISTING_TEXT.createFirst}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/farmer/forecast">
                  <TrendingUp aria-hidden="true" />
                  {LISTING_TEXT.checkForecast}
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <EmptyState
          title={LISTING_TEXT.emptyFilteredTitle(LISTING_STATUS_WORDS[filter].toLowerCase())}
        />
      );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary" data-testid="listings-count">
          {LISTING_TEXT.showing(items.length, total)}
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((listing) => (
            <li key={listing.id} className="flex">
              <ListingCard
                listing={listing}
                onRemove={(chosen, trigger) => {
                  setNotice('');
                  triggerRef.current = trigger;
                  setTarget({ listing: chosen, trigger });
                }}
              />
            </li>
          ))}
        </ul>
        {query.isFetchNextPageError && (
          <ErrorState
            error={query.error}
            title={LISTING_TEXT.errorTitle}
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
            {query.isFetchingNextPage ? LISTING_TEXT.loadingMore : LISTING_TEXT.loadMore}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title={LISTING_TEXT.myListingsTitle}
        description="Your produce for sale. Edit or remove a listing, or see its orders."
        icon={Package}
        headingRef={headingRef}
        actions={
          <Button asChild className={heroButton}>
            <Link to="/farmer/listings/new">
              <Plus aria-hidden="true" />
              {LISTING_TEXT.newListing}
            </Link>
          </Button>
        }
      />
      <Segmented
        legend={LISTING_TEXT.statusLegend}
        name="listing-status"
        options={LISTING_FILTER_OPTIONS}
        value={filter}
        onChange={changeFilter}
      />
      <p role="status" aria-live="polite" className="text-sm text-text empty:hidden">
        {notice}
      </p>
      {body}
      <RemoveDialog
        target={target}
        onClose={() => setTarget(null)}
        onRemoved={() => {
          setTarget(null);
          toast.success(LISTING_TEXT.removed);
        }}
        onNotFound={() => {
          setTarget(null);
          setNotice(LISTING_TEXT.notFoundRefreshed);
          invalidateListingData(client);
        }}
        returnFocus={() =>
          triggerRef.current?.isConnected ? triggerRef.current : headingRef.current
        }
      />
    </div>
  );
}
