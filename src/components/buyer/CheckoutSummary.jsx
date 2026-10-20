import { Clock, Info } from 'lucide-react';
import { formatKES, formatKESWhole, formatQuantity } from '@/lib/format';
import { cropLabel } from '@/lib/messages';
import { CHECKOUT_TEXT } from '@/lib/buyerMessages';

/**
 * The summary before checkout: the listing, the quantity, the price per kg and the estimated
 * total. The estimate is labelled as one: the server computes the charged total at checkout.
 * @param {{
 *   listing: { crop: string, market: string, seller_name: string, price_per_unit: number },
 *   quantity: string | null,
 *   estimate: number | null,
 * }} props  quantity: a valid normalised decimal, or null
 */
export function CheckoutSummary({ listing, quantity, estimate }) {
  return (
    <section
      aria-labelledby="checkout-summary-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 id="checkout-summary-title" className="text-lg font-semibold text-text">
        {CHECKOUT_TEXT.title}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-secondary">{CHECKOUT_TEXT.listing}</dt>
        <dd className="break-words text-text">
          {cropLabel(listing.crop)} in {listing.market}
        </dd>
        <dt className="text-text-secondary">{CHECKOUT_TEXT.quantity}</dt>
        <dd className="text-text tabular-nums">
          {quantity === null ? '—' : `${formatQuantity(quantity)} kg`}
        </dd>
        <dt className="text-text-secondary">{CHECKOUT_TEXT.pricePerKg}</dt>
        <dd className="text-text tabular-nums">{formatKES(listing.price_per_unit)}</dd>
        <dt className="text-text-secondary">{CHECKOUT_TEXT.estimate}</dt>
        <dd className="text-lg font-semibold text-text tabular-nums" data-testid="estimate">
          {estimate === null ? CHECKOUT_TEXT.noEstimate : formatKESWhole(estimate)}
        </dd>
      </dl>
      <p className="flex items-start gap-2 text-sm text-text-secondary">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{CHECKOUT_TEXT.estimateNote}</span>
      </p>
      <p className="flex items-start gap-2 text-sm text-text-secondary">
        <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{CHECKOUT_TEXT.hold}</span>
      </p>
    </section>
  );
}
