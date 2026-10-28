import { Link } from 'react-router';
import { AlertCircle, ArrowRight, Package, Plus, ReceiptText } from 'lucide-react';
import { useMyListingCount, useMyOrderCount } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TILE_TONES } from '@/components/display/StatCard';
import { cn } from '@/lib/utils';
import { DASHBOARD_LISTINGS_TEXT, LISTING_TEXT } from '@/lib/messages';

/**
 * One count: a number from `total`, a skeleton while loading, or a short message on failure
 * (only this card is affected).
 * @param {{ label: string, query: { isPending: boolean, isError: boolean, data?: number }, to: string, linkLabel: string, testId: string, icon: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>, tone: 'primary' | 'gold' }} props
 */
function Count({ label, query, to, linkLabel, testId, icon: Icon, tone }) {
  let value;
  if (query.isPending) {
    // A labelled status, so screen readers hear that the number is loading.
    value = (
      <span role="status">
        <span className="sr-only">{DASHBOARD_LISTINGS_TEXT.loading(label)}</span>
        <Skeleton className="h-9 w-12" />
      </span>
    );
  } else if (query.isError || typeof query.data !== 'number') {
    value = (
      <p className="flex items-start gap-1.5 text-sm text-text-secondary">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{DASHBOARD_LISTINGS_TEXT.countError}</span>
      </p>
    );
  } else {
    value = (
      <p className="text-4xl font-extrabold tracking-tight text-text tabular-nums">{query.data}</p>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-card"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text-secondary">{label}</p>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            TILE_TONES[tone],
          )}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
      {value}
      <Button asChild variant="link" className="w-fit px-0">
        <Link to={to}>
          <span>{linkLabel}</span>
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

/**
 * The dashboard's listings card: active listings and paid orders (two requests with limit=1
 * reading `total`), a New listing button and links to both screens.
 */
export function ListingsSummary() {
  const active = useMyListingCount('active');
  const paid = useMyOrderCount('paid');
  return (
    <section aria-labelledby="dashboard-listings" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="dashboard-listings"
          className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-text"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Package aria-hidden="true" className="size-5" />
          </span>
          {DASHBOARD_LISTINGS_TEXT.title}
        </h2>
        <Button asChild>
          <Link to="/farmer/listings/new">
            <Plus aria-hidden="true" />
            {LISTING_TEXT.newListing}
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Count
          label={DASHBOARD_LISTINGS_TEXT.activeListings}
          query={active}
          to="/farmer/listings?status=active"
          linkLabel={DASHBOARD_LISTINGS_TEXT.seeListings}
          testId="count-active-listings"
          icon={Package}
          tone="primary"
        />
        <Count
          label={DASHBOARD_LISTINGS_TEXT.paidOrders}
          query={paid}
          to="/farmer/orders?status=paid"
          linkLabel={DASHBOARD_LISTINGS_TEXT.seeOrders}
          testId="count-paid-orders"
          icon={ReceiptText}
          tone="gold"
        />
      </div>
    </section>
  );
}
