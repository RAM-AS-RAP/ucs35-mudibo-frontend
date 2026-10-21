/**
 * Hooks for the farmer's listings and the orders on them (F2b). Reads use infinite queries with
 * offset pages; writes use useMutation and are never retried automatically.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../errors';
import {
  createListing,
  getMyListing,
  getMyListings,
  getMyOrders,
  removeListing,
  updateListing,
} from '../endpoints';
import { queryKeys } from './keys';
import { accountQueryPolicy, writePolicy } from './policy';

/** @typedef {import('../endpoints/listings').Listing} Listing */
/** @typedef {import('../endpoints/listings').ListingPage} ListingPage */
/** @typedef {import('../endpoints/listings').ListingStatus} ListingStatus */
/** @typedef {import('../endpoints/farmerOrders').OrderStatus} OrderStatus */
/** @typedef {import('@tanstack/react-query').QueryClient} QueryClient */
/** @typedef {import('@tanstack/react-query').InfiniteData<ListingPage>} ListingPages */

export const PAGE_SIZE = 20;

/**
 * The offset of the next page, or undefined when every item is loaded.
 * @param {{ items: unknown[], total: number, offset: number }} last
 */
export function nextOffset(last) {
  const loaded = last.offset + last.items.length;
  return last.items.length > 0 && loaded < last.total ? loaded : undefined;
}

/**
 * GET /listings/mine as an infinite query, 20 per page, filtered by status (null for all).
 * @param {{ status: ListingStatus | null }} params
 */
export function useMyListings({ status }) {
  return useInfiniteQuery({
    queryKey: queryKeys.myListings({ status }),
    queryFn: ({ pageParam }) => getMyListings({ status, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    ...accountQueryPolicy,
  });
}

/**
 * A listing already in any cached page of the farmer's listings.
 * @param {QueryClient} client
 * @param {string} id
 * @returns {Listing | undefined}
 */
export function findCachedListing(client, id) {
  const lists = client.getQueriesData({ queryKey: [...queryKeys.myListingsRoot(), 'list'] });
  for (const [, data] of lists) {
    const pages = /** @type {ListingPages | undefined} */ (data)?.pages ?? [];
    for (const page of pages) {
      const found = page.items.find((item) => item.id === id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * GET /listings/mine/{id}, with a 404 listing_not_found turned into null (the listing does not
 * exist or is not this farmer's). Every other error is thrown.
 * @param {string} id
 * @returns {Promise<Listing | null>}
 */
export async function fetchMyListing(id) {
  try {
    return await getMyListing(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === 'listing_not_found') {
      return null;
    }
    throw error;
  }
}

/**
 * One of the farmer's listings for the edit screen: data is the listing, or null when it was
 * not found. A listing already in a cached page shows at once.
 * @param {string} id
 */
export function useMyListing(id) {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.myListing(id),
    queryFn: () => fetchMyListing(id),
    initialData: () => findCachedListing(client, id),
    ...accountQueryPolicy,
  });
}

/**
 * GET /listings/mine/orders as an infinite query. `status` is one order status or null.
 * Refetches when the window regains focus; never polls.
 * @param {{ status: OrderStatus | null, listingId: string | null }} params
 */
export function useMyOrders({ status, listingId }) {
  return useInfiniteQuery({
    queryKey: queryKeys.myOrders({ status, listingId }),
    queryFn: ({ pageParam }) =>
      getMyOrders({ status, listingId, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    refetchOnWindowFocus: true,
    ...accountQueryPolicy,
  });
}

/**
 * How many listings have a status (one request with limit=1, reading `total`).
 * @param {ListingStatus} status
 */
export function useMyListingCount(status) {
  return useQuery({
    queryKey: queryKeys.myListingCount({ status }),
    queryFn: () => getMyListings({ status, limit: 1 }),
    select: (page) => page.total,
    ...accountQueryPolicy,
  });
}

/**
 * How many orders on the farmer's listings have a status (limit=1, reading `total`).
 * @param {OrderStatus} status
 */
export function useMyOrderCount(status) {
  return useQuery({
    queryKey: queryKeys.myOrderCount({ status }),
    queryFn: () => getMyOrders({ status, limit: 1 }),
    select: (page) => page.total,
    ...accountQueryPolicy,
  });
}

/**
 * Put a changed listing into every cached page and its own entry.
 * @param {QueryClient} client
 * @param {Listing} listing
 */
function storeListing(client, listing) {
  client.setQueryData(queryKeys.myListing(listing.id), listing);
  client.setQueriesData(
    { queryKey: [...queryKeys.myListingsRoot(), 'list'] },
    (/** @type {ListingPages | undefined} */ data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === listing.id ? listing : item)),
        })),
      },
  );
}

/**
 * Refresh the listings, the orders and the dashboard counts after a write. `skipListing` keeps
 * that one listing's entry as it is (the edit screen leaving a listing that was not found should
 * not fetch it again).
 * @param {QueryClient} client
 * @param {{ skipListing?: string }} [options]
 */
export function invalidateListingData(client, { skipListing } = {}) {
  const skipped =
    skipListing === undefined ? null : JSON.stringify(queryKeys.myListing(skipListing));
  return Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.myListingsRoot(),
      predicate: (query) => skipped === null || JSON.stringify(query.queryKey) !== skipped,
    }),
    client.invalidateQueries({ queryKey: queryKeys.myOrdersRoot() }),
  ]);
}

/** POST /listings. Never retried automatically. */
export function useCreateListing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createListing,
    ...writePolicy,
    onSuccess: () => invalidateListingData(client),
  });
}

/** PATCH /listings/{id} with only the changed fields. Never retried automatically. */
export function useUpdateListing() {
  const client = useQueryClient();
  return useMutation({
    /** @param {{ id: string, changes: import('../endpoints/listings').ListingChanges }} vars */
    mutationFn: ({ id, changes }) => updateListing(id, changes),
    ...writePolicy,
    onSuccess: (listing) => {
      storeListing(client, listing);
      return invalidateListingData(client);
    },
  });
}

/** DELETE /listings/{id}. Never retried automatically. */
export function useRemoveListing() {
  const client = useQueryClient();
  return useMutation({
    /** @param {string} id */
    mutationFn: (id) => removeListing(id),
    ...writePolicy,
    onSuccess: () => invalidateListingData(client),
  });
}
