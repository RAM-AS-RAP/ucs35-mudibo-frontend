import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { loginAs, logout, renderWithProviders } from '@/test/render';
import { expectNoAxeViolations } from '@/test/axe';
import { setSuperAdmin } from '@/auth/session';
import { AppShell } from './AppShell';
import { NAV_ITEMS } from './navConfig';

afterEach(() => logout());

/** @param {string} path */
function renderShell(path) {
  return renderWithProviders(
    <AppShell>
      <h1>Page</h1>
    </AppShell>,
    { path },
  );
}

const labelsOf = (role) => NAV_ITEMS[role].map((item) => item.label);

function mainNavLabels() {
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('AppShell navigation', () => {
  it('shows the farmer only farmer items, with a bottom bar', () => {
    loginAs('farmer');
    renderShell('/farmer');
    expect(mainNavLabels()).toEqual(labelsOf('farmer'));
    const bottom = screen.getByRole('navigation', { name: 'Quick navigation' });
    expect(within(bottom).getAllByRole('link')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
  });

  it('shows the buyer only buyer items', () => {
    loginAs('buyer');
    renderShell('/buyer');
    expect(mainNavLabels()).toEqual(['Browse', 'My orders']);
  });

  it('hides Invites from an ordinary admin and uses a drawer instead of a bottom bar', () => {
    loginAs('admin');
    renderShell('/admin');
    expect(mainNavLabels()).toEqual(labelsOf('admin').filter((l) => l !== 'Invites'));
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
  });

  it('shows Invites to the super admin', () => {
    loginAs('admin');
    setSuperAdmin(true);
    renderShell('/admin');
    expect(mainNavLabels()).toContain('Invites');
  });

  it('marks the active item with aria-current', () => {
    loginAs('farmer');
    renderShell('/farmer/prices');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Prices' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('has a skip link, landmarks and a logout action', () => {
    loginAs('buyer');
    renderShell('/buyer');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
});

describe('AppShell accessibility', () => {
  for (const role of ['farmer', 'buyer', 'admin']) {
    it(`has no axe violations for ${role}`, async () => {
      loginAs(role);
      const { container } = renderShell(`/${role}`);
      await expectNoAxeViolations(container, { page: true });
    });
  }
});
