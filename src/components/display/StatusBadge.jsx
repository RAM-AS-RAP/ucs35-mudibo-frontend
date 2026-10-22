import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  MailCheck,
  PackageX,
  Search,
  Smartphone,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ADMIN_ORDER_STATUS_WORDS,
  ADMIN_PAYMENT_STATUS_WORDS,
  INVITE_STATUS_WORDS,
  LISTING_STATUS_WORDS,
  ORDER_STATUS_WORDS,
  PAYMENT_STATUS_WORDS,
  USER_STATUS_WORDS,
} from '@/lib/messages';

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

/*
 * Administrator tables (F4): the same icons, with the administrator's words.
 */

/** @type {Record<string, StatusStyle>} */
export const ADMIN_ORDER_STATUS = {
  pending_payment: {
    ...ORDER_STATUS.pending_payment,
    label: ADMIN_ORDER_STATUS_WORDS.pending_payment,
  },
  paid: { ...ORDER_STATUS.paid, label: ADMIN_ORDER_STATUS_WORDS.paid },
  payment_failed: {
    ...ORDER_STATUS.payment_failed,
    label: ADMIN_ORDER_STATUS_WORDS.payment_failed,
  },
  expired: { ...ORDER_STATUS.expired, label: ADMIN_ORDER_STATUS_WORDS.expired },
  cancelled: { ...ORDER_STATUS.cancelled, label: ADMIN_ORDER_STATUS_WORDS.cancelled },
  needs_reconciliation: {
    label: ADMIN_ORDER_STATUS_WORDS.needs_reconciliation,
    variant: 'negative',
    Icon: AlertTriangle,
  },
};

/** @type {Record<string, StatusStyle>} */
export const ADMIN_PAYMENT_STATUS = {
  initiating: { ...PAYMENT_STATUS.initiating, label: ADMIN_PAYMENT_STATUS_WORDS.initiating },
  initiated: { ...PAYMENT_STATUS.initiated, label: ADMIN_PAYMENT_STATUS_WORDS.initiated },
  completed: { ...PAYMENT_STATUS.completed, label: ADMIN_PAYMENT_STATUS_WORDS.completed },
  failed: { ...PAYMENT_STATUS.failed, label: ADMIN_PAYMENT_STATUS_WORDS.failed },
  cancelled: { ...PAYMENT_STATUS.cancelled, label: ADMIN_PAYMENT_STATUS_WORDS.cancelled },
  timeout: { ...PAYMENT_STATUS.timeout, label: ADMIN_PAYMENT_STATUS_WORDS.timeout },
};

/** Invitation statuses (InviteStatus). @type {Record<string, StatusStyle>} */
export const INVITE_STATUS = {
  pending: { label: INVITE_STATUS_WORDS.pending, variant: 'outline', Icon: Clock },
  used: { label: INVITE_STATUS_WORDS.used, variant: 'positive', Icon: MailCheck },
  expired: { label: INVITE_STATUS_WORDS.expired, variant: 'neutral', Icon: Clock },
  revoked: { label: INVITE_STATUS_WORDS.revoked, variant: 'neutral', Icon: Ban },
  locked: { label: INVITE_STATUS_WORDS.locked, variant: 'negative', Icon: Lock },
};

/** Account states (`is_disabled`). @type {Record<string, StatusStyle>} */
export const USER_STATUS = {
  active: { label: USER_STATUS_WORDS.active, variant: 'positive', Icon: UserCheck },
  disabled: { label: USER_STATUS_WORDS.disabled, variant: 'negative', Icon: UserX },
};

/** @param {string} status */
function humanize(status) {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const TABLES = {
  order: ORDER_STATUS,
  payment: PAYMENT_STATUS,
  listing: LISTING_STATUS,
  adminOrder: ADMIN_ORDER_STATUS,
  adminPayment: ADMIN_PAYMENT_STATUS,
  invite: INVITE_STATUS,
  user: USER_STATUS,
};

/**
 * A status as a badge with an icon and a text label (never colour alone), for orders, payments,
 * listings, invitations and accounts. Unknown statuses still render readable text.
 * @param {{ status: string, kind?: keyof typeof TABLES, className?: string }} props
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
