import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountdownButton } from '@/components/auth/CountdownButton';
import { StatusBadge } from '@/components/display/StatusBadge';
import { PhoneField } from '@/components/buyer/PhoneField';
import { formatKES } from '@/lib/format';
import { targetDiffers } from '@/lib/paymentView';
import { ORDER_SCREEN_TEXT } from '@/lib/buyerMessages';
import { cn } from '@/lib/utils';

/** @typedef {import('@/api/endpoints/orders').Order} Order */
/** @typedef {import('@/lib/orderView').OrderView} OrderView */
/** @typedef {import('@/lib/orderView').OrderViewKind} OrderViewKind */

/**
 * Icon and tone of each panel kind. The tone only adds a border colour; the icon and the
 * headline always carry the meaning (never colour alone).
 * @type {Record<OrderViewKind, { Icon: import('react').ComponentType<any>, tone: 'positive' | 'negative' | 'neutral', spin?: boolean }>}
 */
const KIND_STYLE = {
  pay_ready: { Icon: Smartphone, tone: 'neutral' },
  too_close: { Icon: Clock, tone: 'negative' },
  max_attempts: { Icon: Ban, tone: 'negative' },
  awaiting_phone: { Icon: Loader2, tone: 'neutral', spin: true },
  payment_cancelled: { Icon: XCircle, tone: 'neutral' },
  payment_failed: { Icon: AlertTriangle, tone: 'negative' },
  payment_timeout: { Icon: Clock, tone: 'negative' },
  paid: { Icon: CheckCircle2, tone: 'positive' },
  expired: { Icon: Clock, tone: 'neutral' },
  cancelled: { Icon: Ban, tone: 'neutral' },
  under_review: { Icon: Search, tone: 'neutral' },
  closed_other: { Icon: Info, tone: 'neutral' },
};

/** Kinds that offer the Pay button (enabled only when the server's can_pay is true). */
const PAY_KINDS = new Set([
  'pay_ready',
  'too_close',
  'max_attempts',
  'payment_cancelled',
  'payment_failed',
  'payment_timeout',
]);
const RETRY_KINDS = new Set(['payment_cancelled', 'payment_failed', 'payment_timeout']);

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * The payment panel of the order screen: for each kind from deriveOrderView an icon, a headline
 * and body text, the allowed buttons, and an aria-live="polite" status region for messages.
 * Focus moves to the headline when the kind changes (not on the first render).
 * While Pay is possible (the server's can_pay) the M-Pesa number field sits above the button;
 * `pay.phone` carries its value from the screen's state. `pay.blocked` disables Pay during a
 * long wait (minutes or hours); short waits count down on the button (`pay.waitSeconds`).
 * @param {{
 *   view: OrderView,
 *   order: Order,
 *   pollWindowOver?: boolean,
 *   message?: string | null,
 *   pay: {
 *     onPay: () => void,
 *     pending: boolean,
 *     waitSeconds: number,
 *     blocked?: boolean,
 *     uncertain: boolean,
 *     phone?: {
 *       value: string,
 *       onChange: (value: string) => void,
 *       error?: string | null,
 *       disabled?: boolean,
 *       inputRef?: import('react').Ref<HTMLInputElement>,
 *     },
 *   },
 *   onCancel: (trigger: HTMLElement) => void,
 *   onCheckAgain: () => void,
 *   checking?: boolean,
 * }} props
 */
export function PaymentStatusPanel({
  view,
  order,
  pollWindowOver = false,
  message,
  pay,
  onCancel,
  onCheckAgain,
  checking = false,
}) {
  const headingRef = useRef(/** @type {HTMLHeadingElement | null} */ (null));
  const shownKind = useRef(view.kind);

  useEffect(() => {
    if (shownKind.current === view.kind) return;
    shownKind.current = view.kind;
    headingRef.current?.focus();
  }, [view.kind]);

  const { Icon, tone, spin } = KIND_STYLE[view.kind];
  const payment = order.payment;
  const statusMessage = text(payment?.status_message);
  const listingId = order.listing?.id;

  let body = null;
  switch (view.kind) {
    case 'pay_ready':
      body = <p>{view.canPay ? ORDER_SCREEN_TEXT.readyText : ORDER_SCREEN_TEXT.notPayableNow}</p>;
      break;
    case 'too_close':
      body = <p>{ORDER_SCREEN_TEXT.tooCloseText}</p>;
      break;
    case 'max_attempts':
      body = <p>{ORDER_SCREEN_TEXT.maxAttemptsText}</p>;
      break;
    case 'awaiting_phone': {
      const masked = text(payment?.stk_target_masked);
      const entered = text(payment?.phone_masked);
      body = (
        <>
          {masked && <p className="font-medium">{ORDER_SCREEN_TEXT.promptSent(masked)}</p>}
          {entered && targetDiffers(payment) && (
            <p className="flex items-start gap-2" data-testid="test-target-note">
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>{ORDER_SCREEN_TEXT.testTarget(entered)}</span>
            </p>
          )}
          {statusMessage && <p>{statusMessage}</p>}
          <p className="text-sm text-text-secondary">{ORDER_SCREEN_TEXT.promptTip}</p>
          {pollWindowOver && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-neutral-bg p-3 text-neutral-text">
              <p className="flex items-start gap-2">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <span>{ORDER_SCREEN_TEXT.noResult}</span>
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-fit"
                disabled={checking}
                onClick={onCheckAgain}
              >
                <RefreshCw aria-hidden="true" className={checking ? 'animate-spin' : undefined} />
                {ORDER_SCREEN_TEXT.checkAgain}
              </Button>
            </div>
          )}
        </>
      );
      break;
    }
    case 'payment_cancelled':
      body = <p>{ORDER_SCREEN_TEXT.cancelledPayment}</p>;
      break;
    case 'payment_failed':
      body = (
        <>
          <p>{statusMessage ?? ORDER_SCREEN_TEXT.failedFallback}</p>
          {view.showReason && (
            <p data-testid="payment-reason">
              {ORDER_SCREEN_TEXT.reason(/** @type {string} */ (text(payment?.result_desc)))}
            </p>
          )}
        </>
      );
      break;
    case 'payment_timeout':
      body = <p>{statusMessage ?? ORDER_SCREEN_TEXT.timeoutFallback}</p>;
      break;
    case 'paid': {
      const receipt = text(payment?.mpesa_receipt_number);
      body = (
        <>
          {receipt && <p className="font-medium">{ORDER_SCREEN_TEXT.receipt(receipt)}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-text-secondary">{ORDER_SCREEN_TEXT.total}</dt>
            <dd className="font-semibold tabular-nums" data-testid="paid-total">
              {formatKES(order.total_amount)}
            </dd>
            <dt className="text-text-secondary">{ORDER_SCREEN_TEXT.reference}</dt>
            <dd className="font-mono break-all">{order.reference}</dd>
          </dl>
          <p>{ORDER_SCREEN_TEXT.paidText}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/buyer/browse">{ORDER_SCREEN_TEXT.browse}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/buyer/orders">{ORDER_SCREEN_TEXT.myOrders}</Link>
            </Button>
          </div>
        </>
      );
      break;
    }
    case 'expired':
      body = (
        <>
          <p>{ORDER_SCREEN_TEXT.expiredText}</p>
          <div className="flex flex-wrap gap-2">
            {listingId && (
              <Button asChild>
                <Link to={`/buyer/listings/${encodeURIComponent(listingId)}`}>
                  {ORDER_SCREEN_TEXT.orderAgain}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/buyer/browse">{ORDER_SCREEN_TEXT.browse}</Link>
            </Button>
          </div>
        </>
      );
      break;
    case 'cancelled':
      body = (
        <>
          <p>{ORDER_SCREEN_TEXT.cancelledText}</p>
          <Button asChild className="w-full sm:w-fit">
            <Link to="/buyer/browse">{ORDER_SCREEN_TEXT.browse}</Link>
          </Button>
        </>
      );
      break;
    case 'under_review':
      body = <p>{ORDER_SCREEN_TEXT.reviewText(order.reference)}</p>;
      break;
    default:
      body = (
        <>
          <p>{ORDER_SCREEN_TEXT.closedText}</p>
          <Button asChild className="w-full sm:w-fit">
            <Link to="/buyer/browse">{ORDER_SCREEN_TEXT.browse}</Link>
          </Button>
        </>
      );
  }

  let payLabel = ORDER_SCREEN_TEXT.pay;
  if (pay.uncertain) payLabel = ORDER_SCREEN_TEXT.checkPayment;
  else if (RETRY_KINDS.has(view.kind)) payLabel = ORDER_SCREEN_TEXT.tryAgain;

  // The number field only while the server allows a payment (no prompt is open then).
  const showPhone = PAY_KINDS.has(view.kind) && view.canPay;

  return (
    <section
      aria-labelledby="payment-panel-title"
      className={cn(
        'flex flex-col gap-4 rounded-xl border bg-card p-4 text-text',
        tone === 'positive' && 'border-positive',
        tone === 'negative' && 'border-negative',
        tone === 'neutral' && 'border-border',
      )}
      data-kind={view.kind}
      data-testid="payment-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2
          id="payment-panel-title"
          ref={headingRef}
          tabIndex={-1}
          className="flex items-start gap-2 text-lg font-semibold outline-none"
        >
          <Icon
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-6 shrink-0',
              spin && 'motion-safe:animate-spin',
              tone === 'positive' && 'text-positive',
              tone === 'negative' && 'text-negative',
              tone === 'neutral' && 'text-primary',
            )}
            data-testid="panel-icon"
            data-icon={view.kind}
          />
          <span>{view.headline}</span>
        </h2>
        {payment && order.status === 'pending_payment' && (
          <StatusBadge kind="payment" status={payment.status} />
        )}
      </div>

      <div className="flex flex-col gap-3">{body}</div>

      <p role="status" aria-live="polite" className="empty:hidden" data-testid="payment-message">
        {message ?? ''}
      </p>

      {(PAY_KINDS.has(view.kind) || view.canCancel) && (
        <div className="flex flex-col gap-3">
          {PAY_KINDS.has(view.kind) && (
            <div className="flex flex-col gap-3">
              {showPhone && pay.phone && (
                <>
                  {RETRY_KINDS.has(view.kind) && <p>{ORDER_SCREEN_TEXT.phoneAgain}</p>}
                  <PhoneField
                    value={pay.phone.value}
                    onChange={pay.phone.onChange}
                    error={pay.phone.error}
                    disabled={pay.phone.disabled}
                    inputRef={pay.phone.inputRef}
                  />
                </>
              )}
              <div className="flex flex-col gap-1.5">
                <CountdownButton
                  type="button"
                  size="lg"
                  className="w-full sm:w-fit"
                  remaining={pay.waitSeconds}
                  pending={pay.pending}
                  pendingLabel={ORDER_SCREEN_TEXT.sending}
                  announceStart={false}
                  disabled={!view.canPay || pay.blocked}
                  aria-describedby={showPhone ? 'pay-hint' : undefined}
                  onClick={pay.onPay}
                  data-testid="pay-button"
                >
                  <Smartphone aria-hidden="true" />
                  {payLabel}
                </CountdownButton>
                {showPhone && (
                  <p id="pay-hint" className="text-sm text-text-secondary">
                    {ORDER_SCREEN_TEXT.payHint}
                  </p>
                )}
              </div>
            </div>
          )}
          {view.canCancel && (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-fit"
              disabled={pay.pending}
              onClick={(event) => onCancel(event.currentTarget)}
            >
              <Ban aria-hidden="true" />
              {ORDER_SCREEN_TEXT.cancel}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
