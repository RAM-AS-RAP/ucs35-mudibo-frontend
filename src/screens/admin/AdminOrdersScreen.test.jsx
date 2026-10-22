import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '@/test/msw/server';
import { apiUrl, errorResponse } from '@/test/msw/handlers';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { renderAdmin, rowOf, setWideScreen, waitForScreen } from '@/test/admin';
import { queryClient } from '@/lib/queryClient';

vi.mock('sonner', async (importOriginal) => {
  const actual = /** @type {typeof import('sonner')} */ (await importOriginal());
  return { ...actual, toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) };
});

/** @type {ReturnType<typeof recordAll>} */
let recorder;
beforeEach(() => {
  recorder = recordAll();
});
afterEach(() => {
  recorder.stop();
  logout();
  queryClient.clear();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const orders = fixtures.adminOrdersPage.items;
const REVIEW = fixtures.adminOrderDetail;
const listRequests = () =>
  recorder
    .of('GET', '/api/v1/admin/orders')
    .filter((r) => r.query.limit === '20')
    .map((r) => r.query);

async function openOrders(path = '/admin/orders') {
  const utils = renderAdmin(path);
  await waitForScreen('Orders', 'Loading orders…');
  return utils;
}

async function openDetail(id = REVIEW.id) {
  const utils = renderAdmin(`/admin/orders/${id}`);
  await screen.findByRole('heading', { level: 1, name: /^Order AGR-/ }, { timeout: 5000 });
  return utils;
}

describe('AdminOrdersScreen', () => {
  it.each([
    ['Needs review', 'needs_reconciliation'],
    ['Waiting for payment', 'pending_payment'],
    ['Paid', 'paid'],
    ['Expired', 'expired'],
    ['Cancelled', 'cancelled'],
    ['Failed', 'payment_failed'],
  ])('the "%s" chip sends status=%s only', async (label, status) => {
    const user = userEvent.setup();
    const { router } = await openOrders();
    await user.click(screen.getByRole('radio', { name: label }));
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({ status, limit: '20', offset: '0' }),
    );
    expect(router.state.location.search).toBe(`?status=${status}`);
  });

  it('shows the rows in API order, with server totals and links to the detail', async () => {
    await openOrders();
    const ids = [...document.querySelectorAll('[data-row-id]')].map((el) =>
      el.getAttribute('data-row-id'),
    );
    expect(ids).toEqual(orders.map((o) => o.id));
    const paid = rowOf(orders[1].id);
    expect(within(paid).getByTestId('order-total')).toHaveTextContent('KES 2,100.00');
    expect(paid).toHaveTextContent('Paid (test payment)');
    expect(paid).toHaveTextContent('SJK4H7Q2LN');
    expect(paid).toHaveTextContent('Maize, 25 kg, Nairobi');
    expect(within(rowOf(orders[0].id)).getByTestId('order-total')).toHaveTextContent(
      'KES 1,138.00',
    );
    expect(within(paid).getByRole('link', { name: 'Order AGR-P41D00' })).toHaveAttribute(
      'href',
      `/admin/orders/${orders[1].id}`,
    );
    expect(rowOf(orders[3].id)).toHaveTextContent('No payment');
  });

  it('marks orders that need review with an icon and the words "Needs review"', async () => {
    await openOrders();
    const marker = within(rowOf(orders[0].id)).getByTestId('needs-review');
    expect(marker).toHaveTextContent('Needs review');
    expect(marker.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(rowOf(orders[0].id).className).toMatch(/border-l-negative/);
    for (const order of orders.slice(1))
      expect(within(rowOf(order.id)).queryByTestId('needs-review')).toBeNull();
  });

  it('searches by reference or buyer name', async () => {
    const user = userEvent.setup();
    await openOrders();
    await user.type(screen.getByLabelText('Search by order reference or buyer name'), 'AGR-P');
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({ q: 'AGR-P', limit: '20', offset: '0' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('list-count')).toHaveTextContent('Showing 1 of 1'),
    );
  });

  it('has the same links in the table layout', async () => {
    setWideScreen(true);
    await openOrders();
    const table = screen.getByRole('table', { name: 'Orders' });
    expect(within(table).getAllByRole('link')).toHaveLength(orders.length);
  });
});

describe('AdminOrderDetailScreen', () => {
  it('shows the summary, parties and payments with the server amounts', async () => {
    setWideScreen(true);
    await openDetail();
    expect(screen.getByRole('heading', { name: 'Order AGR-R3V13W', level: 1 })).toBeInTheDocument();
    const summary = screen.getByTestId('order-summary');
    expect(summary).toHaveTextContent('Needs review');
    expect(within(summary).getByTestId('order-total')).toHaveTextContent('KES 1,138.00');
    expect(summary).toHaveTextContent('KES 45.50');
    expect(screen.getByText('Otieno Buyer')).toBeInTheDocument();
    expect(screen.getByText(REVIEW.listing_id)).toBeInTheDocument();
    const payments = screen.getByRole('table', { name: 'Payments for this order' });
    const rows = within(payments).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Timed out');
    expect(rows[0]).toHaveTextContent('1037: DS timeout user cannot be reached');
    expect(rows[1]).toHaveTextContent('SJK4H7Q2LM');
    expect(rows[1]).toHaveTextContent('2547*****678');
    expect(rows[1]).toHaveTextContent('sandbox');
    for (const amount of within(payments).getAllByTestId('payment-amount')) {
      expect(amount).toHaveTextContent('KES 1,138.00');
    }
  });

  it('loads payment events only when the dialog opens and shows payloads as text', async () => {
    const user = userEvent.setup();
    await openDetail();
    expect(recorder.requests.filter((r) => r.path.endsWith('/events'))).toEqual([]);
    const buttons = screen.getAllByRole('button', { name: /^View events/ });
    await user.click(buttons[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Payment events' });
    await within(dialog).findByText('stk_push_request');
    expect(recorder.requests.filter((r) => r.path.endsWith('/events'))).toHaveLength(1);
    expect(dialog.querySelector('script')).toBeNull();
    expect(within(dialog).getAllByTestId('payload')[0]).toHaveTextContent(
      '<script>alert(1)</script>',
    );
    expect(within(dialog).getAllByText('ws_CO_191020260804')).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(buttons[1]).toHaveFocus());
  });

  it('shows the review panel with the reason, previous status and flagged time', async () => {
    await openDetail();
    const panel = screen.getByTestId('review-panel');
    expect(within(panel).getByTestId('review-reason')).toHaveTextContent(
      'A payment confirmation arrived after this order had expired. The produce may already have been released to other buyers.',
    );
    expect(panel).toHaveTextContent('Status before review');
    expect(panel).toHaveTextContent('Expired');
    expect(panel).toHaveTextContent('19 Oct 2026, 11:09');
    expect(within(panel).getByRole('button', { name: 'Confirm sale' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Void order' })).toBeInTheDocument();
  });

  it.each(orders.slice(1).map((o) => [o.status, o.id]))(
    'shows no actions for a %s order',
    async (_status, id) => {
      await openDetail(id);
      expect(screen.queryByTestId('review-panel')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Confirm sale' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Void order' })).toBeNull();
    },
  );

  it.each([
    [
      'Confirm sale',
      'Confirm this sale?',
      'The order becomes paid and the produce is reserved for this buyer again, if enough is left in the listing.',
    ],
    [
      'Void order',
      'Void this order?',
      'The order is cancelled. The produce was already released, so the listing does not change.',
    ],
  ])('"%s" explains its consequences', async (button, title, effect) => {
    const user = userEvent.setup();
    await openDetail();
    await user.click(screen.getByRole('button', { name: button }));
    const dialog = screen.getByRole('dialog', { name: title });
    expect(dialog).toHaveTextContent(effect);
    expect(dialog).toHaveTextContent(
      'The payment record stays as it is. Any refund must be handled outside AgriSence.',
    );
    expect(dialog).toHaveTextContent('This note is kept with the order.');
  });

  it('sends exactly {action, note}, once, and then shows the resolution', async () => {
    const user = userEvent.setup();
    // After the resolution, the order is read again from the server.
    let resolved = false;
    server.use(
      http.post(apiUrl('/api/v1/admin/orders/:id/resolve'), async () => {
        await delay(50);
        resolved = true;
        return HttpResponse.json(fixtures.adminOrderResolved);
      }),
      http.get(apiUrl('/api/v1/admin/orders/:id'), ({ params }) =>
        params.id === REVIEW.id
          ? HttpResponse.json(resolved ? fixtures.adminOrderResolved : REVIEW)
          : undefined,
      ),
    );
    await openDetail();
    await user.click(screen.getByRole('button', { name: 'Confirm sale' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Note'),
      '  Receipt checked in the Daraja portal.  ',
    );
    const confirm = within(dialog).getByRole('button', { name: 'Confirm sale' });
    await user.dblClick(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const calls = recorder.of('POST', `/api/v1/admin/orders/${REVIEW.id}/resolve`);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(await calls[0].body)).toEqual({
      action: 'confirm_sale',
      note: 'Receipt checked in the Daraja portal.',
    });
    expect(toast.success).toHaveBeenCalledWith('Sale confirmed.');
    const resolution = await screen.findByTestId('resolution');
    expect(resolution).toHaveTextContent('Sale confirmed');
    expect(resolution).toHaveTextContent('Receipt checked in the Daraja portal.');
    expect(resolution).toHaveTextContent('Amina Main');
    expect(screen.queryByTestId('review-panel')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Resolution' })).toHaveFocus());
  });

  it('disables both buttons while a resolution is pending', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/orders/:id/resolve'), async () => {
        await delay('infinite');
        return HttpResponse.json(fixtures.adminOrderResolved);
      }),
    );
    await openDetail();
    await user.click(screen.getByRole('button', { name: 'Void order' }));
    await user.type(screen.getByLabelText('Note'), 'Buyer asked for a refund.');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Void order' }),
    );
    expect(await screen.findByRole('button', { name: /Saving/ })).toBeDisabled();
    const panel = screen.getByTestId('review-panel');
    expect(
      within(panel).getByRole('button', { name: 'Confirm sale', hidden: true }),
    ).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Void order', hidden: true })).toBeDisabled();
  });

  it.each([
    [9, false],
    [10, true],
  ])('a note of %s characters is accepted: %s', async (length, accepted) => {
    const user = userEvent.setup();
    await openDetail();
    await user.click(screen.getByRole('button', { name: 'Void order' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'n'.repeat(length) } });
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Void order' }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(recorder.of('POST', `/api/v1/admin/orders/${REVIEW.id}/resolve`)).toHaveLength(
      accepted ? 1 : 0,
    );
  });

  it('on order_not_in_reconciliation refetches and explains', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/orders/:id/resolve'), () =>
        errorResponse(409, 'order_not_in_reconciliation'),
      ),
    );
    await openDetail();
    const before = recorder.of('GET', `/api/v1/admin/orders/${REVIEW.id}`).length;
    await user.click(screen.getByRole('button', { name: 'Confirm sale' }));
    await user.type(screen.getByLabelText('Note'), 'Checked the M-Pesa statement.');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm sale' }),
    );
    expect(await screen.findByTestId('review-message')).toHaveTextContent(
      'This order is no longer waiting for review.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(recorder.of('GET', `/api/v1/admin/orders/${REVIEW.id}`).length).toBeGreaterThan(
        before,
      ),
    );
  });

  it.each([
    [
      'reconciliation_context_missing',
      'The record needed to resolve this order is missing. Do not change the order here; check the payment events.',
    ],
    [
      'insufficient_stock_to_confirm',
      'Not enough produce is left in the listing to confirm this sale.',
    ],
  ])('keeps the dialog open with the message on %s', async (code, message) => {
    const user = userEvent.setup();
    server.use(
      http.post(apiUrl('/api/v1/admin/orders/:id/resolve'), () => errorResponse(409, code)),
    );
    await openDetail();
    await user.click(screen.getByRole('button', { name: 'Confirm sale' }));
    await user.type(screen.getByLabelText('Note'), 'Checked the M-Pesa statement.');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm sale' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('after a network failure says the result is unknown, offers Refresh and never resends', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post(apiUrl('/api/v1/admin/orders/:id/resolve'), () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    await openDetail();
    await user.click(screen.getByRole('button', { name: 'Void order' }));
    await user.type(screen.getByLabelText('Note'), 'Buyer asked for a refund.');
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Void order' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByText(
        'We could not confirm whether the change was saved. Refresh this order to check before trying again.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Void order' })).toBeNull();
    const before = recorder.of('GET', `/api/v1/admin/orders/${REVIEW.id}`).length;
    await user.click(within(dialog).getByRole('button', { name: 'Refresh order' }));
    await waitFor(() =>
      expect(recorder.of('GET', `/api/v1/admin/orders/${REVIEW.id}`).length).toBeGreaterThan(
        before,
      ),
    );
    expect(calls).toBe(1);
  });

  it('shows a resolved order read only', async () => {
    server.use(
      http.get(apiUrl('/api/v1/admin/orders/:id'), () =>
        HttpResponse.json(fixtures.adminOrderResolved),
      ),
    );
    await openDetail();
    expect(screen.getByTestId('resolution')).toHaveTextContent('Sale confirmed');
    expect(screen.queryByTestId('review-panel')).toBeNull();
    expect(screen.getByText('No payment was started for this order.')).toBeInTheDocument();
  });

  it('says when the order does not exist', async () => {
    renderAdmin('/admin/orders/d0000000-0000-4000-8000-00000000ffff');
    expect(await screen.findByText('This order could not be found.')).toBeInTheDocument();
  });
});
