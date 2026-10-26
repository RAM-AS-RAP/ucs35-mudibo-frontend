/**
 * Hooks for the administrator screens (F4). Reads are queries (infinite queries with offset
 * pages of 20 for the lists) that refetch when the window regains focus and never poll. Writes
 * use useMutation with writePolicy: never retried automatically. After a successful write the
 * affected lists, the dashboard stats and the review count are refreshed.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createInvite,
  disableUser,
  enableUser,
  getAdminListings,
  getAdminOrder,
  getAdminOrders,
  getAdminPayments,
  getAdminStats,
  getAdminUsers,
  getForecastAccuracy,
  getInvites,
  getPaymentEvents,
  removeListingAsAdmin,
  resendInvite,
  resolveOrder,
  revokeInvite,
  sendTestEmail,
} from '../endpoints/admin';
import { queryKeys } from './keys';
import { nextOffset, PAGE_SIZE } from './listings';
import { accountQueryPolicy, writePolicy } from './policy';

export { useReviewCount } from './reviewCount';

/** @typedef {import('@tanstack/react-query').QueryClient} QueryClient */
/** @typedef {import('../endpoints/admin').AdminUser} AdminUser */
/** @typedef {import('../endpoints/admin').AdminOrderDetail} AdminOrderDetail */
/** @typedef {import('../endpoints/admin').UserRole} UserRole */
/** @typedef {import('../endpoints/admin').InviteStatus} InviteStatus */
/** @typedef {import('../endpoints/admin').ListingStatus} ListingStatus */
/** @typedef {import('../endpoints/admin').OrderStatus} OrderStatus */
/** @typedef {import('../endpoints/admin').PaymentStatus} PaymentStatus */
/** @typedef {import('../endpoints/admin').CropType} CropType */
/** @typedef {import('../endpoints/admin').ForecastHorizon} ForecastHorizon */
/** @typedef {import('../endpoints/admin').PaymentEnvironment} PaymentEnvironment */

/** Every admin read: 30 second stale time, refetch on window focus, no polling. */
const adminReadPolicy = Object.freeze({ ...accountQueryPolicy, refetchOnWindowFocus: true });

const pagedOptions = Object.freeze({
  initialPageParam: 0,
  getNextPageParam: nextOffset,
  ...adminReadPolicy,
});

/** GET /admin/stats (one request for the whole dashboard). */
export function useAdminStats() {
  return useQuery({ queryKey: queryKeys.adminStats(), queryFn: getAdminStats, ...adminReadPolicy });
}

/**
 * GET /admin/users, 20 per page, with the filters in the key (the search as an opaque id).
 * @param {{ role: UserRole | null, isDisabled: boolean | null, q: string | null }} filters
 */
export function useAdminUsers(filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminUsers(filters),
    queryFn: ({ pageParam }) => getAdminUsers({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    ...pagedOptions,
  });
}

/**
 * GET /admin/invites (main administrator), 20 per page.
 * @param {{ status: InviteStatus | null }} filters
 */
export function useAdminInvites(filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminInvites(filters),
    queryFn: ({ pageParam }) => getInvites({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    ...pagedOptions,
  });
}

/**
 * GET /admin/listings, 20 per page.
 * @param {{ status: ListingStatus | null, crop: CropType | null, market: string | null, q: string | null }} filters
 */
export function useAdminListings(filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminListings(filters),
    queryFn: ({ pageParam }) =>
      getAdminListings({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    ...pagedOptions,
  });
}

/**
 * GET /admin/orders, 20 per page, in the order the API returns them.
 * @param {{ status: OrderStatus | null, q: string | null }} filters
 */
export function useAdminOrders(filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminOrders(filters),
    queryFn: ({ pageParam }) => getAdminOrders({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    ...pagedOptions,
  });
}

/**
 * GET /admin/orders/{id} with every payment.
 * @param {string} orderId
 */
export function useAdminOrder(orderId) {
  return useQuery({
    queryKey: queryKeys.adminOrder(orderId),
    queryFn: () => getAdminOrder(orderId),
    enabled: Boolean(orderId),
    ...adminReadPolicy,
  });
}

/**
 * GET /admin/payments, 20 per page. Disabled while the date filter is invalid.
 * @param {{ status: PaymentStatus | null, orderReference: string | null, environment: PaymentEnvironment | null, createdFrom: string | null, createdTo: string | null }} filters
 * @param {{ enabled?: boolean }} [options]
 */
export function useAdminPayments(filters, { enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.adminPayments(filters),
    queryFn: ({ pageParam }) =>
      getAdminPayments({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    enabled,
    ...pagedOptions,
  });
}

/**
 * GET /admin/payments/{id}/events, fetched only once `enabled` (the events dialog is open).
 * @param {string} paymentId
 * @param {boolean} enabled
 */
export function usePaymentEvents(paymentId, enabled) {
  return useQuery({
    queryKey: queryKeys.paymentEvents(paymentId),
    queryFn: () => getPaymentEvents(paymentId),
    enabled: Boolean(paymentId) && enabled,
    ...adminReadPolicy,
  });
}

/**
 * GET /admin/forecast-accuracy, 20 rows per page. The summary and note come with every page;
 * the screen shows those of the first page.
 * @param {{ market: string | null, crop: CropType | null, horizon: ForecastHorizon | null, isBackfill: boolean | null, includePending: boolean }} filters
 */
export function useForecastAccuracy(filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.forecastAccuracy(filters),
    queryFn: ({ pageParam }) =>
      getForecastAccuracy({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    ...pagedOptions,
  });
}

/* Writes. Each one is never retried and refreshes what it changed. */

/**
 * Put a changed user into every cached users page.
 * @param {QueryClient} client
 * @param {AdminUser} user
 */
function storeUser(client, user) {
  client.setQueriesData(
    { queryKey: queryKeys.adminUsersRoot() },
    (/** @type {any} */ data) =>
      data && {
        ...data,
        pages: data.pages.map((/** @type {any} */ page) => ({
          ...page,
          items: page.items.map((/** @type {AdminUser} */ item) =>
            item.id === user.id ? user : item,
          ),
        })),
      },
  );
}

/**
 * Refresh the users lists and the dashboard after a disable or enable.
 * @param {QueryClient} client
 */
export function invalidateUsers(client) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.adminUsersRoot() }),
    client.invalidateQueries({ queryKey: queryKeys.adminStats() }),
  ]);
}

/** PATCH /admin/users/{id}/disable. */
export function useDisableUser() {
  const client = useQueryClient();
  return useMutation({
    /** @param {string} userId */
    mutationFn: (userId) => disableUser(userId),
    ...writePolicy,
    onSuccess: (user) => {
      storeUser(client, user);
      return invalidateUsers(client);
    },
  });
}

/** PATCH /admin/users/{id}/enable. */
export function useEnableUser() {
  const client = useQueryClient();
  return useMutation({
    /** @param {string} userId */
    mutationFn: (userId) => enableUser(userId),
    ...writePolicy,
    onSuccess: (user) => {
      storeUser(client, user);
      return invalidateUsers(client);
    },
  });
}

/** @param {QueryClient} client */
const invalidateInvites = (client) =>
  client.invalidateQueries({ queryKey: queryKeys.adminInvitesRoot() });

/** POST /admin/invites. The variables (name, email) are forgotten when it settles. */
export function useCreateInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createInvite,
    ...writePolicy,
    onSuccess: () => invalidateInvites(client),
  });
}

/** POST /admin/invites/{id}/resend. */
export function useResendInvite() {
  const client = useQueryClient();
  return useMutation({
    /** @param {string} inviteId */
    mutationFn: (inviteId) => resendInvite(inviteId),
    ...writePolicy,
    onSuccess: () => invalidateInvites(client),
  });
}

/** DELETE /admin/invites/{id}. */
export function useRevokeInvite() {
  const client = useQueryClient();
  return useMutation({
    /** @param {string} inviteId */
    mutationFn: (inviteId) => revokeInvite(inviteId),
    ...writePolicy,
    onSuccess: () => invalidateInvites(client),
  });
}

/** POST /admin/email/test. Changes nothing that is cached. */
export function useSendTestEmail() {
  return useMutation({ mutationFn: () => sendTestEmail(), ...writePolicy });
}

/**
 * Refresh everything an order or listing change can affect: the listings, the orders (with the
 * review count), the payments and the dashboard.
 * @param {QueryClient} client
 */
export function invalidateMarketplace(client) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.adminListingsRoot() }),
    client.invalidateQueries({ queryKey: queryKeys.adminOrdersRoot() }),
    client.invalidateQueries({ queryKey: queryKeys.adminPaymentsRoot() }),
    client.invalidateQueries({ queryKey: queryKeys.adminStats() }),
  ]);
}

/** DELETE /admin/listings/{id}: also cancels unpaid orders on it. */
export function useRemoveListingAsAdmin() {
  const client = useQueryClient();
  return useMutation({
    /** @param {string} listingId */
    mutationFn: (listingId) => removeListingAsAdmin(listingId),
    ...writePolicy,
    onSuccess: () => invalidateMarketplace(client),
  });
}

/**
 * POST /admin/orders/{id}/resolve with exactly `{action, note}`. The answer replaces the cached
 * order at once; the lists, payments, stats and review count are refreshed.
 * @param {string} orderId
 */
export function useResolveOrder(orderId) {
  const client = useQueryClient();
  return useMutation({
    /** @param {{ action: 'confirm_sale' | 'void_order', note: string }} resolution */
    mutationFn: (resolution) => resolveOrder(orderId, resolution),
    ...writePolicy,
    onSuccess: (order) => {
      client.setQueryData(queryKeys.adminOrder(orderId), order);
      return invalidateMarketplace(client);
    },
  });
}
