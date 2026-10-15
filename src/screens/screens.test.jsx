import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http } from 'msw';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { expectNoAxeViolations } from '@/test/axe';
import { loginAs, logout, renderApp } from '@/test/render';
import { queryClient } from '@/lib/queryClient';
import ConfigErrorScreen from './shared/ConfigErrorScreen';

afterEach(() => {
  logout();
  queryClient.clear();
});

const PUBLIC_SCREENS = [
  ['/login', 'Log in'],
  ['/register', 'Create an account'],
  ['/forgot-password', 'Forgot your password?'],
  ['/reset-password', 'Reset your password'],
  ['/accept-invite', 'Accept your invitation'],
];

describe('placeholder screens', () => {
  it.each(PUBLIC_SCREENS)(
    '%s says which module builds it and has no axe violations',
    async (path, heading) => {
      const { container } = renderApp(path);
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
      expect(
        screen.getByText('This screen is built in module F1 (authentication).'),
      ).toBeInTheDocument();
      expect(container.querySelector('form')).toBeNull();
      await expectNoAxeViolations(container, { page: true });
    },
  );

  it('/change-password is accessible and offers logout', async () => {
    loginAs('farmer', { mustChangePassword: true });
    const { container } = renderApp('/change-password');
    expect(
      await screen.findByRole('heading', { name: 'Change your password' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    await expectNoAxeViolations(container, { page: true });
  });

  it.each([
    ['farmer', 'F2 (farmer)'],
    ['buyer', 'F3 (buyer)'],
    ['admin', 'F4 (admin)'],
  ])('%s home renders ComingSoon inside the shell without axe violations', async (role, module) => {
    loginAs(role);
    const { container } = renderApp(`/${role}`);
    expect(
      await screen.findByText(`This screen is built in module ${module}.`),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container, { page: true });
  });

  it('Forbidden and NotFound have no axe violations', async () => {
    loginAs('farmer');
    const forbidden = renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    await expectNoAxeViolations(forbidden.container, { page: true });
    forbidden.unmount();

    const notFound = renderApp('/missing');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    await expectNoAxeViolations(notFound.container, { page: true });
  });

  it('the configuration error screen lists the problems', async () => {
    const { container } = render(<ConfigErrorScreen errors={['VITE_API_BASE_URL is not set.']} />);
    expect(screen.getByRole('heading', { name: 'Configuration error' })).toBeInTheDocument();
    expect(screen.getByText('VITE_API_BASE_URL is not set.')).toBeInTheDocument();
    await expectNoAxeViolations(container, { page: true });
  });
});

describe('API status on the login screen (development)', () => {
  it('shows API and database as OK from the health endpoints', async () => {
    renderApp('/login');
    expect(await screen.findByText('API: OK')).toBeInTheDocument();
    expect(await screen.findByText('Database: OK')).toBeInTheDocument();
  });

  it('shows unreachable when the database check fails', async () => {
    server.use(
      http.get(apiUrl('/api/v1/health/db'), () => errorResponse(503, 'service_unavailable')),
    );
    renderApp('/login');
    expect(await screen.findByText('Database: unreachable')).toBeInTheDocument();
    expect(await screen.findByText('API: OK')).toBeInTheDocument();
  });
});
