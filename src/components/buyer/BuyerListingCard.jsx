import { Link } from 'react-router';
import { Package, User } from 'lucide-react';
import { formatKES, formatQuantity } from '@/lib/format';
import { cropLabel } from '@/lib/messages';
import { BROWSE_TEXT } from '@/lib/buyerMessages';
import { ProducePhoto } from './ProducePhoto';

/** @typedef {import('@/api/endpoints/buyerListings').PublicListing} PublicListing */

/**
 * One listing in the browse list. The whole card is a single link to the detail screen, named
 * with the crop, market, seller and price so a screen reader user hears one clear item. Only
 * the seller's name is shown: there is no contact detail in the API.
 * @param {{ listing: PublicListing }} props
 */
export function BuyerListingCard({ listing }) {
  const crop = cropLabel(listing.crop);
  const price = BROWSE_TEXT.perKg(formatKES(listing.price_per_unit));
  const seller = listing.seller_name?.trim() || '—';
  return (
    <Link
      to={`/buyer/listings/${encodeURIComponent(listing.id)}`}
      aria-label={`${crop} in ${listing.market}, ${price}, ${BROWSE_TEXT.soldBy(seller)}`}
      className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-text shadow-sm transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      data-listing-id={listing.id}
    >
      <ProducePhoto imageUrl={listing.image_url} alt={BROWSE_TEXT.photoAlt(crop.toLowerCase())} />
      <p className="text-lg font-semibold">
        {crop} <span className="font-normal text-text-secondary">in</span> {listing.market}
      </p>
      <p className="text-lg font-semibold tabular-nums">{price}</p>
      <p className="flex items-center gap-1.5 text-text-secondary">
        <Package aria-hidden="true" className="size-4 shrink-0" />
        <span>{BROWSE_TEXT.available(formatQuantity(listing.quantity_available))}</span>
      </p>
      <p className="flex items-center gap-1.5 break-words text-text-secondary">
        <User aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0">{BROWSE_TEXT.soldBy(seller)}</span>
      </p>
    </Link>
  );
}
