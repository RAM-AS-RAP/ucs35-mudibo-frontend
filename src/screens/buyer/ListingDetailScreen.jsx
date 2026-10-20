import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { AlertCircle, Package, PackageX, ShoppingCart, User } from 'lucide-react';
import { useCreateOrder, useListing } from '@/api/queries';
import { existingOrderId } from '@/api/endpoints';
import { ApiError, getUserMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { CountdownButton } from '@/components/auth/CountdownButton';
import { FormErrorSummary } from '@/components/auth/FormErrorSummary';
import { DEFAULT_RETRY_SECONDS } from '@/components/auth/useServerProblem';
import { PageHeader } from '@/components/display/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { CheckoutSummary } from '@/components/buyer/CheckoutSummary';
import { ProducePhoto } from '@/components/buyer/ProducePhoto';
import { QuantityStepper, validateQuantity } from '@/components/buyer/QuantityStepper';
import { SandboxNote } from '@/components/buyer/SandboxNote';
import { MIN_ORDER_QUANTITY, MIN_ORDER_TOTAL_KES } from '@/lib/constants';
import { isUuid } from '@/lib/filterParams';
import { bagPriceText } from '@/lib/forecast';
import { formatKES, formatQuantity } from '@/lib/format';
import { cropLabel, MESSAGES } from '@/lib/messages';
import { BROWSE_TEXT, LISTING_DETAIL_TEXT } from '@/lib/buyerMessages';
import { estimateTotalKES } from '@/lib/orderTotals';
import { useCountdown } from '@/lib/useCountdown';
import { usePageTitle } from '@/lib/usePageTitle';

/** Codes after which the listing is shown as no longer available. */
const GONE_CODES = new Set(['listing_unavailable', 'listing_not_found']);
/** The request may have reached the server: never retried, the buyer checks My orders. */
const UNCERTAIN_CODES = new Set(['network_error', 'timeout']);

/**
 * @typedef {{ text: string, link?: { to: string, label: string }, reference?: string | null }} Problem
 */

/** The "no longer available" state, with a way back to browsing. */
function Unavailable() {
  return (
    <EmptyState
      icon={PackageX}
      title={LISTING_DETAIL_TEXT.unavailable}
      action={
        <Button asChild>
          <Link to="/buyer/browse">{LISTING_DETAIL_TEXT.browseOther}</Link>
        </Button>
      }
    />
  );
}

/**
 * Listing detail and checkout (/buyer/listings/:listingId). The estimate is labelled as one;
 * the server computes the charged total. "Continue to checkout" sends POST /orders once (a
 * second click while it runs sends nothing) and is never retried automatically; after a
 * network failure or a timeout the buyer is asked to check My orders.
 */
export default function ListingDetailScreen() {
  const headingRef = usePageTitle(LISTING_DETAIL_TEXT.title);
  const { listingId = '' } = useParams();
  const validId = isUuid(listingId);
  const listing = useListing(validId ? listingId : '');
  const create = useCreateOrder();
  const navigate = useNavigate();
  const ids = useId();
  const countdown = useCountdown();
  const [quantityText, setQuantityText] = useState(String(MIN_ORDER_QUANTITY));
  const [problem, setProblem] = useState(/** @type {Problem | null} */ (null));
  const [gone, setGone] = useState(false);
  const submitting = useRef(false);
  const summaryRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useLayoutEffect(() => {
    if (problem) summaryRef.current?.focus();
  }, [problem]);

  // Warn before leaving the page only while the order request is in flight.
  const pending = create.isPending;
  useEffect(() => {
    if (!pending) return undefined;
    /** @param {BeforeUnloadEvent} event */
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  const notFound =
    !validId ||
    gone ||
    (listing.isError &&
      listing.error instanceof ApiError &&
      (listing.error.status === 404 || listing.error.status === 422));

  let body;
  if (notFound) {
    body = <Unavailable />;
  } else if (listing.isPending) {
    body = <LoadingState label={LISTING_DETAIL_TEXT.loading} rows={3} />;
  } else if (listing.isError) {
    body = (
      <ErrorState
        error={listing.error}
        title={LISTING_DETAIL_TEXT.errorTitle}
        onRetry={() => listing.refetch()}
      />
    );
  } else {
    const item = listing.data;
    const crop = cropLabel(item.crop);
    const available = item.available === true && Number(item.quantity_available) > 0;
    const quantity = validateQuantity(quantityText, item.quantity_available);
    const estimate = quantity.ok ? estimateTotalKES(quantity.value, item.price_per_unit) : null;
    const belowMinimum = estimate !== null && estimate < MIN_ORDER_TOTAL_KES;
    const bag = bagPriceText(item.price_per_unit);
    const fieldError = quantity.ok ? null : quantityText.trim() === '' ? null : quantity.error;

    /** @param {unknown} error */
    const handleError = async (error) => {
      const code = error instanceof ApiError ? error.code : 'unknown';
      const reference = error instanceof ApiError ? error.requestId : null;
      if (GONE_CODES.has(code)) {
        setGone(true);
        return;
      }
      if (code === 'pending_order_exists') {
        const id = existingOrderId(error);
        if (id) {
          toast.info(LISTING_DETAIL_TEXT.existing);
          navigate(`/buyer/orders/${id}`);
          return;
        }
        setProblem({
          text: getUserMessage(error),
          link: {
            to: '/buyer/orders?status=pending_payment',
            label: LISTING_DETAIL_TEXT.seeWaitingOrders,
          },
        });
        return;
      }
      if (code === 'too_many_pending_orders') {
        setProblem({
          text: getUserMessage(error),
          link: {
            to: '/buyer/orders?status=pending_payment',
            label: LISTING_DETAIL_TEXT.seeWaitingOrders,
          },
          reference,
        });
        return;
      }
      if (UNCERTAIN_CODES.has(code)) {
        setProblem({
          text: LISTING_DETAIL_TEXT.uncertain,
          link: { to: '/buyer/orders', label: LISTING_DETAIL_TEXT.goToMyOrders },
        });
        return;
      }
      if (error instanceof ApiError && error.status === 429) {
        const seconds =
          error.retryAfter && error.retryAfter > 0 ? error.retryAfter : DEFAULT_RETRY_SECONDS;
        countdown.start(seconds);
        setProblem({ text: MESSAGES.form.tooManyAttempts(seconds), reference });
        return;
      }
      if (code === 'insufficient_stock') {
        const refreshed = await listing.refetch();
        const qty = refreshed.data?.quantity_available;
        setProblem({
          text:
            typeof qty === 'number'
              ? `${getUserMessage(error)} ${LISTING_DETAIL_TEXT.stockUpdated(formatQuantity(qty))}`
              : getUserMessage(error),
          reference,
        });
        return;
      }
      setProblem({ text: getUserMessage(error), reference });
    };

    const checkout = () => {
      if (submitting.current || !quantity.ok || belowMinimum || !available) return;
      submitting.current = true;
      setProblem(null);
      create.mutate(
        { listingId: item.id, quantity: quantity.value },
        {
          onSuccess: (order) => {
            toast.success(LISTING_DETAIL_TEXT.created);
            navigate(`/buyer/orders/${order.id}`);
          },
          onError: (error) => {
            void handleError(error);
          },
          onSettled: () => {
            submitting.current = false;
          },
        },
      );
    };

    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ProducePhoto
            imageUrl={item.image_url}
            alt={BROWSE_TEXT.photoAlt(crop.toLowerCase())}
            eager
          />
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-text">
              {crop} <span className="font-normal text-text-secondary">in</span> {item.market}
            </h2>
            <p className="flex items-center gap-1.5 break-words text-text-secondary">
              <User aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0">{BROWSE_TEXT.soldBy(item.seller_name?.trim() || '—')}</span>
            </p>
            <p className="text-2xl font-bold text-text tabular-nums">
              {BROWSE_TEXT.perKg(formatKES(item.price_per_unit))}
            </p>
            {bag && <p className="text-text-secondary">{bag}</p>}
            <p className="flex items-center gap-1.5 text-text">
              <Package aria-hidden="true" className="size-4 shrink-0" />
              <span>{BROWSE_TEXT.available(formatQuantity(item.quantity_available))}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {!available && (
            <div
              className="flex flex-col gap-3 rounded-xl border border-border bg-neutral-bg p-4 text-neutral-text"
              data-testid="sold-out"
            >
              <p className="flex items-center gap-2 text-lg font-semibold">
                <PackageX aria-hidden="true" className="size-5 shrink-0" />
                <span>{LISTING_DETAIL_TEXT.soldOutTitle}</span>
              </p>
              <p>{LISTING_DETAIL_TEXT.soldOutText}</p>
              <Button asChild variant="outline" className="w-full sm:w-fit">
                <Link to="/buyer/browse">{LISTING_DETAIL_TEXT.browseOther}</Link>
              </Button>
            </div>
          )}
          {problem && (
            <FormErrorSummary
              ref={summaryRef}
              title={LISTING_DETAIL_TEXT.summaryTitle}
              problems={[{ text: problem.text }]}
              reference={problem.reference}
            >
              {problem.link && (
                <Link
                  to={problem.link.to}
                  className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2"
                >
                  {problem.link.label}
                </Link>
              )}
            </FormErrorSummary>
          )}
          <QuantityStepper
            id={`${ids}-quantity`}
            value={quantityText}
            onChange={setQuantityText}
            available={item.quantity_available}
            disabled={!available || pending}
            error={fieldError}
          />
          <CheckoutSummary
            listing={item}
            quantity={quantity.ok ? quantity.value : null}
            estimate={estimate}
          />
          {belowMinimum && (
            <p
              className="flex items-start gap-1.5 text-sm text-negative-text"
              data-testid="minimum-message"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
              <span>{LISTING_DETAIL_TEXT.minimumTotal}</span>
            </p>
          )}
          <CountdownButton
            type="button"
            size="lg"
            className="w-full"
            remaining={countdown.remaining}
            pending={pending}
            pendingLabel={LISTING_DETAIL_TEXT.creating}
            disabled={!available || !quantity.ok || belowMinimum}
            onClick={checkout}
          >
            <ShoppingCart aria-hidden="true" />
            {LISTING_DETAIL_TEXT.checkout}
          </CountdownButton>
          <SandboxNote />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={LISTING_DETAIL_TEXT.title} headingRef={headingRef} />
      {body}
    </div>
  );
}
