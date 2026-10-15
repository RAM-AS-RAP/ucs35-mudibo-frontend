import { api, unwrap } from '../client';

/** @typedef {import('../schema').paths['/api/v1/health']['get']['responses'][200]['content']['application/json']} HealthResponse */
/** @typedef {import('../schema').paths['/api/v1/health/db']['get']['responses'][200]['content']['application/json']} DbHealthResponse */

/**
 * GET /api/v1/health (public).
 * @returns {Promise<HealthResponse>}
 */
export function getHealth() {
  return unwrap(api.GET('/api/v1/health'));
}

/**
 * GET /api/v1/health/db (public).
 * @returns {Promise<DbHealthResponse>}
 */
export function getDbHealth() {
  return unwrap(api.GET('/api/v1/health/db'));
}
