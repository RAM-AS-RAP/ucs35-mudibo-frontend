import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** The visible label of each main navigation link (without a count badge). */
function mainNavLabels() {
  const nav = screen.getByRole('navigation', { name: 'Main navigation' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.querySelector('svg + span')?.textContent);
}

describe('AppShell navigation', () => {
  it('shows the farmer only farmer items, with a hamburger menu instead of a bottom bar', () => {
    loginAs('farmer');
    renderShell('/farmer');
    expect(mainNavLabels()).toEqual(labelsOf('farmer'));
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();
    // The farmer has no navigation count, so the button name is the label alone.
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
  });

  it('opens the farmer drawer with all five farmer items', async () => {
    loginAs('farmer');
    const user = userEvent.setup();
    renderShell('/farmer/prices');
    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'AgriSence' });
    expect(within(dialog).getByText('Farmer menu')).toBeInTheDocument();
    const drawer = within(dialog).getByRole('navigation', { name: 'Drawer navigation' });
    expect(
      within(drawer)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(labelsOf('farmer'));
    expect(within(drawer).getByRole('link', { name: 'Prices' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the buyer only buyer items, with a hamburger menu instead of a bottom bar', async () => {
    loginAs('buyer');
    renderShell('/buyer');
    expect(mainNavLabels()).toEqual(['Browse', 'My orders']);
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();
    // The waiting orders count is repeated on the hamburger button while the drawer is closed.
    const menuButton = await screen.findByRole('button', {
      name: /^Open navigation menu ?, 1 order waiting for payment$/,
    });
    expect(within(menuButton).getByTestId('nav-count-badge')).toHaveTextContent('1');
  });

  it('opens the buyer drawer with the buyer items and closes it on navigation', async () => {
    loginAs('buyer');
    const user = userEvent.setup();
    renderShell('/buyer/browse');
    await user.click(screen.getByRole('button', { name: /^Open navigation menu/ }));
    const dialog = await screen.findByRole('dialog', { name: 'AgriSence' });
    expect(within(dialog).getByText('Buyer menu')).toBeInTheDocument();
    const drawer = within(dialog).getByRole('navigation', { name: 'Drawer navigation' });
    expect(
      within(drawer)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['/buyer/browse', '/buyer/orders']);
    await user.click(within(drawer).getByRole('link', { name: /^My orders/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides Invites from an ordinary admin and uses a drawer instead of a bottom bar', () => {
    loginAs('admin');
    renderShell('/admin');
    expect(mainNavLabels()).toEqual(labelsOf('admin').filter((l) => l !== 'Invites'));
    expect(screen.queryByRole('navigation', { name: 'Quick navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Open navigation menu/ })).toBeInTheDocument();
  });

  it('shows Invites to the super admin', () => {
    loginAs('admin');
    setSuperAdmin(true);
    renderShell('/admin');
    expect(mainNavLabels()).toContain('Invites');
  });

  it('labels the admin items Dashboard to Forecast accuracy, with the review count on Orders', async () => {
    loginAs('admin', { isSuperAdmin: true });
    renderShell('/admin');
    expect(mainNavLabels()).toEqual([
      'Dashboard',
      'Users',
      'Invites',
      'Listings',
      'Orders',
      'Payments',
      'Forecast accuracy',
    ]);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(
      await within(nav).findByRole('link', { name: 'Orders, 1 order needs review' }),
    ).toHaveAttribute('href', '/admin/orders');
  });

  it('marks the active item with aria-current', () => {
    loginAs('farmer');
    renderShell('/farmer/prices');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Prices' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('has a skip link, landmarks and an account menu', () => {
    loginAs('buyer');
    renderShell('/buyer');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
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
