import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { SearchX } from 'lucide-react';
import { useCancelOrder, useOrder, usePayOrder } from '@/api/queries';
import { ApiError, getUserMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/display/PageHeader';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmPhoneDialog } from '@/components/buyer/ConfirmPhoneDialog';
import { CountdownAnnouncement, ExpiryCountdown } from '@/components/buyer/ExpiryCountdown';
import { OrderSummaryCard } from '@/components/buyer/OrderSummaryCard';
import { PaymentStatusPanel } from '@/components/buyer/PaymentStatusPanel';
import { SandboxNote } from '@/components/buyer/SandboxNote';
import { isUuid } from '@/lib/filterParams';
import { deriveOrderView } from '@/lib/orderView';
import { isDefinitivePayError, mapPayError } from '@/lib/payErrors';
import { createPayKey } from '@/lib/payKey';
import { phoneFieldError } from '@/lib/phone';
import { COUNTDOWN_MAX_SECONDS } from '@/lib/waitTime';
import { ORDER_SCREEN_TEXT } from '@/lib/buyerMessages';
import { useCountdown } from '@/lib/useCountdown';
import { usePageTitle } from '@/lib/usePageTitle';
import { useWaitUntil } from '@/lib/useWaitUntil';

/** @typedef {'field' | 'heading' | 'button'} FocusTarget */

/**
 * The element for a focus target: the number field, the panel headline, or the pay button
 * (the headline when the field or the button is gone or disabled).
 * @param {FocusTarget} target
 * @param {HTMLInputElement | null} field
 * @returns {HTMLElement | null}
 */
function focusElement(target, field) {
  const heading = document.getElementById('payment-panel-title');
  if (target === 'field' && field?.isConnected && !field.disabled) return field;
  if (target === 'button') {
    const button = /** @type {HTMLButtonElement | null} */ (
      document.querySelector('[data-testid="pay-button"]')
    );
    if (button && !button.disabled) return button;
  }
  return heading;
}

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
 * Pay: the buyer types the M-Pesa number (never prefilled or stored), "Pay with M-Pesa" checks
 * it and opens "Send the payment prompt?", and only "Send prompt" sends the request. The number
 * lives in this component's state only and is gone when the screen unmounts (also on logout).
 * One Idempotency-Key per deliberate attempt and number (lib/payKey.js, held in a ref with the
 * number, never in the mutation's variables). After a network failure or a timeout the key and
 * the number are kept, the field is disabled and the button reads "Check payment request" (the
 * server replays its first answer and sends no second prompt); after any answer from the server
 * (202 or an error with a status) the key is discarded and the next attempt makes a new one.
 * Waits from Retry-After up to 120 seconds count down on the button; longer ones are shown
 * approximately and end at a stored time (useWaitUntil). Pay and Cancel are enabled only when
 * the server's can_pay and can_cancel are true.
 * While the prompt is open the order is polled every 3 seconds for up to 150 seconds (useOrder).
 */
export default function OrderScreen() {
  const headingRef = usePageTitle(ORDER_SCREEN_TEXT.title);
  const { orderId = '' } = useParams();
  const validId = isUuid(orderId);
  const order = useOrder(validId ? orderId : '', { pollWhileWaiting: true });
  const [payKey] = useState(createPayKey);
  const attemptRef = useRef(payKey);
  const pay = usePayOrder(orderId, attemptRef);
  const cancel = useCancelOrder();
  const wait = useCountdown();
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const onLongWaitOver = useCallback(() => setMessage(ORDER_SCREEN_TEXT.waitOver), []);
  const longWait = useWaitUntil(onLongWaitOver);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState(/** @type {string | null} */ (null));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const phoneRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const focusAfterConfirm = useRef(/** @type {FocusTarget} */ ('field'));
  const [focusRequest, setFocusRequest] = useState(
    /** @type {{ target: FocusTarget, n: number } | null} */ (null),
  );
  const [promptTarget, setPromptTarget] = useState(/** @type {string | null} */ (null));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState(/** @type {unknown} */ (null));
  const [countdownNews, setCountdownNews] = useState('');
  const cancelTrigger = useRef(/** @type {HTMLElement | null} */ (null));
  const paying = useRef(false);
  const { refetch, restartPollWindow } = order;

  // The key and the number held for an attempt are dropped when the screen goes away.
  useEffect(() => () => payKey.clear(), [payKey]);

  // Focus after a pay step, once the field or the button is enabled again.
  useEffect(() => {
    if (focusRequest) focusElement(focusRequest.target, phoneRef.current)?.focus();
  }, [focusRequest]);

  const requestFocus = useCallback((/** @type {FocusTarget} */ target) => {
    focusAfterConfirm.current = target;
    setFocusRequest((last) => ({ target, n: (last?.n ?? 0) + 1 }));
  }, []);

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

  const sendPayment = useCallback(() => {
    if (paying.current) return;
    try {
      // A new key for a deliberate attempt; the same key again only after an unknown result
      // with the same number.
      payKey.begin(phone);
    } catch {
      setPhoneError(phoneFieldError(phone));
      setConfirmOpen(false);
      requestFocus('field');
      return;
    }
    paying.current = true;
    setMessage(null);
    pay.mutate(undefined, {
      onSuccess: (result) => {
        payKey.clear();
        setUncertain(false);
        setPromptTarget(typeof result.prompt === 'string' ? result.prompt : null);
        setMessage(typeof result.message === 'string' ? result.message : null);
        restartPollWindow();
        setConfirmOpen(false);
        requestFocus('heading');
      },
      onError: (error) => {
        const mapped = mapPayError(error);
        if (isDefinitivePayError(error)) {
          payKey.clear();
          setUncertain(false);
        } else {
          payKey.markUncertain();
          setUncertain(true);
        }
        if (mapped.field === 'phone') {
          setPhoneError(mapped.message);
          requestFocus('field');
        } else {
          setMessage(mapped.message);
          requestFocus('button');
        }
        if (mapped.action === 'refetch') {
          restartPollWindow();
          void refetch();
        } else if (mapped.action === 'wait' && mapped.waitSeconds) {
          if (mapped.waitSeconds <= COUNTDOWN_MAX_SECONDS) wait.start(mapped.waitSeconds);
          else longWait.start(mapped.waitSeconds);
        }
        setConfirmOpen(false);
      },
      onSettled: () => {
        paying.current = false;
      },
    });
  }, [longWait, pay, payKey, phone, refetch, requestFocus, restartPollWindow, wait]);

  // "Pay with M-Pesa": check the number, then ask for confirmation. "Check payment request"
  // (after an unknown result) sends the same key and number again at once.
  const onPay = useCallback(() => {
    if (paying.current) return;
    if (uncertain) {
      sendPayment();
      return;
    }
    const problem = phoneFieldError(phone);
    if (problem) {
      setPhoneError(problem);
      requestFocus('field');
      return;
    }
    setPhoneError(null);
    focusAfterConfirm.current = 'field';
    setConfirmOpen(true);
  }, [phone, requestFocus, sendPayment, uncertain]);

  const onPhoneChange = useCallback((/** @type {string} */ value) => {
    setPhone(value);
    setPhoneError(null);
  }, []);

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
            onPay,
            pending: pay.isPending,
            waitSeconds: wait.remaining,
            blocked: longWait.active,
            uncertain,
            phone: {
              value: phone,
              onChange: onPhoneChange,
              error: phoneError,
              disabled: pay.isPending || uncertain,
              inputRef: phoneRef,
            },
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
        <ConfirmPhoneDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          phone={phone}
          totalAmount={data.total_amount}
          pending={pay.isPending}
          onSend={sendPayment}
          returnFocus={() => focusElement(focusAfterConfirm.current, phoneRef.current)}
        />
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
