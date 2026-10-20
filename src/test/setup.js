import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw/server';
import { markReachable } from '@/lib/connectivity';
import { RETRY_POLICY } from '@/api/queries/policy';

// Keep the number of retries (tested in src/api/queries) but not the real back off delay.
RETRY_POLICY.baseDelayMs = 1;

// jsdom gaps used by Radix UI and layout code.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
// Object URLs for photo previews (jsdom has none). Tests spy on these to check revocation.
if (!URL.createObjectURL) {
  let next = 0;
  URL.createObjectURL = () => `blob:test-${(next += 1)}`;
}
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.sessionStorage.clear();
  markReachable();
});
afterAll(() => server.close());
