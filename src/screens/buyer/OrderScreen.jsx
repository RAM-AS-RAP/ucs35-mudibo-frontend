import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { SearchX } from 'lucide-react';
import { useCancelOrder, useOrder, usePayOrder } from '@/api/queries';
import { ApiError, getUserMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { DEFAULT_RETRY_SECONDS } from '@/components/auth/useServerProblem';
import { PageHeader } from '@/components/display/PageHeader';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CountdownAnnouncement, ExpiryCountdown } from '@/components/buyer/ExpiryCountdown';
import { OrderSummaryCard } from '@/components/buyer/OrderSummaryCard';
import { PaymentStatusPanel } from '@/components/buyer/PaymentStatusPanel';
import { SandboxNote } from '@/components/buyer/SandboxNote';
import { isUuid } from '@/lib/filterParams';
import { newIdempotencyKey } from '@/lib/idempotency';
import { deriveOrderView } from '@/lib/orderView';
import { isDefinitivePayError, mapPayError } from '@/lib/payErrors';
import { ORDER_SCREEN_TEXT } from '@/lib/buyerMessages';
import { useCountdown } from '@/lib/useCountdown';
import { usePageTitle } from '@/lib/usePageTitle';

/** Panel kinds where an earlier pay or cancel message no longer applies (the order is closed). */
const FINAL_KINDS = new Set(['paid', 'expired', 'cancelled', 'under_review', 'closed_other']);

/** The "could not be found" state, with a link to My orders. */
function OrderNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title={ORDER_SCREEN_TEXT.notFound}
      action={
        <Button asChild>
          <Link to="/buyer/orders">{ORDER_SCREEN_TEXT.myOrders}</Link>
        </Button>
      }
    />
  );
}

/**
 * One order and its payment (/buyer/orders/:orderId).
 *
 * Pay: one Idempotency-Key per deliberate attempt, held in a ref only. After a network failure
 * or a timeout the key is kept and the button reads "Check payment request" (the server replays
 * its first answer and sends no second prompt); after any answer from the server (202 or an
 * error with a status) the key is discarded and the next click makes a new one. Pay and Cancel
 * are enabled only when the server's can_pay and can_cancel are true.
 * While the prompt is open the order is polled every 3 seconds for up to 150 seconds (useOrder).
 */
export default function OrderScreen() {
  const headingRef = usePageTitle(ORDER_SCREEN_TEXT.title);
  const { orderId = '' } = useParams();
  const validId = isUuid(orderId);
  const order = useOrder(validId ? orderId : '', { pollWhileWaiting: true });
  const keyRef = useRef(/** @type {string | null} */ (null));
  const pay = usePayOrder(orderId, keyRef);
  const cancel = useCancelOrder();
  const wait = useCountdown();
  const [sameKey, setSameKey] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [promptTarget, setPromptTarget] = useState(/** @type {string | null} */ (null));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState(/** @type {unknown} */ (null));
  const [countdownNews, setCountdownNews] = useState('');
  const cancelTrigger = useRef(/** @type {HTMLElement | null} */ (null));
  const paying = useRef(false);
  const { refetch, restartPollWindow } = order;

  // Warn before leaving the page only while a pay request is in flight.
  const payPending = pay.isPending;
  useEffect(() => {
    if (!payPending) return undefined;
    /** @param {BeforeUnloadEvent} event */
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [payPending]);

  const startPayment = useCallback(() => {
    if (paying.current) return;
    paying.current = true;
    // A new key for a deliberate attempt; the same key again after an unknown result.
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setMessage(null);
    pay.mutate(undefined, {
      onSuccess: (result) => {
        keyRef.current = null;
        setSameKey(false);
        setPromptTarget(typeof result.prompt === 'string' ? result.prompt : null);
        setMessage(typeof result.message === 'string' ? result.message : null);
        restartPollWindow();
      },
      onError: (error) => {
        if (isDefinitivePayError(error)) {
          keyRef.current = null;
          setSameKey(false);
        } else {
          setSameKey(true);
        }
        const mapped = mapPayError(error);
        setMessage(mapped.message);
        if (mapped.action === 'refetch') {
          restartPollWindow();
          void refetch();
        } else if (mapped.action === 'wait' && error instanceof ApiError) {
          const seconds =
            error.retryAfter && error.retryAfter > 0
              ? error.retryAfter
              : error.status === 429
                ? DEFAULT_RETRY_SECONDS
                : 0;
          if (seconds > 0) wait.start(seconds);
        }
      },
      onSettled: () => {
        paying.current = false;
      },
    });
  }, [pay, refetch, restartPollWindow, wait]);

  const checkAgain = useCallback(() => {
    restartPollWindow();
    void refetch();
  }, [refetch, restartPollWindow]);

  const confirmCancel = useCallback(() => {
    setCancelError(null);
    cancel.mutate(orderId, {
      onSuccess: () => {
        setCancelOpen(false);
        setMessage(null);
        toast.success(ORDER_SCREEN_TEXT.cancelled);
      },
      onError: (error) => {
        const code = error instanceof ApiError ? error.code : '';
        if (code === 'payment_in_progress' || code === 'order_not_cancellable') {
          setCancelOpen(false);
          setMessage(
            code === 'payment_in_progress'
              ? ORDER_SCREEN_TEXT.cancelBlocked
              : ORDER_SCREEN_TEXT.notCancellable,
          );
          restartPollWindow();
          void refetch();
        } else {
          setCancelError(error);
        }
      },
    });
  }, [cancel, orderId, refetch, restartPollWindow]);

  const notFound =
    !validId ||
    (order.isError &&
      order.error instanceof ApiError &&
      (order.error.status === 404 || order.error.status === 422));

  let body;
  if (notFound) {
    body = <OrderNotFound />;
  } else if (order.isPending) {
    body = <LoadingState label={ORDER_SCREEN_TEXT.loading} rows={3} />;
  } else if (order.isError && !order.data) {
    body = (
      <ErrorState
        error={order.error}
        title={ORDER_SCREEN_TEXT.errorTitle}
        onRetry={() => refetch()}
      />
    );
  } else {
    const data = order.data;
    // The time left when the response arrived, on the server's clock; the countdown ticks live.
    const view = deriveOrderView(data, { nowMs: order.dataUpdatedAt, offsetMs: order.offsetMs });
    const showCountdown = data.status === 'pending_payment' && !data.is_expired;
    const shownOrder =
      promptTarget && data.payment && !data.payment.stk_target_masked
        ? { ...data, payment: { ...data.payment, stk_target_masked: promptTarget } }
        : data;
    body = (
      <div className="flex flex-col gap-4">
        <OrderSummaryCard order={data} />
        {showCountdown && (
          <ExpiryCountdown
            key={data.expires_at}
            expiresAt={data.expires_at}
            offsetMs={order.offsetMs}
            onExpired={() => void refetch()}
            onAnnounce={setCountdownNews}
          />
        )}
        <PaymentStatusPanel
          view={view}
          order={shownOrder}
          pollWindowOver={order.pollWindowOver}
          message={FINAL_KINDS.has(view.kind) ? null : message}
          pay={{
            onPay: startPayment,
            pending: pay.isPending,
            waitSeconds: wait.remaining,
            sameKey,
          }}
          onCancel={(trigger) => {
            cancelTrigger.current = trigger;
            setCancelError(null);
            setCancelOpen(true);
          }}
          onCheckAgain={checkAgain}
          checking={order.isFetching}
        />
        <SandboxNote note={data.note} />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={ORDER_SCREEN_TEXT.title} headingRef={headingRef} />
      {body}
      <CountdownAnnouncement text={countdownNews} />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={ORDER_SCREEN_TEXT.cancelTitle}
        description={ORDER_SCREEN_TEXT.cancelText}
        confirmLabel={ORDER_SCREEN_TEXT.cancelConfirm}
        cancelLabel={ORDER_SCREEN_TEXT.cancelKeep}
        pending={cancel.isPending}
        pendingLabel={ORDER_SCREEN_TEXT.cancelling}
        destructive
        onConfirm={confirmCancel}
        returnFocus={() =>
          cancelTrigger.current?.isConnected
            ? cancelTrigger.current
            : document.getElementById('payment-panel-title')
        }
      >
        {cancelError !== null && (
          <p role="alert" className="text-sm text-negative-text">
            {getUserMessage(cancelError)}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
