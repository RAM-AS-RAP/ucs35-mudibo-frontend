import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  PackageX,
  Search,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LISTING_STATUS_WORDS, ORDER_STATUS_WORDS, PAYMENT_STATUS_WORDS } from '@/lib/messages';

/**
 * @typedef {{ label: string, variant: 'positive' | 'negative' | 'neutral' | 'outline', Icon: import('react').ComponentType<any> }} StatusStyle
 */

/**
 * Order statuses (OrderStatus in openapi.json). Words from ORDER_STATUS_WORDS in lib/messages;
 * payments run in the M-Pesa sandbox, so "paid" says it was a test payment.
 * @type {Record<string, StatusStyle>}
 */
export const ORDER_STATUS = {
  pending_payment: { label: ORDER_STATUS_WORDS.pending_payment, variant: 'neutral', Icon: Clock },
  paid: { label: ORDER_STATUS_WORDS.paid, variant: 'positive', Icon: CheckCircle2 },
  payment_failed: { label: ORDER_STATUS_WORDS.payment_failed, variant: 'negative', Icon: XCircle },
  expired: { label: ORDER_STATUS_WORDS.expired, variant: 'neutral', Icon: Clock },
  cancelled: { label: ORDER_STATUS_WORDS.cancelled, variant: 'neutral', Icon: Ban },
  needs_reconciliation: {
    label: ORDER_STATUS_WORDS.needs_reconciliation,
    variant: 'outline',
    Icon: Search,
  },
};

/** Listing statuses (ListingStatus in openapi.json). @type {Record<string, StatusStyle>} */
export const LISTING_STATUS = {
  active: { label: LISTING_STATUS_WORDS.active, variant: 'positive', Icon: CheckCircle2 },
  sold_out: { label: LISTING_STATUS_WORDS.sold_out, variant: 'neutral', Icon: PackageX },
  removed: { label: LISTING_STATUS_WORDS.removed, variant: 'outline', Icon: Ban },
};

/**
 * Payment statuses (PaymentStatus in openapi.json), words from PAYMENT_STATUS_WORDS in
 * lib/messages (F3). The spinner icon does not spin here: motion is left to the panel.
 * @type {Record<string, StatusStyle>}
 */
export const PAYMENT_STATUS = {
  initiating: { label: PAYMENT_STATUS_WORDS.initiating, variant: 'neutral', Icon: Loader2 },
  initiated: { label: PAYMENT_STATUS_WORDS.initiated, variant: 'outline', Icon: Smartphone },
  completed: { label: PAYMENT_STATUS_WORDS.completed, variant: 'positive', Icon: CheckCircle2 },
  failed: { label: PAYMENT_STATUS_WORDS.failed, variant: 'negative', Icon: XCircle },
  cancelled: { label: PAYMENT_STATUS_WORDS.cancelled, variant: 'neutral', Icon: Ban },
  timeout: { label: PAYMENT_STATUS_WORDS.timeout, variant: 'negative', Icon: Clock },
};

/** @param {string} status */
function humanize(status) {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const TABLES = { order: ORDER_STATUS, payment: PAYMENT_STATUS, listing: LISTING_STATUS };

/**
 * Order, payment or listing status as a badge with an icon and a text label (never colour
 * alone). Unknown statuses still render readable text.
 * @param {{ status: string, kind?: 'order' | 'payment' | 'listing', className?: string }} props
 */
export function StatusBadge({ status, kind = 'order', className }) {
  const table = TABLES[kind] ?? ORDER_STATUS;
  const style = Object.prototype.hasOwnProperty.call(table, status)
    ? table[status]
    : {
        label: humanize(status || 'unknown'),
        variant: /** @type {const} */ ('outline'),
        Icon: AlertCircle,
      };
  const { Icon } = style;
  return (
    <Badge variant={style.variant} className={className} data-status={status}>
      <Icon aria-hidden="true" />
      <span>{style.label}</span>
    </Badge>
  );
}
