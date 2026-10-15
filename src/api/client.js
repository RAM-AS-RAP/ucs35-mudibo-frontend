/**
 * The only HTTP client of the app. Every backend call goes through `api`
 * (from src/api/endpoints/), never through fetch in a screen.
 *
 * Base URL: the API origin only (VITE_API_BASE_URL, for example http://localhost:8000).
 * The paths in docs/backend/openapi.json already start with /api/v1, so the final
 * health URL is http://localhost:8000/api/v1/health with no duplicated prefix.
 */
import createClient from 'openapi-fetch';
import { config } from '@/lib/env';
import * as session from '@/auth/session';
import { ApiError, apiErrorFromResponse } from './errors';

export const DEFAULT_TIMEOUT_MS = 20_000;
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Public auth routes. They never carry an Authorization header, and a 401 from them means
 * "wrong credentials or code", not "session ended", so it never clears the session.
 * GET /auth/me and POST /auth/change-password are not here: they need the token.
 */
export const PUBLIC_AUTH_PATHS = Object.freeze([
  '/api/v1/auth/login',
  '/api/v1/auth/register/farmer',
  '/api/v1/auth/register/buyer',
  '/api/v1/auth/accept-invite',
  '/api/v1/auth/invite/request-code',
  '/api/v1/auth/password-reset/request',
  '/api/v1/auth/password-reset/confirm',
]);

/** @type {(path: string) => void} */
let navigateTo = (path) => {
  if (typeof window !== 'undefined') window.location.assign(path);
};

/**
 * Let the router perform navigations triggered by the API layer (401 and 403 handling).
 * @param {(path: string) => void} fn
 */
export function setNavigator(fn) {
  navigateTo = fn;
}

/** Marks an abort caused by our own timeout, as opposed to a caller's AbortSignal. */
class TimeoutAbort extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'TimeoutAbort';
  }
}

/** @param {Request} request */
function isMultipart(request) {
  return (request.headers.get('Content-Type') ?? '').startsWith('multipart/form-data');
}

/** @type {import('openapi-fetch').Middleware} */
const authMiddleware = {
  onRequest({ request, schemaPath }) {
    if (PUBLIC_AUTH_PATHS.includes(schemaPath)) return request;
    // getToken() returns null for anonymous users and for development fake sessions.
    const token = session.getToken();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
};

/**
 * Timeout with AbortController. Per call override: `api.POST(path, { timeoutMs: 60_000 })`.
 * Multipart uploads default to UPLOAD_TIMEOUT_MS.
 * @param {{ timeoutMs: number, uploadTimeoutMs: number }} defaults
 * @returns {import('openapi-fetch').Middleware}
 */
function timeoutMiddleware({ timeoutMs, uploadTimeoutMs }) {
  return {
    onRequest({ request }) {
      const override = /** @type {Request & { timeoutMs?: unknown }} */ (request).timeoutMs;
      const ms =
        typeof override === 'number' && override > 0
          ? override
          : isMultipart(request)
            ? uploadTimeoutMs
            : timeoutMs;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new TimeoutAbort()), ms);
      const callerSignal = request.signal;
      if (callerSignal) {
        if (callerSignal.aborted) controller.abort(callerSignal.reason);
        else
          callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), {
            once: true,
          });
      }
      controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
      const next = new Request(request, { signal: controller.signal });
      timers.set(next, timer);
      return next;
    },
    onResponse({ request }) {
      clearTimer(request);
    },
    onError({ request }) {
      clearTimer(request);
    },
  };
}

/** @type {WeakMap<Request, ReturnType<typeof setTimeout>>} */
const timers = new WeakMap();
/** @param {Request} request */
function clearTimer(request) {
  const timer = timers.get(request);
  if (timer) clearTimeout(timer);
  timers.delete(request);
}

/** @type {import('openapi-fetch').Middleware} */
const errorMiddleware = {
  async onResponse({ response, schemaPath }) {
    if (response.ok) return undefined;
    /** @type {unknown} */
    let body = null;
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }
    // Response bodies are never logged.
    const error = apiErrorFromResponse(response, body);

    if (response.status === 401 && !PUBLIC_AUTH_PATHS.includes(schemaPath)) {
      session.clear('expired');
      navigateTo('/login');
    } else if (response.status === 403 && error.code === 'password_change_required') {
      session.markPasswordChangeRequired();
      navigateTo('/change-password');
    }
    throw error;
  },
  onError({ error, request }) {
    if (error instanceof ApiError) return error;
    const reason = request.signal?.reason;
    if (error instanceof TimeoutAbort || reason instanceof TimeoutAbort) {
      return new ApiError({ status: 0, code: 'timeout', message: 'Request timed out' });
    }
    if (
      error instanceof Error &&
      error.name === 'AbortError' &&
      !(reason instanceof TimeoutAbort)
    ) {
      // Cancelled by the caller (for example TanStack Query on unmount): keep the AbortError.
      return error;
    }
    return new ApiError({ status: 0, code: 'network_error', message: 'Network request failed' });
  },
};

/**
 * Create an API client. The app uses the shared `api` below; tests may create their own.
 * @param {{ baseUrl?: string, timeoutMs?: number, uploadTimeoutMs?: number }} [options]
 */
export function createApiClient({
  baseUrl = config.apiBaseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  uploadTimeoutMs = UPLOAD_TIMEOUT_MS,
} = {}) {
  /** @type {import('openapi-fetch').Client<import('./schema').paths>} */
  const client = createClient({
    baseUrl,
    // Resolve fetch at call time so test interceptors (MSW) are honoured.
    fetch: (request) => globalThis.fetch(request),
  });
  // onRequest runs in order; onResponse and onError run in reverse order.
  client.use(errorMiddleware, timeoutMiddleware({ timeoutMs, uploadTimeoutMs }), authMiddleware);
  return client;
}

export const api = createApiClient();

/**
 * Return the data of a call or throw. Error responses already throw ApiError in the middleware;
 * this guards against an empty error body slipping through.
 * @template T
 * @param {Promise<{ data?: T, error?: unknown, response: Response }>} call
 * @returns {Promise<T>}
 */
export async function unwrap(call) {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok) throw apiErrorFromResponse(response, error ?? null);
  return /** @type {T} */ (data);
}
