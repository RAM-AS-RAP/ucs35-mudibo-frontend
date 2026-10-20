// Buyer routes and roles (F3): only buyers open the buyer screens, /buyer opens browse, and no
// buyer screen requests prices, forecasts or markets.
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { server } from '@/test/msw/server';
import { loginAs, logout, renderApp } from '@/test/render';
import { expectNoPriceRequests, LISTING_ID, ORDER_ID, recordAll } from '@/test/buyer';
import { ROLE_HOME } from '@/auth/roles';
import { queryClient } from '@/lib/queryClient';

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
});

const BUYER_PATHS = [
  '/buyer',
  '/buyer/browse',
  `/buyer/listings/${LISTING_ID}`,
  '/buyer/orders',
  `/buyer/orders/${ORDER_ID}`,
];

describe('buyer routes', () => {
  it('keeps /buyer as the buyer home, which opens browse (replace)', async () => {
    expect(ROLE_HOME.buyer).toBe('/buyer');
    loginAs('buyer');
    const { router } = renderApp('/buyer');
    expect(
      await screen.findByRole('heading', { name: 'Browse produce', level: 1 }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/buyer/browse');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it.each([
    ['/buyer/browse', 'Browse produce'],
    [`/buyer/listings/${LISTING_ID}`, 'Produce details'],
    ['/buyer/orders', 'My orders'],
    [`/buyer/orders/${ORDER_ID}`, 'Your order'],
  ])('a buyer opens %s and never requests prices, forecasts or markets', async (path, title) => {
    const recorder = recordAll();
    loginAs('buyer');
    renderApp(path);
    expect(
      await screen.findByRole('heading', { name: title, level: 1 }, { timeout: 5000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(recorder.requests.length).toBeGreaterThan(0));
    expectNoPriceRequests(recorder);
    recorder.stop();
  });

  it.each(['farmer', 'admin'])('a %s gets Forbidden on every buyer route', async (role) => {
    for (const path of BUYER_PATHS) {
      loginAs(role);
      const { router, unmount } = renderApp(path);
      expect(
        await screen.findByRole('heading', { name: 'No access' }, { timeout: 5000 }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(path);
      unmount();
      logout();
    }
  });

  it.each(BUYER_PATHS)('sends an anonymous visitor of %s to /login', async (path) => {
    const { router } = renderApp(path);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('shows Browse and My orders in the buyer navigation', async () => {
    loginAs('buyer');
    renderApp('/buyer/orders');
    await screen.findByRole('heading', { name: 'My orders', level: 1 }, { timeout: 5000 });
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Browse' })).toHaveAttribute(
      'href',
      '/buyer/browse',
    );
    expect(within(nav).getByRole('link', { name: /^My orders/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
