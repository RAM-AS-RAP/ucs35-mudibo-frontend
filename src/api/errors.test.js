import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  ApiError,
  ERROR_MESSAGES,
  GENERIC_MESSAGE,
  getUserMessage,
  getUserMessageDetails,
  parseRetryAfter,
} from './errors';

/** Codes from the "Suggested user messages" table in docs/backend/frontend_contract.md. */
function documentedCodes() {
  const md = readFileSync('docs/backend/frontend_contract.md', 'utf8');
  const section = md.split('Suggested user messages')[1].split('Any other code')[0];
  const codes = [];
  for (const line of section.split('\n')) {
    const firstCell = line.split('|')[1];
    if (!firstCell || !firstCell.includes('`')) continue;
    for (const match of firstCell.matchAll(/`([a-z_]+)`/g)) codes.push(match[1]);
  }
  return codes;
}

const err = (code, extra = {}) => new ApiError({ status: 400, code, ...extra });

afterEach(() => vi.useRealTimers());

describe('getUserMessage', () => {
  it('has a message for every code documented in frontend_contract.md', () => {
    const codes = documentedCodes();
    expect(codes.length).toBeGreaterThan(50);
    const missing = codes.filter((code) => !Object.hasOwn(ERROR_MESSAGES, code));
    expect(missing).toEqual([]);
    for (const code of codes) expect(getUserMessage(err(code))).toBeTruthy();
  });

  it('falls back to the generic message for unknown codes and non API errors', () => {
    expect(getUserMessage(err('brand_new_code'))).toBe(GENERIC_MESSAGE);
    expect(getUserMessage(new Error('boom'))).toBe(GENERIC_MESSAGE);
    expect(getUserMessage(undefined)).toBe(GENERIC_MESSAGE);
  });

  it('has client side messages for network_error and timeout', () => {
    expect(getUserMessage(err('network_error'))).toMatch(/internet connection/);
    expect(getUserMessage(err('timeout'))).toMatch(/took too long/);
  });

  it('mentions the Retry-After wait for rate_limited', () => {
    expect(getUserMessage(err('rate_limited', { retryAfter: 30 }))).toBe(
      'Too many attempts. Please wait 30 seconds and try again.',
    );
    expect(getUserMessage(err('rate_limited'))).toBe(ERROR_MESSAGES.rate_limited);
  });

  it('asks to try again shortly for service_unavailable and busy', () => {
    expect(getUserMessage(err('service_unavailable'))).toMatch(/shortly/);
    expect(getUserMessage(err('busy'))).toMatch(/shortly/);
  });

  it('appends the reason for password_too_weak', () => {
    expect(getUserMessage(err('password_too_weak', { reason: 'Add a symbol.' }))).toBe(
      'Choose a stronger password. Add a symbol.',
    );
  });

  it('adds the request id as a Reference detail line', () => {
    const details = getUserMessageDetails(err('internal_error', { requestId: 'req-123' }));
    expect(details.reference).toBe('req-123');
    expect(details.details).toEqual(['Reference: req-123']);
    expect(getUserMessageDetails(err('internal_error')).details).toEqual([]);
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds and HTTP dates', () => {
    expect(parseRetryAfter('45')).toBe(45);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    expect(parseRetryAfter('Thu, 15 Oct 2026 10:01:00 GMT')).toBe(60);
  });
});
