import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { loginAs, logout } from '@/test/render';
import { readMultipart, textFields } from '@/test/multipart';
import { formEntries, spyListingWrites } from '@/test/listings';
import { UPLOAD_TIMEOUT_MS } from '../client';
import { ApiError } from '../errors';
import {
  buildListingForm,
  createListing,
  CREATE_FIELDS,
  getMyListings,
  removeListing,
  updateListing,
  UPDATE_FIELDS,
} from './listings';
import { getMyOrders } from './farmerOrders';

afterEach(() => {
  logout();
  vi.restoreAllMocks();
});

/**
 * Capture the next request to a route and answer it.
 * @param {'post' | 'patch' | 'delete' | 'get'} method
 * @param {string} path
 * @param {() => Response} answer
 */
function capture(method, path, answer) {
  /** @type {{ request: Request | null, parts: import('@/test/multipart').Part[] }} */
  const seen = { request: null, parts: [] };
  server.use(
    http[method](apiUrl(path), async ({ request }) => {
      seen.request = request.clone();
      if ((request.headers.get('Content-Type') ?? '').startsWith('multipart/form-data')) {
        seen.parts = await readMultipart(request);
      }
      return answer();
    }),
  );
  return seen;
}

const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' });

describe('buildListingForm', () => {
  it('includes only allowed, defined fields and never unit, status or farmer_id', () => {
    const form = buildListingForm(
      {
        crop: 'maize',
        market: 'Nairobi',
        quantity_available: '120.5',
        price_per_unit: '42',
        image: undefined,
        unit: 'kg',
        status: 'active',
        farmer_id: 'x',
      },
      CREATE_FIELDS,
    );
    expect([...form.keys()].sort()).toEqual([
      'crop',
      'market',
      'price_per_unit',
      'quantity_available',
    ]);
  });

  it('sends booleans as text and a Blob as a file part', () => {
    const form = buildListingForm({ remove_image: true }, UPDATE_FIELDS);
    expect(form.get('remove_image')).toBe('true');
    const withImage = buildListingForm({ image: jpeg() }, UPDATE_FIELDS);
    const part = withImage.get('image');
    expect(part).toBeInstanceOf(File);
    expect(/** @type {File} */ (part).name).toBe('photo.jpg');
  });
});

describe('createListing (multipart)', () => {
  it('sends multipart/form-data with a boundary set by the browser and string decimals', async () => {
    loginAs('farmer', { token: 'tok-farmer' });
    const seen = capture('post', '/api/v1/listings', () =>
      HttpResponse.json(fixtures.listingCreated, { status: 201 }),
    );
    const listing = await createListing({
      crop: 'maize',
      market: 'Nairobi',
      quantity_available: '100',
      price_per_unit: '42.5',
    });
    expect(listing).toEqual(fixtures.listingCreated);
    expect(seen.request?.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(seen.request?.headers.get('Authorization')).toBe('Bearer tok-farmer');
    expect(textFields(seen.parts)).toEqual({
      crop: 'maize',
      market: 'Nairobi',
      quantity_available: '100',
      price_per_unit: '42.5',
    });
    expect(seen.parts.some((p) => p.name === 'unit')).toBe(false);
  });

  it('adds the photo as a JPEG file part named photo.jpg, with the upload timeout', async () => {
    loginAs('farmer');
    const calls = spyListingWrites();
    /** @type {string | null} */
    let contentType = null;
    server.use(
      // The body is not read here (see src/test/listings.js).
      http.post(apiUrl('/api/v1/listings'), ({ request }) => {
        contentType = request.headers.get('Content-Type');
        return HttpResponse.json(fixtures.listingCreated, { status: 201 });
      }),
    );
    await createListing({
      crop: 'maize',
      market: 'Nairobi',
      quantity_available: '100',
      price_per_unit: '42.5',
      image: jpeg(),
    });
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(calls).toHaveLength(1);
    expect(calls[0].timeoutMs).toBe(UPLOAD_TIMEOUT_MS);
    // An identity serializer: the FormData is sent as it is.
    const form = calls[0].form;
    expect(/** @type {(b: unknown) => unknown} */ (calls[0].serializer)(form)).toBe(form);
    expect(formEntries(form)).toEqual([
      ['crop', 'maize'],
      ['market', 'Nairobi'],
      ['quantity_available', '100'],
      ['price_per_unit', '42.5'],
      ['image', { file: 'photo.jpg', type: 'image/jpeg' }],
    ]);
  });

  it('throws ApiError with the code for 409, 404, 413 and 422', async () => {
    loginAs('farmer');
    for (const [status, code] of [
      [409, 'listing_limit_reached'],
      [404, 'market_not_available'],
      [413, 'image_too_large'],
      [422, 'invalid_image'],
    ]) {
      server.use(
        http.post(apiUrl('/api/v1/listings'), () =>
          errorResponse(/** @type {number} */ (status), /** @type {string} */ (code)),
        ),
      );
      const error = await createListing({
        crop: 'maize',
        market: 'Nairobi',
        quantity_available: '1',
        price_per_unit: '1',
      }).catch((e) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status, code });
    }
  });
});

describe('updateListing (multipart)', () => {
  it('sends only the changed fields to the listing path', async () => {
    loginAs('farmer');
    const id = fixtures.myListingsPage.items[0].id;
    const seen = capture('patch', `/api/v1/listings/${id}`, () =>
      HttpResponse.json(fixtures.myListingsPage.items[0]),
    );
    await updateListing(id, { price_per_unit: '45' });
    expect(seen.request?.url).toBe(apiUrl(`/api/v1/listings/${id}`));
    expect(textFields(seen.parts)).toEqual({ price_per_unit: '45' });
    expect(seen.parts).toHaveLength(1);
  });

  it('sends remove_image as "true"', async () => {
    loginAs('farmer');
    const id = fixtures.myListingsPage.items[0].id;
    const seen = capture('patch', `/api/v1/listings/${id}`, () =>
      HttpResponse.json(fixtures.myListingsPage.items[0]),
    );
    await updateListing(id, { remove_image: true });
    expect(textFields(seen.parts)).toEqual({ remove_image: 'true' });
    expect(seen.parts).toHaveLength(1);
  });
});

describe('removeListing', () => {
  it('sends DELETE and resolves on 204', async () => {
    loginAs('farmer');
    const id = fixtures.myListingsPage.items[0].id;
    const seen = capture(
      'delete',
      `/api/v1/listings/${id}`,
      () => new HttpResponse(null, { status: 204 }),
    );
    await expect(removeListing(id)).resolves.toBeUndefined();
    expect(seen.request?.method).toBe('DELETE');
  });

  it('throws 409 listing_has_pending_orders', async () => {
    loginAs('farmer');
    server.use(
      http.delete(apiUrl('/api/v1/listings/:id'), () =>
        errorResponse(409, 'listing_has_pending_orders'),
      ),
    );
    await expect(removeListing(fixtures.myListingsPage.items[0].id)).rejects.toMatchObject({
      code: 'listing_has_pending_orders',
    });
  });
});

describe('list endpoints', () => {
  it('getMyListings sends status, limit and offset only when given', async () => {
    loginAs('farmer');
    const seen = capture('get', '/api/v1/listings/mine', () =>
      HttpResponse.json(fixtures.myListingsPage),
    );
    await getMyListings({ status: 'sold_out', limit: 20, offset: 40 });
    const url = new URL(/** @type {Request} */ (seen.request).url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'sold_out',
      limit: '20',
      offset: '40',
    });
    await getMyListings();
    expect(new URL(/** @type {Request} */ (seen.request).url).search).toBe('');
  });

  it('getMyOrders maps listingId to listing_id', async () => {
    loginAs('farmer');
    const seen = capture('get', '/api/v1/listings/mine/orders', () =>
      HttpResponse.json(fixtures.farmerOrdersPage),
    );
    const page = await getMyOrders({ status: 'paid', listingId: 'abc', limit: 1 });
    expect(page.note).toBe(fixtures.farmerOrdersPage.note);
    const url = new URL(/** @type {Request} */ (seen.request).url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'paid',
      listing_id: 'abc',
      limit: '1',
    });
  });
});
