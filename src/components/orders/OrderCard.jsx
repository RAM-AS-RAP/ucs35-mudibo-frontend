import { CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/display/StatusBadge';
import { formatDateTime, formatKES, formatQuantity } from '@/lib/format';
import { cropLabel, ORDER_TEXT } from '@/lib/messages';

/** @typedef {import('@/api/endpoints/farmerOrders').FarmerOrder} FarmerOrder */

/**
 * The payment line under an order, with an icon and words.
 * @param {{ order: FarmerOrder }} props
 */
function PaymentLine({ order }) {
  if (order.status === 'paid') {
    const receipt =
      typeof order.mpesa_receipt_number === 'string' && order.mpesa_receipt_number.trim()
        ? order.mpesa_receipt_number.trim()
        : null;
    return (
      <p className="flex items-start gap-1.5 text-sm text-positive-text">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-positive" />
        <span>{receipt ? ORDER_TEXT.paidWithReceipt(receipt) : ORDER_TEXT.paidNoReceipt}</span>
      </p>
    );
  }
  if (order.status === 'pending_payment') {
    return (
      <p className="flex items-start gap-1.5 text-sm text-text-secondary">
        <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{ORDER_TEXT.waiting}</span>
      </p>
    );
  }
  if (order.status === 'needs_reconciliation') {
    return (
      <p className="flex items-start gap-1.5 text-sm text-text-secondary">
        <Search aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{ORDER_TEXT.review}</span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-sm text-text-secondary">
      <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{ORDER_TEXT.notPaid}</span>
    </p>
  );
}

/**
 * An order on one of the farmer's listings. The total is the server's `total_amount`, formatted
 * and never recomputed. Only the buyer's name is shown; there is no buyer contact detail.
 * Times are shown in Nairobi time.
 * @param {{ order: FarmerOrder }} props
 */
export function OrderCard({ order }) {
  const headingId = `order-${order.order_id}-title`;
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-order-id={order.order_id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 id={headingId} className="text-lg font-semibold text-text">
            {cropLabel(order.crop)} <span className="font-normal text-text-secondary">in</span>{' '}
            {order.market}
          </h2>
          <p className="font-mono text-sm break-all text-text-secondary">{order.reference}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-text">
        {ORDER_TEXT.quantityLine(formatQuantity(order.quantity), formatKES(order.unit_price))}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-text-secondary">{ORDER_TEXT.total}</dt>
        <dd className="text-base font-semibold text-text tabular-nums" data-testid="order-total">
          {formatKES(order.total_amount)}
        </dd>
        <dt className="text-text-secondary">{ORDER_TEXT.buyer}</dt>
        <dd className="break-words text-text">{order.buyer_name || '—'}</dd>
        <dt className="text-text-secondary">{ORDER_TEXT.ordered}</dt>
        <dd className="text-text">{formatDateTime(order.created_at)}</dd>
        {order.status === 'paid' && order.payment_completed_at && (
          <>
            <dt className="text-text-secondary">{ORDER_TEXT.paidAt}</dt>
            <dd className="text-text">{formatDateTime(order.payment_completed_at)}</dd>
          </>
        )}
      </dl>
      <PaymentLine order={order} />
    </article>
  );
}
