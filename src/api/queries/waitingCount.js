/**
 * The buyer's count of orders waiting for payment, behind the "My orders" navigation badge (F3).
 * In its own module because the always loaded shell uses it: the rest of the buyer hooks stay in
 * the lazily loaded buyer screens.
 */
import { useQuery } from '@tanstack/react-query';
import { getMyOrders } from '../endpoints/orders';
import { queryKeys } from './keys';
import { accountQueryPolicy } from './policy';

/** How many of the buyer's orders wait for payment (limit=1, reading `total`). */
export function useWaitingOrdersCount() {
  return useQuery({
    queryKey: queryKeys.waitingOrdersCount(),
    queryFn: () => getMyOrders({ status: 'pending_payment', limit: 1 }),
    select: (page) => page.total,
    refetchOnWindowFocus: true,
    ...accountQueryPolicy,
  });
}
