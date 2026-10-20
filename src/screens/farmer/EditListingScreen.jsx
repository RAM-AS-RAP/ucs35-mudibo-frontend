import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, SearchX } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { invalidateListingData, useMyListing, useUpdateListing } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/display/PageHeader';
import { StatusBadge } from '@/components/display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
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

function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title={LISTING_TEXT.notFoundTitle}
      description={LISTING_TEXT.notFound}
      action={<BackLink />}
    />
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
 * Edit listing (/farmer/listings/:id/edit). The listing comes from the cached list or, since a
 * farmer cannot fetch one listing, from pages of GET /listings/mine. Only changed fields are
 * sent. A removed listing is read only.
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
  } else if (!listing || outcome === 'not_found') {
    body = <NotFound />;
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
          key={listing.id}
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
                invalidateListingData(client);
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
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={LISTING_TEXT.editTitle} headingRef={headingRef} />
      {body}
    </div>
  );
}
