import { Link } from 'react-router';
import { AlertCircle, ArrowRight, Plus } from 'lucide-react';
import { useMyListingCount, useMyOrderCount } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DASHBOARD_LISTINGS_TEXT, LISTING_TEXT } from '@/lib/messages';

/**
 * One count: a number from `total`, a skeleton while loading, or a short message on failure
 * (only this card is affected).
 * @param {{ label: string, query: { isPending: boolean, isError: boolean, data?: number }, to: string, linkLabel: string, testId: string }} props
 */
function Count({ label, query, to, linkLabel, testId }) {
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
    value = <p className="text-3xl font-bold text-text tabular-nums">{query.data}</p>;
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3" data-testid={testId}>
      <p className="text-sm font-medium text-text-secondary">{label}</p>
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
    <section
      aria-labelledby="dashboard-listings"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dashboard-listings" className="text-xl font-semibold text-text">
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
        />
        <Count
          label={DASHBOARD_LISTINGS_TEXT.paidOrders}
          query={paid}
          to="/farmer/orders?status=paid"
          linkLabel={DASHBOARD_LISTINGS_TEXT.seeOrders}
          testId="count-paid-orders"
        />
      </div>
    </section>
  );
}
