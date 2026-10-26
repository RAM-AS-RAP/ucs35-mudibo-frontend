// The "Number entered" column (identity v2, prompt 2) on the admin payments list and on the
// payments of the admin order detail: phone_masked as the server returns it, "Not recorded" when
// it is null, in the table and in the stacked cards.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { server } from '@/test/msw/server';
import { fixtures } from '@/test/fixtures';
import { expectNoAxeViolations } from '@/test/axe';
import { logout } from '@/test/render';
import { renderAdmin, rowOf, setWideScreen, waitForScreen } from '@/test/admin';
import { queryClient } from '@/lib/queryClient';

afterEach(() => {
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

const [withNumber, withoutNumber] = fixtures.adminPaymentsPage.items;
const DETAIL = fixtures.adminOrderDetail;

/** Wait for the row or card of an item. @param {string} id */
const findRow = (id) =>
  waitFor(
    () => {
      const row = rowOf(id);
      expect(row).not.toBeNull();
      return row;
    },
    { timeout: 5000 },
  );

/**
 * The cell of a column in a table row, found through the column header's position.
 * @param {HTMLElement} row
 * @param {string} header
 */
function cellOf(row, header) {
  const table = /** @type {HTMLTableElement} */ (row.closest('table'));
  const headers = within(table).getAllByRole('columnheader');
  const index = headers.findIndex((th) => th.textContent === header);
  expect(index).toBeGreaterThanOrEqual(0);
  return /** @type {HTMLElement} */ (row.children[index]);
}

describe('admin payments: Number entered', () => {
  it('shows phone_masked next to the prompt target in the table, and "Not recorded" for null', async () => {
    setWideScreen(true);
    renderAdmin('/admin/payments');
    await waitForScreen('Payments', 'Loading payments…');
    const row = await findRow(withNumber.id);
    expect(row.closest('[data-layout="table"]')).not.toBeNull();
    const headers = within(/** @type {HTMLElement} */ (row.closest('table')))
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers.indexOf('Number entered') + 1).toBe(headers.indexOf('Phone (masked)'));
    expect(cellOf(row, 'Number entered')).toHaveTextContent(/^2547\*{5}678$/);
    expect(cellOf(rowOf(withoutNumber.id), 'Number entered')).toHaveTextContent(/^Not recorded$/);
    await expectNoAxeViolations(document.body, { page: true });
  });

  it('shows the same values in the stacked cards', async () => {
    setWideScreen(false);
    renderAdmin('/admin/payments');
    await waitForScreen('Payments', 'Loading payments…');
    const card = await findRow(withNumber.id);
    expect(card.closest('[data-layout="table"]')).toBeNull();
    expect(card).toHaveTextContent('Number entered2547*****678');
    expect(rowOf(withoutNumber.id)).toHaveTextContent('Number enteredNot recorded');
    await expectNoAxeViolations(document.body, { page: true });
  });
});

describe('admin order detail: Number entered', () => {
  const [nullPayment, recordedPayment] = DETAIL.payments;

  async function openDetail() {
    renderAdmin(`/admin/orders/${DETAIL.id}`);
    await screen.findByRole('heading', { level: 1, name: /^Order AGR-/ }, { timeout: 5000 });
  }

  it('shows phone_masked and "Not recorded" in the payments table', async () => {
    setWideScreen(true);
    await openDetail();
    const row = await findRow(recordedPayment.id);
    expect(row.closest('[data-layout="table"]')).not.toBeNull();
    expect(cellOf(row, 'Number entered')).toHaveTextContent(/^2547\*{5}678$/);
    expect(cellOf(rowOf(nullPayment.id), 'Number entered')).toHaveTextContent(/^Not recorded$/);
    await expectNoAxeViolations(document.body, { page: true });
  });

  it('shows the same values in the stacked cards', async () => {
    setWideScreen(false);
    await openDetail();
    const card = await findRow(recordedPayment.id);
    expect(card.closest('[data-layout="table"]')).toBeNull();
    expect(card).toHaveTextContent('Number entered2547*****678');
    expect(rowOf(nullPayment.id)).toHaveTextContent('Number enteredNot recorded');
    await expectNoAxeViolations(document.body, { page: true });
  });
});
