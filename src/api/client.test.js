import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { loginAs } from '@/test/render';
import { config } from '@/lib/env';
import * as session from '@/auth/session';
import { api, createApiClient, setNavigator, unwrap } from './client';
import { ApiError } from './errors';
import { getHealth } from './endpoints';

const TOKEN = 'secret-looking-test-token-123';
const BODY_SECRET = 'body-content-that-must-not-be-logged';

/** Record the Authorization header and URL of the next request to a path. */
function captureRequest(path, method = 'get') {
  const seen = { url: '', authorization: /** @type {string | null} */ (null) };
  server.use(
    http[method](apiUrl(path), ({ request }) => {
      seen.url = request.url;
      seen.authorization = request.headers.get('Authorization');
      return HttpResponse.json({ status: 'ok' });
    }),
  );
  return seen;
}

/** @type {Record<string, import('vitest').MockInstance>} */
let consoleSpies = {};
let navigate = vi.fn();

beforeEach(() => {
  consoleSpies = Object.fromEntries(
    ['log', 'info', 'warn', 'error', 'debug'].map((m) => [m, vi.spyOn(console, m)]),
  );
  navigate = vi.fn();
  setNavigator(navigate);
});

afterEach(() => {
  // No token or response body may ever reach the console.
  for (const spy of Object.values(consoleSpies)) {
    const output = JSON.stringify(spy.mock.calls);
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain(BODY_SECRET);
    spy.mockRestore();
  }
  session.clear('logout');
});

describe('base URL and prefix', () => {
  it('uses the API origin as base URL, so the health URL has a single /api/v1 prefix', async () => {
    expect(config.apiBaseUrl).toBe('http://localhost:8000');
    const seen = captureRequest('/api/v1/health');
    await getHealth();
    expect(seen.url).toBe('http://localhost:8000/api/v1/health');
  });
});

describe('Authorization header', () => {
  it('adds the bearer token for a real session', async () => {
    loginAs('farmer', { token: TOKEN });
    const seen = captureRequest('/api/v1/health');
    await getHealth();
    expect(seen.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('omits the header for anonymous calls', async () => {
    const seen = captureRequest('/api/v1/health');
    await getHealth();
    expect(seen.authorization).toBeNull();
  });

  it('omits the header for a development fake session', async () => {
    session.startDevFakeSession({ role: 'admin' });
    expect(session.getSession()?.isDevFake).toBe(true);
    const seen = captureRequest('/api/v1/health');
    await getHealth();
    expect(seen.authorization).toBeNull();
  });
});

describe('error parsing', () => {
  it('turns the error body into an ApiError with every field', async () => {
    server.use(
      http.get(apiUrl('/api/v1/health'), () =>
        errorResponse(429, 'rate_limited', {
          message: BODY_SECRET,
          requestId: '6f1c0e8a-2b44-4c55-9a1e-6c2f8d0b7e11',
          headers: { 'Retry-After': '30' },
          extra: { reason: 'too_fast' },
        }),
      ),
    );
    const error = await getHealth().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: 'rate_limited',
      message: BODY_SECRET,
      reason: 'too_fast',
      requestId: '6f1c0e8a-2b44-4c55-9a1e-6c2f8d0b7e11',
      retryAfter: 30,
    });
  });

  it('reads the request id from the X-Request-ID header when the body has none', async () => {
    server.use(
      http.get(apiUrl('/api/v1/health'), () =>
        HttpResponse.json(
          { error: { code: 'internal_error', message: 'Oops.' } },
          { status: 500, headers: { 'X-Request-ID': 'header-request-id' } },
        ),
      ),
    );
    const error = await getHealth().catch((e) => e);
    expect(error.requestId).toBe('header-request-id');
    expect(error.retryAfter).toBeNull();
  });

  it('parses Retry-After on 503', async () => {
    server.use(
      http.get(apiUrl('/api/v1/health'), () =>
        errorResponse(503, 'busy', { headers: { 'Retry-After': '120' } }),
      ),
    );
    const error = await getHealth().catch((e) => e);
    expect(error.code).toBe('busy');
    expect(error.retryAfter).toBe(120);
  });

  it('handles a non JSON error body', async () => {
    server.use(
      http.get(apiUrl('/api/v1/health'), () => new HttpResponse('Bad gateway', { status: 502 })),
    );
    const error = await getHealth().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe('http_error');
  });

  it('maps a network failure to network_error', async () => {
    server.use(http.get(apiUrl('/api/v1/health'), () => HttpResponse.error()));
    const error = await getHealth().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('network_error');
    expect(error.status).toBe(0);
  });

  it('maps a timeout to timeout', async () => {
    server.use(
      http.get(apiUrl('/api/v1/health'), async () => {
        await delay(500);
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    const client = createApiClient({ timeoutMs: 50 });
    const error = await unwrap(client.GET('/api/v1/health')).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('timeout');
  });

  it('gives multipart uploads the longer upload timeout', async () => {
    server.use(
      http.post(apiUrl('/api/v1/listings'), async () => {
        await delay(150);
        return HttpResponse.json({ id: 'x' }, { status: 201 });
      }),
    );
    const client = createApiClient({ timeoutMs: 50, uploadTimeoutMs: 2_000 });
    const form = new FormData();
    form.set('crop', 'maize');
    const data = await unwrap(
      client.POST('/api/v1/listings', {
        body: /** @type {any} */ (form),
        bodySerializer: (b) => b,
      }),
    );
    expect(data).toEqual({ id: 'x' });
  });

  it('accepts a per call timeout', async () => {
    server.use(
      http.get(apiUrl('/api/v1/health'), async () => {
        await delay(150);
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    const client = createApiClient({ timeoutMs: 50 });
    await expect(unwrap(client.GET('/api/v1/health', { timeoutMs: 2_000 }))).resolves.toEqual({
      status: 'ok',
    });
  });
});

describe('401 and 403 handling', () => {
  it('clears the session and goes to /login on a 401 from a protected route', async () => {
    loginAs('farmer', { token: TOKEN });
    server.use(
      http.get(apiUrl('/api/v1/auth/me'), () => errorResponse(401, 'invalid_credentials')),
    );
    const error = await unwrap(api.GET('/api/v1/auth/me')).catch((e) => e);
    expect(error.status).toBe(401);
    expect(session.getSession()).toBeNull();
    expect(session.getLastClearReason()).toBe('expired');
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('does not clear the session or navigate on a 401 from the login route', async () => {
    loginAs('farmer', { token: TOKEN });
    server.use(
      http.post(apiUrl('/api/v1/auth/login'), () =>
        errorResponse(401, 'invalid_credentials', { message: BODY_SECRET }),
      ),
    );
    const error = await unwrap(
      api.POST('/api/v1/auth/login', { body: { email: 'wanjiku@example.com', password: 'x' } }),
    ).catch((e) => e);
    expect(error.code).toBe('invalid_credentials');
    expect(session.getSession()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('marks the session and goes to /change-password on 403 password_change_required', async () => {
    loginAs('buyer', { token: TOKEN });
    server.use(
      http.get(apiUrl('/api/v1/orders/mine'), () => errorResponse(403, 'password_change_required')),
    );
    const error = await unwrap(api.GET('/api/v1/orders/mine')).catch((e) => e);
    expect(error.code).toBe('password_change_required');
    expect(session.getSession()?.mustChangePassword).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/change-password');
  });

  it('does not navigate on an ordinary 403', async () => {
    loginAs('buyer', { token: TOKEN });
    server.use(http.get(apiUrl('/api/v1/markets'), () => errorResponse(403, 'forbidden')));
    const error = await unwrap(api.GET('/api/v1/markets')).catch((e) => e);
    expect(error.code).toBe('forbidden');
    expect(session.getSession()?.mustChangePassword).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
