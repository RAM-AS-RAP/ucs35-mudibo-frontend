// Helpers for the administrator screen tests (F4).
import { expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { fixtures } from './fixtures';
import { loginAs, renderApp } from './render';

/** The main administrator's row in fixtures.adminUsersPage. */
export const SUPER_ADMIN = fixtures.adminUsersPage.items[0];
/** An ordinary administrator's row. */
export const ORDINARY_ADMIN = fixtures.adminUsersPage.items[1];

/**
 * Sign in as an administrator (with the profile id, as after a real sign in) and render the
 * real route table at `path`. By default the main administrator.
 * @param {string} path
 * @param {{ superAdmin?: boolean }} [options]
 */
export function renderAdmin(path, { superAdmin = true } = {}) {
  const self = superAdmin ? SUPER_ADMIN : ORDINARY_ADMIN;
  loginAs('admin', { isSuperAdmin: superAdmin, userId: self.id, name: self.name });
  return renderApp(path);
}

/**
 * Render the wide layout (tables, 1280 px and up) instead of the stacked cards. Undo with
 * vi.restoreAllMocks().
 * @param {boolean} wide
 */
export function setWideScreen(wide) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      /** @type {MediaQueryList} */ ({
        matches: wide && query.includes('min-width'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
  );
}

/**
 * Wait for an admin screen's heading and for its loading state to end.
 * @param {string} heading
 * @param {string} [loading]  the loading label of the screen
 */
export async function waitForScreen(heading, loading) {
  await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 5000 });
  if (loading) {
    await waitFor(() => expect(screen.queryByText(loading)).not.toBeInTheDocument(), {
      timeout: 5000,
    });
  }
}

/**
 * The row or card of an item (ResponsiveTable sets data-row-id).
 * @param {string} id
 */
export const rowOf = (id) =>
  /** @type {HTMLElement} */ (document.querySelector(`[data-row-id="${id}"]`));
