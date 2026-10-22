import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertCircle, Info, Loader2, SearchX, Sprout, X } from 'lucide-react';
import { useBrowseListings, useBuyerMarkets } from '@/api/queries';
import { ApiError, getUserMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { BuyerListingCard } from '@/components/buyer/BuyerListingCard';
import { BROWSE_TEXT } from '@/lib/buyerMessages';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  BROWSE_CROP_OPTIONS,
  minAboveMax,
  parsePriceFilter,
  readBrowseParams,
  SORT_OPTIONS,
  SORTS,
  writeBrowseParams,
} from './params';

/** Wait this long after the last keystroke in a price field before filtering. */
export const PRICE_DEBOUNCE_MS = 400;

const SELECT_CLASS =
  'flex min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-text outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * The text of a 422 from GET /listings (an unknown market, or a minimum above the maximum).
 * @param {unknown} error
 */
function filterProblemText(error) {
  if (error instanceof ApiError && Array.isArray(error.details) && error.details.length > 0) {
    const lines = error.details
      .map((d) => (d && typeof d.message === 'string' ? d.message : ''))
      .filter(Boolean);
    if (lines.length) return lines.join(' ');
  }
  return getUserMessage(error);
}

/**
 * Browse produce (/buyer/browse): active listings with stock, 20 at a time. Filters live in the
 * URL (`crop`, `market`, `min`, `max`, `sort`), validated on load. The price fields wait 400 ms
 * after typing; an invalid price or a minimum above the maximum shows a message and sends no
 * request. The market filter offers "All markets" and the markets from GET /listings/markets
 * with their counts ("Nairobi (6)"); buyers cannot call GET /markets. A market in the URL is kept
 * until that list has loaded, then dropped when it is not on it. If the list cannot be loaded,
 * only "All markets" is offered (with a message and a way to load it again) and browsing goes on
 * without a market filter.
 */
export default function BrowseScreen() {
  const headingRef = usePageTitle(BROWSE_TEXT.title);
  const ids = useId();
  const [params, setParams] = useSearchParams();
  const markets = useBuyerMarkets();
  // null while the list loads (a URL market is kept); [] when it failed (only "All markets").
  const marketNames = useMemo(() => {
    if (markets.data) return markets.data.map((m) => m.name);
    return markets.isError ? [] : null;
  }, [markets.data, markets.isError]);
  const filters = readBrowseParams(params, marketNames);
  // A market from the URL is checked against the list before the first request.
  const waitingForMarkets = Boolean(filters.market) && markets.isPending;
  const [minText, setMinText] = useState(filters.minPrice ?? '');
  const [maxText, setMaxText] = useState(filters.maxPrice ?? '');

  const min = parsePriceFilter(minText);
  const max = parsePriceFilter(maxText);
  const reversed = min.ok && max.ok && minAboveMax(min.value, max.value);
  const priceProblem = !min.ok || !max.ok || reversed;

  const query = useBrowseListings(filters, { enabled: !priceProblem && !waitingForMarkets });

  // Replace invalid or redundant values in the URL by the defaults.
  useEffect(() => {
    const clean = writeBrowseParams(readBrowseParams(params, marketNames));
    if (clean.toString() !== params.toString()) setParams(clean, { replace: true });
  }, [params, setParams, marketNames]);

  // Apply the typed prices 400 ms after the last change, only when both are valid.
  useEffect(() => {
    const id = setTimeout(() => {
      const nextMin = parsePriceFilter(minText);
      const nextMax = parsePriceFilter(maxText);
      if (!nextMin.ok || !nextMax.ok || minAboveMax(nextMin.value, nextMax.value)) return;
      const current = readBrowseParams(params, marketNames);
      if (current.minPrice === nextMin.value && current.maxPrice === nextMax.value) return;
      setParams(
        writeBrowseParams({ ...current, minPrice: nextMin.value, maxPrice: nextMax.value }),
        { replace: true },
      );
    }, PRICE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [minText, maxText, params, setParams, marketNames]);

  /** @param {Partial<ReturnType<typeof readBrowseParams>>} change */
  function update(change) {
    setParams(writeBrowseParams({ ...readBrowseParams(params, marketNames), ...change }), {
      replace: true,
    });
  }

  function clearFilters() {
    setMinText('');
    setMaxText('');
    setParams(new URLSearchParams(), { replace: true });
  }

  const filtered =
    Boolean(filters.crop || filters.market || filters.minPrice || filters.maxPrice) ||
    minText.trim() !== '' ||
    maxText.trim() !== '';
  const pages = query.data?.pages ?? [];
  // The server lists only active listings with stock; anything else is never shown.
  const items = pages
    .flatMap((page) => page.items)
    .filter((listing) => listing.status === 'active' && Number(listing.quantity_available) > 0);
  const total = pages.length ? pages[pages.length - 1].total : 0;
  const serverFilterError =
    query.isError && query.error instanceof ApiError && query.error.status === 422;

  let priceMessage = null;
  if (!min.ok) priceMessage = { id: `${ids}-min`, text: min.error };
  else if (!max.ok) priceMessage = { id: `${ids}-max`, text: max.error };
  else if (reversed) priceMessage = { id: `${ids}-min`, text: BROWSE_TEXT.minAboveMax };
  const priceMessageId = `${ids}-price-message`;
  // Until the list loads, still show the market chosen in the URL (without a count).
  /** @type {Array<{ name: string, label: string }>} */
  let marketOptions = [];
  if (markets.data) {
    marketOptions = markets.data.map((m) => ({
      name: m.name,
      label: BROWSE_TEXT.marketOption(m.name, m.listing_count),
    }));
  } else if (marketNames === null && filters.market) {
    marketOptions = [{ name: filters.market, label: filters.market }];
  }

  let body;
  if (priceProblem && !query.data) {
    body = null;
  } else if (query.isPending && !priceProblem) {
    body = <LoadingState label={BROWSE_TEXT.loading} rows={3} />;
  } else if (serverFilterError) {
    body = null;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={BROWSE_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={SearchX}
        title={BROWSE_TEXT.emptyFilteredTitle}
        action={
          <Button type="button" variant="outline" onClick={clearFilters}>
            <X aria-hidden="true" />
            {BROWSE_TEXT.clearFilters}
          </Button>
        }
      />
    ) : (
      <EmptyState icon={Sprout} title={BROWSE_TEXT.emptyTitle} />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary" data-testid="browse-count">
          {BROWSE_TEXT.showing(items.length, total)}
        </p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((listing) => (
            <li key={listing.id} className="flex flex-col">
              <BuyerListingCard listing={listing} />
            </li>
          ))}
        </ul>
        {query.isFetchNextPageError && (
          <ErrorState
            error={query.error}
            title={BROWSE_TEXT.errorTitle}
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
            {query.isFetchingNextPage ? BROWSE_TEXT.loadingMore : BROWSE_TEXT.loadMore}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={BROWSE_TEXT.title}
        description={BROWSE_TEXT.description}
        headingRef={headingRef}
      />
      <p className="flex items-start gap-2 text-sm text-text-secondary">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{BROWSE_TEXT.priceNote}</span>
      </p>

      <div
        role="search"
        aria-label="Filter produce"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      >
        <Segmented
          legend={BROWSE_TEXT.cropLegend}
          name="browse-crop"
          options={BROWSE_CROP_OPTIONS}
          value={filters.crop ?? 'all'}
          onChange={(value) => update({ crop: value === 'all' ? null : value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-market`}>{BROWSE_TEXT.marketLabel}</Label>
            <select
              id={`${ids}-market`}
              className={SELECT_CLASS}
              value={filters.market ?? ''}
              onChange={(event) => update({ market: event.target.value || null })}
            >
              <option value="">{BROWSE_TEXT.allMarkets}</option>
              {marketOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.label}
                </option>
              ))}
            </select>
            {markets.isError && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
                <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
                <span>{BROWSE_TEXT.marketsError}</span>
                <Button
                  type="button"
                  variant="link"
                  className="min-h-11 px-0"
                  onClick={() => markets.refetch()}
                >
                  {BROWSE_TEXT.marketsRetry}
                </Button>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-sort`}>{BROWSE_TEXT.sortLabel}</Label>
            <select
              id={`${ids}-sort`}
              className={SELECT_CLASS}
              value={filters.sort}
              onChange={(event) =>
                update({
                  sort: /** @type {(typeof SORTS)[number]} */ (
                    SORTS.includes(/** @type {any} */ (event.target.value))
                      ? event.target.value
                      : 'newest'
                  ),
                })
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-min`}>{BROWSE_TEXT.minPriceLabel}</Label>
            <Input
              id={`${ids}-min`}
              inputMode="decimal"
              autoComplete="off"
              value={minText}
              onChange={(event) => setMinText(event.target.value)}
              aria-invalid={!min.ok || reversed ? true : undefined}
              aria-describedby={
                priceMessage ? `${ids}-price-hint ${priceMessageId}` : `${ids}-price-hint`
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-max`}>{BROWSE_TEXT.maxPriceLabel}</Label>
            <Input
              id={`${ids}-max`}
              inputMode="decimal"
              autoComplete="off"
              value={maxText}
              onChange={(event) => setMaxText(event.target.value)}
              aria-invalid={!max.ok || reversed ? true : undefined}
              aria-describedby={
                priceMessage ? `${ids}-price-hint ${priceMessageId}` : `${ids}-price-hint`
              }
            />
          </div>
        </div>
        <p id={`${ids}-price-hint`} className="text-sm text-text-secondary">
          {BROWSE_TEXT.priceHint}
        </p>
        <div role="alert" className="empty:hidden">
          {priceMessage && (
            <p
              id={priceMessageId}
              className="flex items-start gap-1.5 text-sm text-negative-text"
              data-testid="price-message"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
              <span>{priceMessage.text}</span>
            </p>
          )}
          {!priceMessage && serverFilterError && (
            <div className="flex flex-col gap-1 text-sm" data-testid="server-filter-message">
              <p className="flex items-start gap-1.5 font-semibold text-negative-text">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
                <span>{BROWSE_TEXT.filterProblemTitle}</span>
              </p>
              <p className="text-text">{filterProblemText(query.error)}</p>
            </div>
          )}
        </div>
        {filtered && (
          <Button type="button" variant="ghost" className="w-fit" onClick={clearFilters}>
            <X aria-hidden="true" />
            {BROWSE_TEXT.clearFilters}
          </Button>
        )}
      </div>

      {body}
    </div>
  );
}
