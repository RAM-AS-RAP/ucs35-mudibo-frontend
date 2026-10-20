import { Link } from 'react-router';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/display/StatusBadge';
import { formatDateTime, formatKES, formatQuantity } from '@/lib/format';
import { cropLabel } from '@/lib/messages';
import { ORDER_SCREEN_TEXT } from '@/lib/buyerMessages';
import { ProducePhoto } from './ProducePhoto';

/** @typedef {import('@/api/endpoints/orders').Order} Order */

/**
 * Copy the order reference to the clipboard, with a toast either way.
 * @param {string} reference
 */
async function copyReference(reference) {
  try {
    await navigator.clipboard.writeText(reference);
    toast.success(ORDER_SCREEN_TEXT.copied);
  } catch {
    toast.error(ORDER_SCREEN_TEXT.copyFailed);
  }
}

/**
 * An order: reference (with a copy button), status, the listing (thumbnail, crop, market,
 * seller), quantity, unit price, the server's `total_amount` formatted and never recomputed,
 * and the order time in Nairobi time. With `to`, the heading links to the order screen.
 * @param {{
 *   order: Order,
 *   headingLevel?: 2 | 3,
 *   to?: string,
 *   children?: import('react').ReactNode,
 * }} props  children: actions under the details
 */
export function OrderSummaryCard({ order, headingLevel = 2, to, children }) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const headingId = `order-${order.id}-title`;
  const crop = cropLabel(order.listing?.crop ?? '');
  const market = order.listing?.market ?? '';
  const seller = order.listing?.seller_name?.trim() || '—';
  const title = (
    <>
      {crop} <span className="font-normal text-text-secondary">in</span> {market}
    </>
  );
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-order-id={order.id}
    >
      <div className="flex items-start gap-3">
        <ProducePhoto
          imageUrl={order.listing?.image_url}
          alt={ORDER_SCREEN_TEXT.photoAlt(crop.toLowerCase())}
          className="w-20 shrink-0 sm:w-24"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Heading id={headingId} className="text-lg font-semibold text-text">
            {to ? (
              <Link
                to={to}
                className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>{title}</span>
              </Link>
            ) : (
              title
            )}
          </Heading>
          <p className="break-words text-sm text-text-secondary">
            {ORDER_SCREEN_TEXT.soldBy(seller)}
          </p>
          <StatusBadge status={order.status} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-secondary">{ORDER_SCREEN_TEXT.reference}</span>
        <span className="font-mono break-all text-text" data-testid="order-reference">
          {order.reference}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`${ORDER_SCREEN_TEXT.copy} ${order.reference}`}
          onClick={() => copyReference(order.reference)}
        >
          <Copy aria-hidden="true" />
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-text-secondary">{ORDER_SCREEN_TEXT.quantity}</dt>
        <dd className="text-text tabular-nums">{formatQuantity(order.quantity)} kg</dd>
        <dt className="text-text-secondary">{ORDER_SCREEN_TEXT.unitPrice}</dt>
        <dd className="text-text tabular-nums">{formatKES(order.unit_price)}</dd>
        <dt className="text-text-secondary">{ORDER_SCREEN_TEXT.total}</dt>
        <dd className="text-base font-semibold text-text tabular-nums" data-testid="order-total">
          {formatKES(order.total_amount)}
        </dd>
        <dt className="text-text-secondary">{ORDER_SCREEN_TEXT.ordered}</dt>
        <dd className="text-text">{formatDateTime(order.created_at)}</dd>
      </dl>
      {children}
    </article>
  );
}
