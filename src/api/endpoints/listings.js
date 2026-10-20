import { api, unwrap, UPLOAD_TIMEOUT_MS } from '../client';

/** @typedef {import('../schema').components['schemas']} Schemas */
/** @typedef {Schemas['ListingStatus']} ListingStatus */
/** @typedef {Schemas['CropType']} CropType */

/**
 * A listing as the backend returns it. ListingOut in openapi.json names the fields without
 * types, so they are described here. Money and quantities are JSON numbers with 2 decimals.
 * @typedef {object} Listing
 * @property {string} id
 * @property {string} farmer_id
 * @property {CropType} crop
 * @property {string} market
 * @property {number} quantity_available  available now (orders waiting for payment are taken out)
 * @property {string} unit
 * @property {number} price_per_unit  KES per kg
 * @property {string | null} image_url
 * @property {ListingStatus} status
 * @property {string} created_at
 * @property {string} updated_at
 */

/** @typedef {{ items: Listing[], total: number, limit: number, offset: number }} ListingPage */

/**
 * @typedef {object} NewListingFields
 * @property {CropType} crop
 * @property {string} market
 * @property {string} quantity_available  a normalised decimal string ("120.5")
 * @property {string} price_per_unit  a normalised decimal string ("42")
 * @property {Blob} [image]  a JPEG prepared by lib/image.js
 */

/**
 * @typedef {object} ListingChanges  only the fields that changed
 * @property {string} [quantity_available]
 * @property {string} [price_per_unit]
 * @property {Blob} [image]
 * @property {boolean} [remove_image]
 */

/** The multipart fields each write route accepts (Body_* schemas in openapi.json). */
export const CREATE_FIELDS = Object.freeze([
  'crop',
  'market',
  'quantity_available',
  'price_per_unit',
  'image',
]);
export const UPDATE_FIELDS = Object.freeze([
  'quantity_available',
  'price_per_unit',
  'image',
  'remove_image',
]);

/**
 * Build a multipart body from a plain object: only the allowed names, only defined values.
 * Decimals are already strings; booleans become "true"/"false"; a Blob is sent as a file part
 * named photo.jpg. `unit` is never sent: the server defaults it to kg, the only unit.
 * @param {Record<string, unknown>} fields
 * @param {readonly string[]} allowed
 */
export function buildListingForm(fields, allowed) {
  const form = new FormData();
  for (const name of allowed) {
    const value = fields[name];
    if (value === undefined || value === null) continue;
    if (value instanceof Blob) {
      form.append(name, value, value instanceof File ? value.name : 'photo.jpg');
    } else if (typeof value === 'boolean') {
      form.append(name, value ? 'true' : 'false');
    } else {
      form.append(name, String(value));
    }
  }
  return form;
}

/**
 * Send a FormData body as it is: no JSON serialisation and no Content-Type header, so the
 * browser writes the multipart boundary itself. Uploads get the longer upload timeout.
 * @param {FormData} form
 */
function multipart(form) {
  return {
    body: /** @type {any} */ (form),
    bodySerializer: (/** @type {unknown} */ body) => body,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  };
}

/**
 * GET /api/v1/listings/mine (farmer): the farmer's own listings, newest first. Removed listings
 * are included unless `status` filters them out.
 * @param {{ status?: ListingStatus | null, limit?: number, offset?: number }} [params]
 * @returns {Promise<ListingPage>}
 */
export async function getMyListings({ status, limit, offset } = {}) {
  const query = {
    ...(status ? { status } : {}),
    ...(limit === undefined ? {} : { limit }),
    ...(offset === undefined ? {} : { offset }),
  };
  const page = await unwrap(api.GET('/api/v1/listings/mine', { params: { query } }));
  return /** @type {ListingPage} */ (/** @type {unknown} */ (page));
}

/**
 * POST /api/v1/listings (farmer, multipart). Errors: 409 listing_limit_reached,
 * 404 market_not_available, 422 validation_error or invalid_image, 413 image_too_large.
 * @param {NewListingFields} fields
 * @returns {Promise<Listing>}
 */
export async function createListing(fields) {
  const form = buildListingForm(fields, CREATE_FIELDS);
  const listing = await unwrap(api.POST('/api/v1/listings', multipart(form)));
  return /** @type {Listing} */ (/** @type {unknown} */ (listing));
}

/**
 * PATCH /api/v1/listings/{listing_id} (farmer, multipart). Send only the changed fields.
 * Errors: 404 listing_not_found, 409 listing_removed, 422 no_changes or validation_error.
 * @param {string} id
 * @param {ListingChanges} changes
 * @returns {Promise<Listing>}
 */
export async function updateListing(id, changes) {
  const form = buildListingForm(changes, UPDATE_FIELDS);
  const listing = await unwrap(
    api.PATCH('/api/v1/listings/{listing_id}', {
      params: { path: { listing_id: id } },
      ...multipart(form),
    }),
  );
  return /** @type {Listing} */ (/** @type {unknown} */ (listing));
}

/**
 * DELETE /api/v1/listings/{listing_id} (farmer): a soft remove, 204 also when already removed.
 * Errors: 409 listing_has_pending_orders, 404 listing_not_found.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function removeListing(id) {
  await unwrap(
    api.DELETE('/api/v1/listings/{listing_id}', { params: { path: { listing_id: id } } }),
  );
}
