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

describe('role homes and shared screens', () => {
  it('the admin home is the dashboard inside the shell, without axe violations', async () => {
    loginAs('admin');
    const { container } = renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    // The F0 placeholder is gone.
    expect(screen.queryByText(/This screen is built in module/)).toBeNull();
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
