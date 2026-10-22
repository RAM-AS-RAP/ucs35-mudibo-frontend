import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, RefreshCw, SearchX, XCircle } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { useAdminOrder, useResolveOrder } from '@/api/queries/admin';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/display/PageHeader';
import { StatusBadge } from '@/components/display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { RefreshButton } from '@/components/admin/ListParts';
import { PaymentEventsDialog } from '@/components/admin/PaymentEventsDialog';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import {
  ADMIN_COMMON,
  adminErrorMessage,
  isUnknownWriteResult,
  NOTE_MAX,
  NOTE_MIN,
  ORDER_DETAIL_TEXT as T,
  ORDERS_TEXT,
  RESOLUTION_WORDS,
  WRITE_UNKNOWN,
} from '@/lib/adminMessages';
import { formatDateTime, formatKES, formatQuantity } from '@/lib/format';
import { ADMIN_ORDER_STATUS_WORDS, cropLabel } from '@/lib/messages';
import { describeEffect, describeReason } from '@/lib/reconciliation';
import { usePageTitle } from '@/lib/usePageTitle';

/** @typedef {import('@/api/endpoints/admin').AdminOrderDetail} AdminOrderDetail */
/** @typedef {import('@/api/endpoints/admin').AdminOrderPayment} AdminOrderPayment */
/** @typedef {import('@/components/admin/ConfirmDialog').DialogError} DialogError */
/** @typedef {'confirm_sale' | 'void_order'} ResolveAction */

/** @param {string | null | undefined} status */
function orderStatusWords(status) {
  if (!status) return ORDERS_TEXT.noPayment;
  return Object.prototype.hasOwnProperty.call(ADMIN_ORDER_STATUS_WORDS, status)
    ? ADMIN_ORDER_STATUS_WORDS[/** @type {keyof typeof ADMIN_ORDER_STATUS_WORDS} */ (status)]
    : status.replace(/_/g, ' ');
}

/**
 * A list of labelled values.
 * @param {{ items: Array<[string, import('react').ReactNode]>, testId?: string }} props
 */
function Facts({ items, testId }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2" data-testid={testId}>
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-sm text-text-secondary">{label}</dt>
          <dd className="break-words text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A titled card section.
 * @param {{ id: string, title: string, children: import('react').ReactNode, className?: string }} props
 */
function Section({ id, title, children, className = '' }) {
  return (
    <section
      aria-labelledby={id}
      className={`flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}
    >
      <h2 id={id} tabIndex={-1} className="text-lg font-semibold text-text outline-none">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<AdminOrderPayment>>} */
const PAYMENT_COLUMNS = [
  {
    key: 'status',
    header: T.paymentStatus,
    cell: (p) => <StatusBadge kind="adminPayment" status={p.status} />,
  },
  {
    key: 'amount',
    header: T.amount,
    numeric: true,
    cell: (p) => <span data-testid="payment-amount">{formatKES(p.amount)}</span>,
  },
  {
    key: 'target',
    header: T.target,
    cell: (p) => <span className="font-mono">{p.stk_target_masked}</span>,
  },
  {
    key: 'receipt',
    header: ORDERS_TEXT.receipt,
    cell: (p) =>
      p.mpesa_receipt_number ? (
        <span className="font-mono">{p.mpesa_receipt_number}</span>
      ) : (
        ORDERS_TEXT.noReceipt
      ),
  },
  {
    key: 'result',
    header: T.result,
    wrap: true,
    cell: (p) => T.resultText(p.result_code, p.result_desc),
  },
  { key: 'environment', header: T.environment, cell: (p) => p.environment },
  { key: 'created', header: ORDERS_TEXT.created, cell: (p) => formatDateTime(p.created_at) },
  {
    key: 'completed',
    header: T.completed,
    cell: (p) => (p.completed_at ? formatDateTime(p.completed_at) : ADMIN_COMMON.notYet),
  },
  {
    key: 'callback',
    header: T.callback,
    cell: (p) =>
      p.callback_received_at ? formatDateTime(p.callback_received_at) : ADMIN_COMMON.notYet,
  },
];

/** @param {{ resolution: NonNullable<AdminOrderDetail['resolution']> }} props */
function Resolution({ resolution }) {
  const action = resolution.action ?? '';
  return (
    <Section id="resolution-title" title={T.resolutionTitle}>
      <div data-testid="resolution">
        <Facts
          items={[
            [
              T.resolutionAction,
              <span key="action" className="flex items-center gap-1.5 font-medium">
                {action === 'void_order' ? (
                  <XCircle aria-hidden="true" className="size-4" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-4 text-positive" />
                )}
                {RESOLUTION_WORDS[action] ?? (action ? action.replace(/_/g, ' ') : T.noNote)}
              </span>,
            ],
            [T.resolutionBy, resolution.admin_name ?? T.unknownAdmin],
            [T.resolutionAt, formatDateTime(resolution.created_at)],
            [
              T.resolutionNote,
              <span key="note" className="whitespace-pre-wrap">
                {resolution.note ?? T.noNote}
              </span>,
            ],
          ]}
        />
      </div>
    </Section>
  );
}

/**
 * The review panel of a needs_reconciliation order: what was observed, the status before, when
 * it was flagged, and "Confirm sale" or "Void order", each through a confirmation with its
 * consequences and a required note. The request body is exactly `{action, note}`.
 * @param {{ order: AdminOrderDetail, onRefetch: () => unknown }} props
 */
function ReviewPanel({ order, onRefetch }) {
  const resolve = useResolveOrder(order.id);
  const [action, setAction] = useState(/** @type {ResolveAction | null} */ (null));
  const [open, setOpen] = useState(false);
  const [dialogError, setDialogError] = useState(/** @type {DialogError | null} */ (null));
  const [pageMessage, setPageMessage] = useState(/** @type {string | null} */ (null));
  const reconciliation = order.reconciliation ?? null;
  const before = reconciliation?.order_status_before ?? null;

  /** @param {ResolveAction} next */
  function ask(next) {
    setAction(next);
    setDialogError(null);
    setPageMessage(null);
    setOpen(true);
  }

  /** @param {string} note */
  async function run(note) {
    if (!action) return;
    try {
      await resolve.mutateAsync({ action, note });
      setOpen(false);
      toast.success(action === 'confirm_sale' ? T.confirmedToast : T.voidedToast);
    } catch (error) {
      if (isUnknownWriteResult(error)) {
        setDialogError({
          message: WRITE_UNKNOWN.order,
          final: true,
          action: (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                setOpen(false);
                onRefetch();
              }}
            >
              <RefreshCw aria-hidden="true" />
              {T.refreshOrder}
            </Button>
          ),
        });
        return;
      }
      const code = error instanceof ApiError ? error.code : '';
      if (code === 'order_not_in_reconciliation') {
        setOpen(false);
        setPageMessage(adminErrorMessage(error));
        onRefetch();
        return;
      }
      setDialogError({
        message: adminErrorMessage(error),
        reference: error instanceof ApiError ? error.requestId : null,
        final:
          code === 'reconciliation_context_missing' || code === 'insufficient_stock_to_confirm',
      });
    }
  }

  const confirming = action === 'confirm_sale';
  return (
    <Section id="review-title" title={T.reviewTitle} className="border-negative">
      <div className="flex flex-col gap-4" data-testid="review-panel">
        <p className="text-text" data-testid="review-reason">
          {describeReason(reconciliation?.reason)}
        </p>
        <Facts
          items={[
            [T.previousStatus, orderStatusWords(before)],
            [
              T.flaggedAt,
              reconciliation?.flagged_at
                ? formatDateTime(reconciliation.flagged_at)
                : T.notRecorded,
            ],
          ]}
        />
        <p className="text-sm text-text-secondary">{T.reviewIntro}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => ask('confirm_sale')} disabled={resolve.isPending}>
            <CheckCircle2 aria-hidden="true" />
            {T.confirmSale}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => ask('void_order')}
            disabled={resolve.isPending}
          >
            <XCircle aria-hidden="true" />
            {T.voidOrder}
          </Button>
        </div>
      </div>
      <div role="status" className="empty:hidden">
        {pageMessage && (
          <p className="font-medium text-text" data-testid="review-message">
            {pageMessage}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={confirming ? T.confirmTitle : T.voidTitle}
        description={`${T.titleWith(order.reference)}, ${order.buyer_name}, ${formatKES(order.total_amount)}.`}
        consequences={action ? describeEffect(action, before) : []}
        confirmLabel={confirming ? T.confirmButton : T.voidButton}
        pendingLabel={T.resolving}
        destructive={!confirming}
        pending={resolve.isPending}
        onConfirm={run}
        error={dialogError}
        note={{ label: T.noteLabel, hint: T.noteHint, min: NOTE_MIN, max: NOTE_MAX }}
        // After a resolution the review buttons are gone: focus goes to the Resolution heading.
        returnFocus={() => document.getElementById('resolution-title')}
      />
    </Section>
  );
}

/** @param {{ order: AdminOrderDetail, onRefetch: () => unknown }} props */
function OrderDetail({ order, onRefetch }) {
  const reviewable = order.status === 'needs_reconciliation';
  return (
    <div className="flex flex-col gap-6">
      {reviewable && <ReviewPanel order={order} onRefetch={onRefetch} />}
      {order.resolution && <Resolution resolution={order.resolution} />}

      <Section id="summary-title" title={T.summaryTitle}>
        <Facts
          testId="order-summary"
          items={[
            [
              T.reference,
              <span key="ref" className="font-mono">
                {order.reference}
              </span>,
            ],
            [T.status, <StatusBadge key="status" kind="adminOrder" status={order.status} />],
            [T.produce, cropLabel(order.crop)],
            [T.market, order.market],
            [T.quantity, `${formatQuantity(order.quantity)} kg`],
            [T.unitPrice, formatKES(order.unit_price)],
            [
              T.total,
              <span key="total" data-testid="order-total">
                {formatKES(order.total_amount)}
              </span>,
            ],
            [
              T.latestPayment,
              order.latest_payment_status ? (
                <StatusBadge
                  key="payment"
                  kind="adminPayment"
                  status={order.latest_payment_status}
                />
              ) : (
                ORDERS_TEXT.noPayment
              ),
            ],
            [T.receipt, order.latest_mpesa_receipt_number ?? ORDERS_TEXT.noReceipt],
            [T.created, formatDateTime(order.created_at)],
            [T.expires, formatDateTime(order.expires_at)],
          ]}
        />
      </Section>

      <Section id="parties-title" title={T.partiesTitle}>
        <Facts
          items={[
            [T.buyer, order.buyer_name],
            [T.seller, order.seller_name],
            [
              T.listing,
              <span key="listing" className="font-mono break-all">
                {order.listing_id}
              </span>,
            ],
          ]}
        />
      </Section>

      <Section id="payments-title" title={T.paymentsTitle}>
        {order.payments.length === 0 ? (
          <p className="text-text-secondary">{T.noPayments}</p>
        ) : (
          <ResponsiveTable
            caption={T.paymentsCaption}
            captionHidden
            columns={PAYMENT_COLUMNS}
            rows={order.payments}
            rowKey={(p) => p.id}
            headingLevel={3}
            actions={(p) => (
              <PaymentEventsDialog
                paymentId={p.id}
                label={`for the payment of ${formatDateTime(p.created_at)}`}
              />
            )}
          />
        )}
      </Section>
    </div>
  );
}

/**
 * Order detail (/admin/orders/:orderId): the summary, the parties, the listing id, the payments
 * with their events, and for needs_reconciliation orders the review panel. A resolved order
 * shows its resolution read only; orders in other states show no actions. Amounts are the
 * server's values.
 */
export default function AdminOrderDetailScreen() {
  const { orderId = '' } = useParams();
  const query = useAdminOrder(orderId);
  const title = query.data ? T.titleWith(query.data.reference) : T.title;
  const headingRef = usePageTitle(title);

  const notFound =
    query.isError && query.error instanceof ApiError && query.error.code === 'order_not_found';

  let body;
  if (query.isPending) body = <LoadingState label={T.loading} rows={3} />;
  else if (notFound) body = <EmptyState icon={SearchX} title={T.notFound} />;
  else if (query.isError)
    body = <ErrorState error={query.error} title={T.errorTitle} onRetry={() => query.refetch()} />;
  else body = <OrderDetail order={query.data} onRefetch={() => query.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="link" className="w-fit px-0">
        <Link to="/admin/orders">
          <ArrowLeft aria-hidden="true" />
          {T.back}
        </Link>
      </Button>
      <PageHeader
        title={title}
        headingRef={headingRef}
        actions={
          <RefreshButton
            onRefresh={() => query.refetch()}
            refreshing={query.isRefetching}
            disabled={query.isPending}
          />
        }
      />
      {body}
    </div>
  );
}
