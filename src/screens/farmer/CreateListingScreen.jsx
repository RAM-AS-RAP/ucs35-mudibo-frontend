import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useCreateListing, useMarkets } from '@/api/queries';
import { PackagePlus } from 'lucide-react';
import { PageHero } from '@/components/display/DashboardHero';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ListingForm } from '@/components/listings/ListingForm';
import { LISTING_TEXT } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';
import { CROPS, DEFAULT_CROP, pickValue } from './params';

/**
 * New listing (/farmer/listings/new). The forecast screen's "Plan a listing" link passes `crop`
 * and `market`; they preselect the form only when valid (the market must be in GET /markets).
 * Success goes to My listings with a "Listing created" toast.
 */
export default function CreateListingScreen() {
  const headingRef = usePageTitle(LISTING_TEXT.newListing);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const markets = useMarkets();
  const create = useCreateListing();

  let body;
  if (markets.isPending) {
    body = <LoadingState label={LISTING_TEXT.marketsLoading} rows={3} />;
  } else if (markets.isError) {
    body = (
      <ErrorState
        error={markets.error}
        title={LISTING_TEXT.noMarketsTitle}
        onRetry={() => markets.refetch()}
      />
    );
  } else {
    const names = markets.data.map((m) => m.name);
    const wanted = params.get('market');
    const initial = {
      crop: pickValue(params.get('crop'), CROPS, DEFAULT_CROP),
      market: wanted && names.includes(wanted) ? wanted : '',
      quantity: '',
      price: '',
    };
    const noMarkets = names.length === 0;
    body = (
      <div className="flex flex-col gap-4">
        {noMarkets && (
          <EmptyState title={LISTING_TEXT.noMarketsTitle} description={LISTING_TEXT.noMarkets} />
        )}
        <ListingForm
          mode="create"
          initial={initial}
          markets={names}
          disabled={noMarkets}
          onSubmit={async (fields) => {
            await create.mutateAsync(
              /** @type {import('@/api/endpoints/listings').NewListingFields} */ (fields),
            );
            toast.success(LISTING_TEXT.created);
            navigate('/farmer/listings');
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title={LISTING_TEXT.newListing}
        description={LISTING_TEXT.createDescription}
        icon={PackagePlus}
        headingRef={headingRef}
      />
      {body}
    </div>
  );
}
