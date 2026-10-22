import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/msw/server';
import { fixtures } from '@/test/fixtures';
import { logout } from '@/test/render';
import { recordAll } from '@/test/buyer';
import { renderAdmin, rowOf, waitForScreen } from '@/test/admin';
import { queryClient } from '@/lib/queryClient';

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
});

const [completed, initiated] = fixtures.adminPaymentsPage.items;
const listRequests = () => recorder.of('GET', '/api/v1/admin/payments').map((r) => r.query);

async function openPayments(path = '/admin/payments') {
  const utils = renderAdmin(path);
  await waitForScreen('Payments', 'Loading payments…');
  return utils;
}

describe('PaymentsScreen', () => {
  it('lists payments with links to their orders and the server amounts', async () => {
    await openPayments();
    const row = rowOf(completed.id);
    expect(within(row).getByRole('link', { name: 'Order AGR-R3V13W' })).toHaveAttribute(
      'href',
      `/admin/orders/${completed.order_id}`,
    );
    expect(within(row).getByTestId('payment-amount')).toHaveTextContent('KES 1,138.00');
    expect(row).toHaveTextContent('Completed');
    expect(row).toHaveTextContent('2547*****678');
    expect(row).toHaveTextContent('SJK4H7Q2LM');
    expect(row).toHaveTextContent('The service request is processed successfully.');
    expect(row).toHaveTextContent('sandbox');
    expect(rowOf(initiated.id)).toHaveTextContent('Initiated, waiting for the phone');
    expect(rowOf(initiated.id)).toHaveTextContent('No result yet');
  });

  it('maps the status chips, the environment and the reference to the request', async () => {
    const user = userEvent.setup();
    const { router } = await openPayments();
    await user.click(screen.getByRole('radio', { name: 'Initiated' }));
    await user.selectOptions(screen.getByLabelText('Environment'), 'sandbox');
    await user.type(screen.getByLabelText('Order reference'), 'AGR-W4');
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({
        status: 'initiated',
        environment: 'sandbox',
        order_reference: 'AGR-W4',
        limit: '20',
        offset: '0',
      }),
    );
    expect(router.state.location.search).toBe('?status=initiated&environment=sandbox&ref=AGR-W4');
  });

  it('never sends an order reference shorter than 6 characters', async () => {
    const user = userEvent.setup();
    await openPayments();
    await user.type(screen.getByLabelText('Order reference'), 'AGR');
    await new Promise((r) => setTimeout(r, 600));
    expect(listRequests().some((q) => 'order_reference' in q)).toBe(false);
    expect(
      screen.getByText('Type at least 6 characters of the order reference.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Order reference')).toHaveAttribute('maxLength', '12');
  });

  it('sends the dates as YYYY-MM-DD and labels how the server reads them', async () => {
    await openPayments();
    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Created to'), { target: { value: '2026-10-19' } });
    await waitFor(() =>
      expect(listRequests().at(-1)).toEqual({
        created_from: '2026-10-01',
        created_to: '2026-10-19',
        limit: '20',
        offset: '0',
      }),
    );
    expect(
      screen.getByText('Dates as interpreted by the server (whole days).'),
    ).toBeInTheDocument();
  });

  it('blocks the request when the start date is after the end date', async () => {
    await openPayments();
    const before = listRequests().length;
    fireEvent.change(screen.getByLabelText('Created to'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(listRequests().length).toBe(before + 1));
    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-10-05' } });
    expect(await screen.findByTestId('date-problem')).toHaveTextContent(
      'The start date must not be after the end date.',
    );
    expect(screen.getByLabelText('Created from')).toHaveAttribute('aria-invalid', 'true');
    await new Promise((r) => setTimeout(r, 200));
    expect(listRequests()).toHaveLength(before + 1);
    expect(listRequests().some((q) => q.created_from === '2026-10-05')).toBe(false);
    expect(screen.queryByTestId('list-count')).toBeNull();
  });

  it('opens the events of a payment', async () => {
    const user = userEvent.setup();
    await openPayments();
    await user.click(
      within(rowOf(completed.id)).getByRole('button', { name: 'View events for order AGR-R3V13W' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Payment events' });
    expect(await within(dialog).findByText('callback')).toBeInTheDocument();
    expect(recorder.of('GET', `/api/v1/admin/payments/${completed.id}/events`)).toHaveLength(1);
  });

  it('reads the status filter from the dashboard link', async () => {
    await openPayments('/admin/payments?status=initiated');
    expect(listRequests()[0]).toEqual({ status: 'initiated', limit: '20', offset: '0' });
    expect(screen.getByRole('radio', { name: 'Initiated' })).toBeChecked();
  });
});
