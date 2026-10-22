import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, Package, Trash2, UserX } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { useMarkets } from '@/api/queries';
import { queryKeys } from '@/api/queries/keys';
import { useAdminListings, useRemoveListingAsAdmin } from '@/api/queries/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ProducePhoto } from '@/components/buyer/ProducePhoto';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { FilterBar, SELECT_CLASS, useFilterParams } from '@/components/admin/FilterBar';
import { LoadMore, pagesOf, RefreshButton, ShowingCount } from '@/components/admin/ListParts';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import { SearchInput } from '@/components/admin/SearchInput';
import {
  adminErrorMessage,
  isUnknownWriteResult,
  LISTING_FILTER_OPTIONS,
  LISTINGS_TEXT,
  WRITE_UNKNOWN,
} from '@/lib/adminMessages';
import { formatDateTime, formatKES, formatQuantity } from '@/lib/format';
import { cropLabel } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

/** @typedef {import('@/api/endpoints/admin').AdminListing} AdminListing */
/** @typedef {import('@/components/admin/ConfirmDialog').DialogError} DialogError */

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<AdminListing>>} */
const COLUMNS = [
  {
    key: 'produce',
    header: LISTINGS_TEXT.produce,
    cell: (l) => `${cropLabel(l.crop)}, ${l.market}`,
  },
  {
    key: 'photo',
    header: LISTINGS_TEXT.photo,
    cell: (l) => (
      <ProducePhoto
        imageUrl={l.image_url}
        alt={LISTINGS_TEXT.photoAlt(cropLabel(l.crop), l.market)}
        className="w-24"
      />
    ),
  },
  {
    key: 'quantity',
    header: LISTINGS_TEXT.quantity,
    numeric: true,
    cell: (l) => `${formatQuantity(l.quantity_available)} ${l.unit}`,
  },
  {
    key: 'price',
    header: LISTINGS_TEXT.price,
    numeric: true,
    cell: (l) => LISTINGS_TEXT.perUnit(formatKES(l.price_per_unit), l.unit),
  },
  {
    key: 'status',
    header: LISTINGS_TEXT.status,
    wrap: true,
    cell: (l) => (
      <span className="flex flex-col gap-1">
        <StatusBadge kind="listing" status={l.status} />
        {l.status === 'removed' && l.removed_at && (
          <span className="text-sm text-text-secondary">
            {LISTINGS_TEXT.removedBy(formatDateTime(l.removed_at), l.removed_by_name)}
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'farmer',
    header: LISTINGS_TEXT.farmer,
    wrap: true,
    cell: (l) => (
      <span className="flex flex-wrap items-center gap-2">
        <span>{l.farmer_name}</span>
        {l.farmer_disabled === true && (
          <Badge variant="negative" data-testid="farmer-disabled">
            <UserX aria-hidden="true" />
            <span>{LISTINGS_TEXT.farmerDisabled}</span>
          </Badge>
        )}
      </span>
    ),
  },
  {
    key: 'orders',
    header: LISTINGS_TEXT.orders,
    wrap: true,
    cell: (l) => LISTINGS_TEXT.orderCounts(l.pending_orders ?? 0, l.paid_orders ?? 0),
  },
];

/**
 * Listing moderation (/admin/listings): every listing with status and crop chips, a market
 * select (GET /markets, which administrators may call) and a search by farmer. Remove (not for
 * removed listings) asks first; a 409 listing_has_open_payments keeps the dialog open with
 * Close, and a 404 refreshes the list.
 */
export default function AdminListingsScreen() {
  const headingRef = usePageTitle(LISTINGS_TEXT.title);
  const ids = useId();
  const client = useQueryClient();
  const markets = useMarkets();
  const marketNames = useMemo(() => {
    if (markets.data) return markets.data.map((m) => m.name);
    return markets.isError ? [] : null;
  }, [markets.data, markets.isError]);
  const rules = useMemo(
    () => ({
      status: { values: ['all', 'active', 'sold_out', 'removed'], fallback: 'all' },
      crop: { values: ['all', 'maize', 'beans'], fallback: 'all' },
      // Kept as it is until the market list has loaded; then only a listed market stays.
      market: {
        accept: (/** @type {string} */ v) =>
          v.length <= 100 && (marketNames === null || marketNames.includes(v)),
      },
      q: { accept: (/** @type {string} */ v) => v.trim().length >= 2 && v.length <= 50 },
    }),
    [marketNames],
  );
  const filters = useFilterParams(rules);
  const { status, crop, market, q } = filters.values;
  const query = useAdminListings({
    status: status === 'all' ? null : /** @type {any} */ (status),
    crop: crop === 'all' ? null : /** @type {any} */ (crop),
    market,
    q,
  });
  const remove = useRemoveListingAsAdmin();
  const [removing, setRemoving] = useState(/** @type {AdminListing | null} */ (null));
  const [open, setOpen] = useState(false);
  const [dialogError, setDialogError] = useState(/** @type {DialogError | null} */ (null));
  const opener = useRef(/** @type {HTMLElement | null} */ (null));
  const setFilters = filters.set;
  const onSearch = useCallback(
    (/** @type {string | null} */ text) => setFilters({ q: text }),
    [setFilters],
  );

  /** @param {AdminListing} listing */
  function askRemove(listing) {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    setRemoving(listing);
    setDialogError(null);
    setOpen(true);
  }

  async function runRemove() {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      setOpen(false);
      toast.success(LISTINGS_TEXT.removed);
    } catch (error) {
      if (isUnknownWriteResult(error)) {
        setDialogError({ message: WRITE_UNKNOWN.list, final: true });
        return;
      }
      const code = error instanceof ApiError ? error.code : '';
      setDialogError({
        message: adminErrorMessage(error),
        reference: error instanceof ApiError ? error.requestId : null,
        final: code === 'listing_has_open_payments' || code === 'listing_not_found',
      });
      if (code === 'listing_not_found') {
        void client.invalidateQueries({ queryKey: queryKeys.adminListingsRoot() });
      }
    }
  }

  const { items, total } = pagesOf(query.data);
  let body;
  if (query.isPending) {
    body = <LoadingState label={LISTINGS_TEXT.loading} rows={3} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={LISTINGS_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={Package}
        title={filters.active ? LISTINGS_TEXT.emptyFilteredTitle : LISTINGS_TEXT.emptyTitle}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ShowingCount shown={items.length} total={total} />
        <ResponsiveTable
          caption={LISTINGS_TEXT.caption}
          captionHidden
          columns={COLUMNS}
          rows={items}
          rowKey={(l) => l.id}
          actions={(listing) =>
            listing.status === 'removed' ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`${LISTINGS_TEXT.remove} ${cropLabel(listing.crop)} in ${listing.market} by ${listing.farmer_name}`}
                onClick={() => askRemove(listing)}
                disabled={remove.isPending}
              >
                <Trash2 aria-hidden="true" />
                {LISTINGS_TEXT.remove}
              </Button>
            )
          }
        />
        <LoadMore query={query} errorTitle={LISTINGS_TEXT.errorTitle} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={LISTINGS_TEXT.title}
        description={LISTINGS_TEXT.description}
        headingRef={headingRef}
        actions={
          <RefreshButton
            onRefresh={() => query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            disabled={query.isPending}
          />
        }
      />
      <FilterBar label={LISTINGS_TEXT.filterLabel} active={filters.active} onClear={filters.clear}>
        <Segmented
          legend={LISTINGS_TEXT.statusLegend}
          name="admin-listing-status"
          options={LISTING_FILTER_OPTIONS.status}
          value={/** @type {any} */ (status)}
          onChange={(value) => filters.set({ status: value })}
        />
        <Segmented
          legend={LISTINGS_TEXT.cropLegend}
          name="admin-listing-crop"
          options={LISTING_FILTER_OPTIONS.crop}
          value={/** @type {any} */ (crop)}
          onChange={(value) => filters.set({ crop: value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-market`}>{LISTINGS_TEXT.marketLabel}</Label>
            <select
              id={`${ids}-market`}
              className={SELECT_CLASS}
              value={market ?? ''}
              onChange={(event) => filters.set({ market: event.target.value || null })}
            >
              <option value="">{LISTINGS_TEXT.allMarkets}</option>
              {(marketNames ?? (market ? [market] : [])).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {markets.isError && (
              <p className="flex items-start gap-1.5 text-sm text-text-secondary">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{LISTINGS_TEXT.marketsError}</span>
              </p>
            )}
          </div>
          <SearchInput label={LISTINGS_TEXT.searchLabel} value={q} onSearch={onSearch} />
        </div>
      </FilterBar>
      {body}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={LISTINGS_TEXT.removeTitle}
        description={LISTINGS_TEXT.removeBody}
        confirmLabel={LISTINGS_TEXT.removeConfirm}
        pendingLabel={LISTINGS_TEXT.removing}
        destructive
        pending={remove.isPending}
        onConfirm={runRemove}
        error={dialogError}
        returnFocus={() => (opener.current?.isConnected ? opener.current : headingRef.current)}
      />
    </div>
  );
}
