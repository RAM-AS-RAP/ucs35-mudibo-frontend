import { useWaitingOrdersCount } from '@/api/queries/waitingCount';
import { cn } from '@/lib/utils';

/**
 * A small count next to a navigation label, with an accessible label read as part of the link
 * ("My orders, 2 orders waiting for payment"). Nothing is shown for zero, while loading, or
 * when the request failed.
 * @param {{ count: number | undefined, label: (count: number) => string, compact?: boolean }} props
 */
function CountBadge({ count, label, compact = false }) {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  const shown = count > 99 ? '99+' : String(count);
  return (
    <>
      <span
        aria-hidden="true"
        data-testid="nav-count-badge"
        className={cn(
          'inline-flex min-w-5 items-center justify-center rounded-full border border-card bg-negative-text px-1.5 text-xs leading-5 font-semibold text-on-primary',
          compact ? 'absolute -top-2 -right-3' : 'ml-auto',
        )}
      >
        {shown}
      </span>
      <span className="sr-only">{`, ${label(count)}`}</span>
    </>
  );
}

/**
 * "2 orders waiting for payment". Kept here, not in lib/buyerMessages.js, so the always loaded
 * shell does not pull the buyer screens' text into the initial JavaScript.
 * @param {number} count
 */
export const waitingOrdersLabel = (count) =>
  `${count} ${count === 1 ? 'order' : 'orders'} waiting for payment`;

/** The buyer's "My orders" badge: orders waiting for payment (GET /orders/mine, limit 1). */
function WaitingOrdersBadge({ compact = false }) {
  const count = useWaitingOrdersCount();
  return (
    <CountBadge
      count={count.isSuccess ? count.data : undefined}
      label={waitingOrdersLabel}
      compact={compact}
    />
  );
}

/** Badges a navigation item can show, by the `badge` name in navConfig. */
export const NAV_BADGES = Object.freeze({ waitingOrders: WaitingOrdersBadge });

/**
 * @param {{ kind: keyof typeof NAV_BADGES, compact?: boolean }} props
 */
export function NavBadge({ kind, compact = false }) {
  const Badge = NAV_BADGES[kind];
  return Badge ? <Badge compact={compact} /> : null;
}
