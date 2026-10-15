import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * @typedef {{ label: string, variant: 'positive' | 'negative' | 'neutral' | 'outline', Icon: import('react').ComponentType<any> }} StatusStyle
 */

/** Order statuses (OrderStatus in openapi.json). @type {Record<string, StatusStyle>} */
export const ORDER_STATUS = {
  pending_payment: { label: 'Awaiting payment', variant: 'neutral', Icon: Clock },
  paid: { label: 'Paid', variant: 'positive', Icon: CheckCircle2 },
  payment_failed: { label: 'Payment failed', variant: 'negative', Icon: XCircle },
  expired: { label: 'Expired', variant: 'neutral', Icon: Clock },
  cancelled: { label: 'Cancelled', variant: 'neutral', Icon: XCircle },
  needs_reconciliation: { label: 'Under review', variant: 'outline', Icon: Search },
};

/** Payment statuses (PaymentStatus in openapi.json). @type {Record<string, StatusStyle>} */
export const PAYMENT_STATUS = {
  initiating: { label: 'Sending request', variant: 'neutral', Icon: Loader2 },
  initiated: { label: 'Check your phone', variant: 'outline', Icon: Smartphone },
  completed: { label: 'Payment received', variant: 'positive', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', variant: 'neutral', Icon: XCircle },
  timeout: { label: 'Timed out', variant: 'negative', Icon: Clock },
  failed: { label: 'Failed', variant: 'negative', Icon: XCircle },
};

/** @param {string} status */
function humanize(status) {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Order or payment status as a badge with an icon and a text label (never colour alone).
 * Unknown statuses still render readable text.
 * @param {{ status: string, kind?: 'order' | 'payment', className?: string }} props
 */
export function StatusBadge({ status, kind = 'order', className }) {
  const table = kind === 'payment' ? PAYMENT_STATUS : ORDER_STATUS;
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
