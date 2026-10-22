import { Link } from 'react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  UserX,
} from 'lucide-react';
import { useAdminStats } from '@/api/queries/admin';
import { useSession } from '@/auth/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/display/PageHeader';
import { StatCard } from '@/components/display/StatCard';
import { StatusBadge } from '@/components/display/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { RefreshButton } from '@/components/admin/ListParts';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import { DASHBOARD_TEXT } from '@/lib/adminMessages';
import { formatDateTime, formatKES, formatMonth } from '@/lib/format';
import { cropLabel, MESSAGES } from '@/lib/messages';
import { usePageTitle } from '@/lib/usePageTitle';

/** Every status of each kind, in display order; a status the server omits counts as zero. */
export const LISTING_STATUSES = ['active', 'sold_out', 'removed'];
export const ORDER_STATUSES = [
  'needs_reconciliation',
  'pending_payment',
  'paid',
  'payment_failed',
  'expired',
  'cancelled',
];
export const PAYMENT_STATUSES = [
  'initiating',
  'initiated',
  'completed',
  'failed',
  'cancelled',
  'timeout',
];

/**
 * The known statuses with their count (zero when absent), then any other status the server
 * returned.
 * @param {readonly string[]} known
 * @param {Record<string, number> | null | undefined} counts
 */
export function countsFor(known, counts) {
  const source = counts ?? {};
  const rows = known.map((status) => ({ status, count: source[status] ?? 0 }));
  for (const [status, count] of Object.entries(source)) {
    if (!known.includes(status)) rows.push({ status, count });
  }
  return rows;
}

/**
 * A titled card of counts per status, each status as an icon and a word.
 * @param {{ title: string, kind: 'listing' | 'adminOrder' | 'adminPayment', rows: Array<{ status: string, count: number }>, testId: string }} props
 */
function CountsCard({ title, kind, rows, testId }) {
  return (
    <section
      aria-labelledby={`${testId}-title`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={testId}
    >
      <h3 id={`${testId}-title`} className="text-base font-semibold text-text">
        {title}
      </h3>
      <dl className="flex flex-col gap-2">
        {rows.map(({ status, count }) => (
          <div
            key={status}
            className="flex items-center justify-between gap-3"
            data-status-count={status}
          >
            <dt>
              <StatusBadge kind={kind} status={status} />
            </dt>
            <dd className="text-lg font-semibold text-text tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** @typedef {import('@/api/endpoints/admin').AdminStats} AdminStats */
/** @typedef {AdminStats['pipeline']['series'][number]} PipelineSeries */

/** @type {ReadonlyArray<import('@/components/admin/ResponsiveTable').Column<PipelineSeries>>} */
const PIPELINE_COLUMNS = [
  {
    key: 'series',
    header: `${DASHBOARD_TEXT.market} and ${DASHBOARD_TEXT.crop.toLowerCase()}`,
    cell: (s) => `${s.market}, ${cropLabel(s.crop)}`,
  },
  {
    key: 'price',
    header: DASHBOARD_TEXT.latestPrice,
    cell: (s) =>
      s.latest_price_month ? formatMonth(s.latest_price_month) : DASHBOARD_TEXT.noPrice,
  },
  {
    key: 'forecast',
    header: DASHBOARD_TEXT.latestForecast,
    cell: (s) =>
      s.forecast_origin_month ? formatMonth(s.forecast_origin_month) : DASHBOARD_TEXT.noForecast,
  },
  {
    key: 'status',
    header: DASHBOARD_TEXT.status,
    cell: (s) =>
      s.forecast_current === true ? (
        <Badge variant="positive" data-forecast="current">
          <CheckCircle2 aria-hidden="true" />
          <span>{DASHBOARD_TEXT.current}</span>
        </Badge>
      ) : (
        <Badge variant="negative" data-forecast="out-of-date">
          <AlertTriangle aria-hidden="true" />
          <span>{DASHBOARD_TEXT.outOfDate}</span>
        </Badge>
      ),
  },
];

/**
 * The orders needing review and the payments waiting more than 10 minutes, with links to the
 * filtered lists.
 * @param {{ attention: AdminStats['attention'] }} props
 */
function Attention({ attention }) {
  const review = attention.orders_needing_reconciliation ?? 0;
  const waiting = attention.payments_initiated_over_10_minutes ?? 0;
  return (
    <section aria-labelledby="attention-title" className="flex flex-col gap-3">
      <h2 id="attention-title" className="text-xl font-semibold text-text">
        {DASHBOARD_TEXT.attentionTitle}
      </h2>
      {review === 0 && waiting === 0 ? (
        <p
          className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-text"
          data-testid="nothing-needs-attention"
        >
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-positive" />
          <span>{DASHBOARD_TEXT.nothingNeedsAttention}</span>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {review > 0 && (
            <li className="flex flex-col gap-3 rounded-xl border border-negative bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 font-medium text-text">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-negative"
                />
                <span>{DASHBOARD_TEXT.ordersNeedReview(review)}</span>
              </p>
              <Button asChild variant="outline">
                <Link to="/admin/orders?status=needs_reconciliation">
                  {DASHBOARD_TEXT.reviewOrders}
                </Link>
              </Button>
            </li>
          )}
          {waiting > 0 && (
            <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 font-medium text-text">
                <CreditCard aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <span>{DASHBOARD_TEXT.paymentsWaiting(waiting)}</span>
              </p>
              <Button asChild variant="outline">
                <Link to="/admin/payments?status=initiated">{DASHBOARD_TEXT.viewPayments}</Link>
              </Button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** @param {{ stats: AdminStats }} props */
function Dashboard({ stats }) {
  const users = stats.users;
  const pipeline = stats.pipeline;
  const series = pipeline?.series ?? [];
  return (
    <div className="flex flex-col gap-8">
      <Attention attention={stats.attention} />

      <section aria-labelledby="users-title" className="flex flex-col gap-3">
        <h2 id="users-title" className="text-xl font-semibold text-text">
          {DASHBOARD_TEXT.usersTitle}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="user-counts">
          <StatCard label={DASHBOARD_TEXT.farmers} value={users.farmers ?? 0} icon={Sprout} />
          <StatCard label={DASHBOARD_TEXT.buyers} value={users.buyers ?? 0} icon={ShoppingBag} />
          <StatCard label={DASHBOARD_TEXT.admins} value={users.admins ?? 0} icon={ShieldCheck} />
          <StatCard label={DASHBOARD_TEXT.disabled} value={users.disabled ?? 0} icon={UserX} />
        </div>
      </section>

      <section aria-labelledby="activity-title" className="flex flex-col gap-3">
        <h2 id="activity-title" className="sr-only">
          {`${DASHBOARD_TEXT.listingsTitle}, ${DASHBOARD_TEXT.ordersTitle}, ${DASHBOARD_TEXT.paymentsTitle}`}
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <CountsCard
            title={DASHBOARD_TEXT.listingsTitle}
            kind="listing"
            rows={countsFor(LISTING_STATUSES, stats.listings)}
            testId="listing-counts"
          />
          <CountsCard
            title={DASHBOARD_TEXT.ordersTitle}
            kind="adminOrder"
            rows={countsFor(ORDER_STATUSES, stats.orders)}
            testId="order-counts"
          />
          <CountsCard
            title={DASHBOARD_TEXT.paymentsTitle}
            kind="adminPayment"
            rows={countsFor(PAYMENT_STATUSES, stats.payments)}
            testId="payment-counts"
          />
        </div>
        <StatCard
          label={DASHBOARD_TEXT.completedTitle}
          value={formatKES(stats.completed_sandbox_amount_kes ?? 0)}
          hint={DASHBOARD_TEXT.completedNote}
          icon={ClipboardList}
          className="sm:max-w-sm"
        />
      </section>

      <section aria-labelledby="pipeline-title" className="flex flex-col gap-3">
        <h2 id="pipeline-title" className="text-xl font-semibold text-text">
          {DASHBOARD_TEXT.pipelineTitle}
        </h2>
        <p className="text-text-secondary">{DASHBOARD_TEXT.pipelineNote}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2" data-testid="pipeline-times">
          <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3">
            <dt className="text-text-secondary">{DASHBOARD_TEXT.pricesFetched}</dt>
            <dd className="font-medium text-text">
              {pipeline?.last_prices_fetch
                ? formatDateTime(pipeline.last_prices_fetch)
                : DASHBOARD_TEXT.never}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-3">
            <dt className="text-text-secondary">{DASHBOARD_TEXT.forecastsGenerated}</dt>
            <dd className="font-medium text-text">
              {pipeline?.last_forecast_generated
                ? formatDateTime(pipeline.last_forecast_generated)
                : DASHBOARD_TEXT.never}
            </dd>
          </div>
        </dl>
        {series.length === 0 ? (
          <EmptyState icon={Database} title={DASHBOARD_TEXT.noPriceData} />
        ) : (
          <ResponsiveTable
            caption={DASHBOARD_TEXT.pipelineCaption}
            columns={PIPELINE_COLUMNS}
            rows={series}
            rowKey={(s) => `${s.market}:${s.crop}`}
            headingLevel={3}
          />
        )}
      </section>
    </div>
  );
}

/**
 * Admin dashboard (/admin): one GET /admin/stats request. Users by role, listings, orders and
 * payments by status (every status shown, zero when absent), the completed test payment total,
 * what needs attention, and the data pipeline health. A failed request shows one ErrorState for
 * the whole page. Refreshes on window focus and with Refresh; never polls.
 */
export default function AdminDashboardScreen() {
  const headingRef = usePageTitle(DASHBOARD_TEXT.title);
  const query = useAdminStats();
  // The role home greets the administrator by name, so a successful sign in is visible.
  const session = useSession();
  const welcome = session?.name
    ? MESSAGES.account.welcome(session.name)
    : MESSAGES.account.welcomeGeneric;

  let body;
  if (query.isPending) body = <LoadingState label={DASHBOARD_TEXT.loading} rows={4} />;
  else if (query.isError)
    body = (
      <ErrorState
        error={query.error}
        title={DASHBOARD_TEXT.errorTitle}
        onRetry={() => query.refetch()}
      />
    );
  else body = <Dashboard stats={query.data} />;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-lg font-medium text-text">{welcome}</p>
      <PageHeader
        title={DASHBOARD_TEXT.title}
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
