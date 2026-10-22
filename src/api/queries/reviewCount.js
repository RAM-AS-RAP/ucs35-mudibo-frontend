/**
 * How many orders need an administrator's review, behind the "Orders" navigation badge (F4).
 * In its own module because the always loaded shell uses it: the other admin hooks stay in the
 * lazily loaded admin screens.
 */
import { useQuery } from '@tanstack/react-query';
import { getAdminOrders } from '../endpoints/admin';
import { queryKeys } from './keys';
import { accountQueryPolicy } from './policy';

/** GET /admin/orders?status=needs_reconciliation&limit=1, reading `total`. Never polls. */
export function useReviewCount() {
  return useQuery({
    queryKey: queryKeys.adminReviewCount(),
    queryFn: () => getAdminOrders({ status: 'needs_reconciliation', limit: 1 }),
    select: (page) => page.total,
    refetchOnWindowFocus: true,
    ...accountQueryPolicy,
  });
}
