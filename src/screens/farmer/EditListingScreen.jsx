import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, PencilLine } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { invalidateListingData, useMyListing, useUpdateListing } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/display/DashboardHero';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ListingForm } from '@/components/listings/ListingForm';
import { toDecimalText } from '@/lib/decimal';
import { cropLabel, LISTING_TEXT } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

/** @typedef {import('@/api/endpoints/listings').Listing} Listing */

function BackLink() {
  return (
    <Button asChild variant="outline" className="w-fit">
      <Link to="/farmer/listings">
        <ArrowLeft aria-hidden="true" />
        {LISTING_TEXT.backToListings}
      </Link>
    </Button>
  );
}

/** @param {{ listing: Listing }} props */
function RemovedNotice({ listing }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        role="status"
        className="flex flex-col gap-2 rounded-xl border border-border bg-neutral-bg p-4 text-neutral-text"
      >
        <p className="flex items-center gap-2 font-semibold">
          <Ban aria-hidden="true" className="size-5 shrink-0" />
          <span>{LISTING_TEXT.removedNoticeTitle}</span>
        </p>
        <p>{LISTING_TEXT.removedNotice}</p>
        <p className="text-sm">
          {cropLabel(listing.crop)} in {listing.market}
        </p>
      </div>
      <BackLink />
    </div>
  );
}

/**
 * Edit listing (/farmer/listings/:id/edit). The listing comes from the cached list or from
 * GET /listings/mine/{id}. Only changed fields are sent. A removed listing is read only. When
 * the listing is not found (a 404 listing_not_found on load or on save) the farmer goes back to
 * My listings, which is refreshed.
 */
export default function EditListingScreen() {
  const headingRef = usePageTitle(LISTING_TEXT.editTitle);
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useMyListing(id);
  const update = useUpdateListing();
  // Set when a save answers listing_removed or listing_not_found.
  const [outcome, setOutcome] = useState(/** @type {null | 'removed' | 'not_found'} */ (null));

  /** @type {Listing | null | undefined} */
  const listing = query.data;
  const notFound = (query.isSuccess && listing === null) || outcome === 'not_found';

  // Leave once only (StrictMode runs effects twice in development).
  const leftRef = useRef(false);
  useEffect(() => {
    if (!notFound || leftRef.current) return;
    leftRef.current = true;
    invalidateListingData(client, { skipListing: id });
    toast.error(LISTING_TEXT.notFoundRefreshed);
    navigate('/farmer/listings', { replace: true });
  }, [notFound, client, navigate, id]);

  let body;
  if (query.isPending) {
    body = <LoadingState label={LISTING_TEXT.findingListing} rows={3} />;
  } else if (query.isError) {
    body = (
      <ErrorState
        error={query.error}
        title={LISTING_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (!listing || notFound) {
    body = null;
  } else if (listing.status === 'removed' || outcome === 'removed') {
    body = <RemovedNotice listing={listing} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-secondary">Status</span>
          <StatusBadge kind="listing" status={listing.status} />
        </div>
        <ListingForm
          // A listing seeded from the cached list is confirmed by GET /listings/mine/{id}; the
          // form starts again once, from the server's values, when that answer arrives.
          key={`${listing.id}:${query.isFetchedAfterMount ? 'confirmed' : 'seed'}`}
          mode="edit"
          listing={listing}
          initial={{
            crop: listing.crop,
            market: listing.market,
            quantity: toDecimalText(listing.quantity_available),
            price: toDecimalText(listing.price_per_unit),
          }}
          onSubmit={async (changes) => {
            try {
              await update.mutateAsync({
                id: listing.id,
                changes: /** @type {import('@/api/endpoints/listings').ListingChanges} */ (changes),
              });
            } catch (error) {
              if (error instanceof ApiError && error.code === 'listing_removed') {
                setOutcome('removed');
                invalidateListingData(client);
                return;
              }
              if (error instanceof ApiError && error.code === 'listing_not_found') {
                setOutcome('not_found');
                return;
              }
              throw error;
            }
            toast.success(LISTING_TEXT.saved);
            navigate('/farmer/listings');
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title={LISTING_TEXT.editTitle}
        description={LISTING_TEXT.editDescription}
        icon={PencilLine}
        headingRef={headingRef}
      />
      {body}
    </div>
  );
}
