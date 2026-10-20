import { Link } from 'react-router';
import { Leaf, Pencil, ReceiptText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/display/StatusBadge';
import { formatKES, formatQuantity } from '@/lib/format';
import { cropLabel, LISTING_TEXT } from '@/lib/messages';
import { safeImageUrl } from '@/lib/safeImageUrl';

/** @typedef {import('@/api/endpoints/listings').Listing} Listing */

/**
 * The listing photo, or a leaf placeholder when there is none (or the URL is not safe).
 * @param {{ listing: Listing }} props
 */
function ListingPhoto({ listing }) {
  const src = safeImageUrl(listing.image_url);
  if (!src) {
    return (
      <div
        className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-neutral-bg"
        data-testid="listing-photo-placeholder"
      >
        <Leaf aria-hidden="true" className="size-10 text-primary" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={LISTING_TEXT.photoAlt(cropLabel(listing.crop).toLowerCase())}
      loading="lazy"
      decoding="async"
      className="aspect-[4/3] w-full rounded-lg bg-neutral-bg object-cover"
    />
  );
}

/**
 * One of the farmer's listings: photo, crop and market, quantity available now, asking price,
 * status, and the actions Edit and Remove (hidden for a removed listing) and View orders.
 * @param {{ listing: Listing, onRemove?: (listing: Listing, trigger: HTMLElement) => void }} props
 */
export function ListingCard({ listing, onRemove }) {
  const crop = cropLabel(listing.crop);
  const removed = listing.status === 'removed';
  const headingId = `listing-${listing.id}-title`;
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-listing-id={listing.id}
    >
      <ListingPhoto listing={listing} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold text-text">
          {crop} <span className="font-normal text-text-secondary">in</span> {listing.market}
        </h2>
        <StatusBadge kind="listing" status={listing.status} />
      </div>
      <p className="text-text">
        {LISTING_TEXT.available(formatQuantity(listing.quantity_available))}
      </p>
      <p className="text-lg font-semibold text-text tabular-nums">
        {LISTING_TEXT.perKg(formatKES(listing.price_per_unit))}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        {!removed && (
          <Button asChild variant="outline">
            <Link to={`/farmer/listings/${listing.id}/edit`}>
              <Pencil aria-hidden="true" />
              <span>{LISTING_TEXT.edit}</span>
              <span className="sr-only">{` ${crop} in ${listing.market}`}</span>
            </Link>
          </Button>
        )}
        {!removed && onRemove && (
          <Button
            type="button"
            variant="outline"
            onClick={(event) => onRemove(listing, event.currentTarget)}
          >
            <Trash2 aria-hidden="true" />
            <span>{LISTING_TEXT.remove}</span>
            <span className="sr-only">{` ${crop} in ${listing.market}`}</span>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link to={`/farmer/orders?listing=${encodeURIComponent(listing.id)}`}>
            <ReceiptText aria-hidden="true" />
            <span>{LISTING_TEXT.viewOrders}</span>
            <span className="sr-only">{` for ${crop} in ${listing.market}`}</span>
          </Link>
        </Button>
      </div>
    </article>
  );
}
