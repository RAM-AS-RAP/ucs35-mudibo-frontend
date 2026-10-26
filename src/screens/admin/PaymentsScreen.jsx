import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, CreditCard, Info } from 'lucide-react';
import { useAdminPayments } from '@/api/queries/admin';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/display/PageHeader';
import { Segmented } from '@/components/display/Segmented';
import { StatusBadge } from '@/components/display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FilterBar, SELECT_CLASS, useFilterParams } from '@/components/admin/FilterBar';
import { LoadMore, pagesOf, RefreshButton, ShowingCount } from '@/components/admin/ListParts';
import { PaymentEventsDialog } from '@/components/admin/PaymentEventsDialog';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import { SearchInput } from '@/components/admin/SearchInput';
import { ADMIN_COMMON, PAYMENT_STATUS_FILTERS, PAYMENTS_TEXT } from '@/lib/adminMessages';
import { isIsoDate, validateDateRange } from '@/lib/dateRange';
import { formatDateTime, formatKES } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';

/** @typedef {import('@/api/endpoints/admin').AdminPayment} AdminPayment */

/** GET /admin/payments accepts an order reference of 6 to 12 characters. */
export const REFERENCE_MIN = 6;
export const REFERENCE_MAX = 12;

const RULES = Object.freeze({
  status: { values: PAYMENT_STATUS_FILTERS.map((f) => f.value), fallback: 'all' },
  environment: { values: ['all', 'sandbox', 'production'], fallback: 'all' },
  ref: {
    accept: (/** @type {string} */ v) =>
      v.trim().length >= REFERENCE_MIN && v.length <= REFERENCE_MAX,
  },
  from: { accept: isIsoDate },
  to: { accept: isIsoDate },
});

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<AdminPayment>>} */
const COLUMNS = [
  {
    key: 'order',
    header: PAYMENTS_TEXT.order,
    cell: (p) => (
      <Link
        to={`/admin/orders/${p.order_id}`}
        aria-label={`Order ${p.order_reference}`}
        className="inline-flex min-h-11 items-center font-mono text-primary underline underline-offset-2"
      >
        {p.order_reference}
      </Link>
    ),
  },
  { key: 'buyer', header: PAYMENTS_TEXT.buyer, cell: (p) => p.buyer_name },
  {
    key: 'amount',
    header: PAYMENTS_TEXT.amount,
    numeric: true,
    cell: (p) => <span data-testid="payment-amount">{formatKES(p.amount)}</span>,
  },
  {
    key: 'status',
    header: PAYMENTS_TEXT.status,
    cell: (p) => <StatusBadge kind="adminPayment" status={p.status} />,
  },
  {
    key: 'entered',
    header: PAYMENTS_TEXT.entered,
    cell: (p) =>
      p.phone_masked ? (
        <span className="font-mono">{p.phone_masked}</span>
      ) : (
        PAYMENTS_TEXT.notRecorded
      ),
  },
  {
    key: 'target',
    header: PAYMENTS_TEXT.target,
    cell: (p) => <span className="font-mono">{p.stk_target_masked}</span>,
  },
  {
    key: 'receipt',
    header: PAYMENTS_TEXT.receipt,
    cell: (p) =>
      p.mpesa_receipt_number ? (
        <span className="font-mono">{p.mpesa_receipt_number}</span>
      ) : (
        ADMIN_COMMON.none
      ),
  },
  {
    key: 'result',
    header: PAYMENTS_TEXT.result,
    wrap: true,
    cell: (p) => p.result_desc ?? PAYMENTS_TEXT.noResult,
  },
  { key: 'environment', header: PAYMENTS_TEXT.environment, cell: (p) => p.environment },
  {
    key: 'attempt',
    header: PAYMENTS_TEXT.attempt,
    numeric: true,
    cell: (p) => String(p.attempt_number),
  },
  { key: 'created', header: PAYMENTS_TEXT.created, cell: (p) => formatDateTime(p.created_at) },
  {
    key: 'completed',
    header: PAYMENTS_TEXT.completed,
    cell: (p) => (p.completed_at ? formatDateTime(p.completed_at) : ADMIN_COMMON.notYet),
  },
];

/**
 * Payments (/admin/payments): every payment request with status chips, an environment select,
 * an order reference search (6 to 12 characters, as the API accepts) and a date range. The
 * dates are sent as YYYY-MM-DD; openapi.json does not say in which time zone the server reads
 * them, so they are labelled "as interpreted by the server". An invalid range (a start after the
 * end) shows a message and sends no request. Each row links to its order and opens its events.
 */
export default function PaymentsScreen() {
  const headingRef = usePageTitle(PAYMENTS_TEXT.title);
  const ids = useId();
  const filters = useFilterParams(RULES);
  const { status, environment, ref, from, to } = filters.values;
  // The typed dates; applied to the URL (and the request) only when the range is valid.
  const [fromText, setFromText] = useState(from ?? '');
  const [toText, setToText] = useState(to ?? '');
  const [shownRange, setShownRange] = useState({ from, to });
  if (shownRange.from !== from || shownRange.to !== to) {
    // The URL changed elsewhere (Clear filters, a link): show its dates.
    setShownRange({ from, to });
    setFromText(from ?? '');
    setToText(to ?? '');
  }
  const range = validateDateRange({ from: fromText, to: toText });
  const query = useAdminPayments(
    {
      status: status === 'all' ? null : /** @type {any} */ (status),
      orderReference: ref,
      environment: environment === 'all' ? null : /** @type {any} */ (environment),
      createdFrom: range.ok ? range.from : null,
      createdTo: range.ok ? range.to : null,
    },
    { enabled: range.ok },
  );
  const setFilters = filters.set;
  const onSearch = useCallback(
    (/** @type {string | null} */ text) => setFilters({ ref: text }),
    [setFilters],
  );

  /** @param {'from' | 'to'} which @param {string} value */
  function changeDate(which, value) {
    const nextFrom = which === 'from' ? value : fromText;
    const nextTo = which === 'to' ? value : toText;
    if (which === 'from') setFromText(value);
    else setToText(value);
    const next = validateDateRange({ from: nextFrom, to: nextTo });
    if (next.ok) {
      setShownRange({ from: next.from, to: next.to });
      filters.set({ from: next.from, to: next.to });
    }
  }

  const { items, total } = pagesOf(query.data);
  let body;
  if (!range.ok) {
    body = null;
  } else if (query.isPending) {
    body = <LoadingState label={PAYMENTS_TEXT.loading} rows={3} />;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = (
      <ErrorState
        error={query.error}
        title={PAYMENTS_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={CreditCard}
        title={filters.active ? PAYMENTS_TEXT.emptyFilteredTitle : PAYMENTS_TEXT.emptyTitle}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ShowingCount shown={items.length} total={total} />
        <ResponsiveTable
          caption={PAYMENTS_TEXT.caption}
          captionHidden
          columns={COLUMNS}
          rows={items}
          rowKey={(p) => p.id}
          actions={(p) => (
            <PaymentEventsDialog paymentId={p.id} label={`for order ${p.order_reference}`} />
          )}
        />
        <LoadMore query={query} errorTitle={PAYMENTS_TEXT.errorTitle} />
      </div>
    );
  }

  const dateProblemId = `${ids}-date-problem`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={PAYMENTS_TEXT.title}
        description={PAYMENTS_TEXT.description}
        headingRef={headingRef}
        actions={
          <RefreshButton
            onRefresh={() => query.refetch()}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            disabled={query.isPending || !range.ok}
          />
        }
      />
      <FilterBar
        label={PAYMENTS_TEXT.filterLabel}
        active={filters.active || fromText !== '' || toText !== ''}
        onClear={() => {
          setFromText('');
          setToText('');
          filters.clear();
        }}
      >
        <Segmented
          legend={PAYMENTS_TEXT.statusLegend}
          name="admin-payment-status"
          options={PAYMENT_STATUS_FILTERS}
          value={/** @type {any} */ (status)}
          onChange={(value) => filters.set({ status: value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-environment`}>{PAYMENTS_TEXT.environmentLabel}</Label>
            <select
              id={`${ids}-environment`}
              className={SELECT_CLASS}
              value={environment ?? 'all'}
              onChange={(event) => filters.set({ environment: event.target.value })}
            >
              <option value="all">{PAYMENTS_TEXT.allEnvironments}</option>
              <option value="sandbox">{PAYMENTS_TEXT.sandbox}</option>
              <option value="production">{PAYMENTS_TEXT.production}</option>
            </select>
          </div>
          <SearchInput
            label={PAYMENTS_TEXT.referenceLabel}
            value={ref}
            onSearch={onSearch}
            min={REFERENCE_MIN}
            max={REFERENCE_MAX}
            shortMessage={PAYMENTS_TEXT.referenceShort}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-from`}>{PAYMENTS_TEXT.fromLabel}</Label>
            <Input
              id={`${ids}-from`}
              type="date"
              value={fromText}
              onChange={(event) => changeDate('from', event.target.value)}
              aria-invalid={!range.ok && range.field === 'from' ? true : undefined}
              aria-describedby={`${ids}-dates-note${range.ok ? '' : ` ${dateProblemId}`}`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-to`}>{PAYMENTS_TEXT.toLabel}</Label>
            <Input
              id={`${ids}-to`}
              type="date"
              value={toText}
              onChange={(event) => changeDate('to', event.target.value)}
              aria-invalid={!range.ok && range.field === 'to' ? true : undefined}
              aria-describedby={`${ids}-dates-note${range.ok ? '' : ` ${dateProblemId}`}`}
            />
          </div>
        </div>
        <p id={`${ids}-dates-note`} className="flex items-start gap-2 text-sm text-text-secondary">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{PAYMENTS_TEXT.datesNote}</span>
        </p>
        <div role="alert" className="empty:hidden">
          {!range.ok && (
            <p
              id={dateProblemId}
              className="flex items-start gap-1.5 text-sm font-medium text-negative-text"
              data-testid="date-problem"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-negative" />
              <span>{range.error}</span>
            </p>
          )}
        </div>
      </FilterBar>
      {body}
    </div>
  );
}
