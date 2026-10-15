import { http, HttpResponse } from 'msw';
import { fixtures } from '../fixtures';

export const API_ORIGIN = 'http://localhost:8000';

/** @param {string} path a path from openapi.json, for example /api/v1/health */
export const apiUrl = (path) => `${API_ORIGIN}${path}`;

/**
 * An error response in the backend's envelope.
 * @param {number} status
 * @param {string} code
 * @param {{ message?: string, requestId?: string, headers?: Record<string, string>, extra?: Record<string, unknown> }} [options]
 */
export function errorResponse(
  status,
  code,
  { message = 'Error.', requestId, headers = {}, extra = {} } = {},
) {
  return HttpResponse.json(
    { error: { code, message, ...(requestId ? { request_id: requestId } : {}), ...extra } },
    { status, headers: { ...(requestId ? { 'X-Request-ID': requestId } : {}), ...headers } },
  );
}

export const handlers = [
  http.get(apiUrl('/api/v1/health'), () => HttpResponse.json(fixtures.health)),
  http.get(apiUrl('/api/v1/health/db'), () => HttpResponse.json(fixtures.dbHealth)),
];
