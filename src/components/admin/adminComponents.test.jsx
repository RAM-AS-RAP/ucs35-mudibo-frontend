// The administrator components (F4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expectNoAxeViolations } from '@/test/axe';
import { setWideScreen } from '@/test/admin';
import { renderWithProviders } from '@/test/render';
import { ResponsiveTable } from './ResponsiveTable';
import { SearchInput, SEARCH_DEBOUNCE_MS } from './SearchInput';
import { ConfirmDialog } from './ConfirmDialog';
import { PayloadView, PAYLOAD_LIMIT_BYTES } from './PayloadView';
import { RoleBadge } from './RoleBadge';
import { FilterBar, useFilterParams } from './FilterBar';
import { StatusBadge } from '@/components/display/StatusBadge';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const ROWS = [
  { id: '1', name: 'Wanjiku', role: 'Farmer' },
  { id: '2', name: 'Otieno', role: 'Buyer' },
];
const COLUMNS = [
  { key: 'name', header: 'Name', cell: (/** @type {any} */ r) => r.name },
  { key: 'role', header: 'Role', cell: (/** @type {any} */ r) => r.role },
];

function Table() {
  return (
    <main>
      <h1>People</h1>
      <ResponsiveTable
        caption="People"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        actions={(r) => <button type="button">{`Disable ${r.name}`}</button>}
      />
    </main>
  );
}

describe('ResponsiveTable', () => {
  it('renders a captioned table with row headers on wide screens', async () => {
    setWideScreen(true);
    const { container } = render(<Table />);
    const table = screen.getByRole('table', { name: 'People' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Name', 'Role', 'Actions']);
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['Wanjiku', 'Otieno']);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Disable Wanjiku',
      'Disable Otieno',
    ]);
    await expectNoAxeViolations(container);
  });

  it('renders the same data and actions as stacked cards below 1280 px', async () => {
    setWideScreen(false);
    const { container } = render(<Table />);
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'People' });
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole('heading', { name: 'Wanjiku' })).toBeInTheDocument();
    expect(within(cards[0]).getByText('Role')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Farmer')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Disable Wanjiku',
      'Disable Otieno',
    ]);
    await expectNoAxeViolations(container);
  });

  it('keeps every action reachable with the keyboard in both layouts', async () => {
    for (const wide of [true, false]) {
      setWideScreen(wide);
      const user = userEvent.setup();
      const { unmount } = render(<Table />);
      await user.tab();
      expect(document.activeElement).toHaveTextContent('Disable Wanjiku');
      await user.tab();
      expect(document.activeElement).toHaveTextContent('Disable Otieno');
      unmount();
      vi.restoreAllMocks();
    }
  });
});

describe('SearchInput', () => {
  function Harness({ onSearch }) {
    const [value, setValue] = useState(/** @type {string | null} */ (null));
    return (
      <SearchInput
        label="Search"
        value={value}
        onSearch={(text) => {
          onSearch(text);
          setValue(text);
        }}
      />
    );
  }

  it('waits 400 ms after typing and never searches below 2 characters', async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    const input = screen.getByLabelText('Search');
    fireEvent.change(input, { target: { value: 'w' } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 100));
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-describedby');

    fireEvent.change(input, { target: { value: 'wa' } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50));
    fireEvent.change(input, { target: { value: 'wan' } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(onSearch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenLastCalledWith('wan');
    expect(screen.queryByText('Type at least 2 characters to search.')).toBeNull();

    fireEvent.change(input, { target: { value: '' } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onSearch).toHaveBeenLastCalledWith(null);
  });

  it('accepts at most 50 characters', () => {
    render(<Harness onSearch={() => {}} />);
    expect(screen.getByLabelText('Search')).toHaveAttribute('maxLength', '50');
  });
});

describe('ConfirmDialog', () => {
  /**
   * @param {{ onConfirm: (note: string) => Promise<unknown> | void, error?: any, note?: boolean }} props
   */
  function Harness({ onConfirm, error = null, note = false }) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    return (
      <main>
        <h1>Page</h1>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Remove this listing?"
          description="Buyers can no longer see it."
          consequences={['First effect.', 'Second effect.']}
          confirmLabel="Remove listing"
          pendingLabel="Removing…"
          destructive
          pending={pending}
          error={error}
          note={
            note
              ? { label: 'Note', hint: 'This note is kept with the order.', min: 10, max: 500 }
              : undefined
          }
          onConfirm={async (text) => {
            setPending(true);
            try {
              await onConfirm(text);
            } finally {
              setPending(false);
            }
          }}
        />
      </main>
    );
  }

  it('shows the consequences, has no axe violations and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness onConfirm={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(within(dialog).getByText('First effect.')).toBeInTheDocument();
    expect(within(dialog).getByText('Second effect.')).toBeInTheDocument();
    await expectNoAxeViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps focus inside the dialog (Tab wraps)', async () => {
    const user = userEvent.setup();
    render(<Harness onConfirm={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('sends one request on a double click', async () => {
    const user = userEvent.setup();
    let resolve = () => {};
    const onConfirm = vi.fn(() => new Promise((r) => (resolve = () => r(undefined))));
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const confirm = screen.getByRole('button', { name: 'Remove listing' });
    await user.dblClick(confirm);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /Removing/ })).toBeDisabled();
    await act(async () => resolve());
  });

  it.each([
    [9, false, 'Write at least 10 characters.'],
    [10, true, null],
    [500, true, null],
    [501, false, 'Use at most 500 characters.'],
  ])('a note of %s characters is accepted: %s', async (length, accepted, message) => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} note />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const textarea = screen.getByLabelText('Note');
    expect(textarea).toHaveAttribute('maxLength', '500');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(length) } });
    expect(screen.getByText(`${length} of 500 characters`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove listing' }));
    if (accepted) {
      expect(onConfirm).toHaveBeenCalledWith('x'.repeat(length));
    } else {
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByText(/** @type {string} */ (message))).toBeInTheDocument();
      expect(textarea).toHaveFocus();
      expect(textarea).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('shows an error with the reference, and a final error hides the confirm button', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Harness
        onConfirm={() => {}}
        error={{ message: 'A payment is in progress.', reference: 'req-9', final: true }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A payment is in progress.');
    expect(screen.getByText('req-9')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove listing' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    rerender(<Harness onConfirm={() => {}} error={null} />);
  });
});

describe('PayloadView', () => {
  it('shows markup as text, never as HTML', () => {
    const { container } = render(
      <PayloadView
        payload={{ note: '<script>alert(1)</script><img src=x onerror=alert(2)>' }}
        label="Payload 1"
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('payload')).toHaveTextContent('<script>alert(1)</script>');
    expect(screen.getByTestId('payload').tagName).toBe('PRE');
  });

  it('shortens payloads above 16 KB until "Show all"', async () => {
    const user = userEvent.setup();
    const big = { data: 'é'.repeat(PAYLOAD_LIMIT_BYTES) };
    render(<PayloadView payload={big} label="Big payload" />);
    const shown = /** @type {string} */ (screen.getByTestId('payload').textContent);
    expect(new TextEncoder().encode(shown).length).toBeLessThanOrEqual(PAYLOAD_LIMIT_BYTES);
    expect(shown).not.toContain('�');
    expect(screen.getByText(/Shortened: the full payload is/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByTestId('payload').textContent).toBe(JSON.stringify(big, null, 2));
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('copies exactly the payload text', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(/** @type {any} */ ({ writeText }));
    render(<PayloadView payload={{ a: 1 }} label="Payload" />);
    await user.click(screen.getByRole('button', { name: 'Copy payload' }));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ a: 1 }, null, 2));
    expect(await screen.findByText('Payload copied.')).toBeInTheDocument();
  });
});

describe('badges', () => {
  it('RoleBadge names the main administrator only from the flag', () => {
    render(
      <div>
        <RoleBadge userRole="admin" isSuperAdmin />
        <RoleBadge userRole="admin" />
        <RoleBadge userRole="farmer" />
        <RoleBadge userRole="buyer" />
      </div>,
    );
    expect(screen.getByText('Main admin')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Farmer')).toBeInTheDocument();
    expect(screen.getByText('Buyer')).toBeInTheDocument();
  });

  it.each([
    ['invite', 'pending', 'Pending'],
    ['invite', 'used', 'Used'],
    ['invite', 'expired', 'Expired'],
    ['invite', 'revoked', 'Revoked'],
    ['invite', 'locked', 'Locked'],
    ['user', 'active', 'Active'],
    ['user', 'disabled', 'Disabled'],
    ['adminOrder', 'needs_reconciliation', 'Needs review'],
    ['adminOrder', 'paid', 'Paid (test payment)'],
    ['adminPayment', 'initiated', 'Initiated, waiting for the phone'],
    ['adminPayment', 'timeout', 'Timed out'],
  ])('StatusBadge %s %s shows an icon and "%s"', (kind, status, word) => {
    const { container } = render(<StatusBadge kind={/** @type {any} */ (kind)} status={status} />);
    expect(screen.getByText(word)).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('FilterBar and useFilterParams', () => {
  const RULES = { status: { values: ['all', 'on', 'off'], fallback: 'all' }, q: {} };
  function Harness() {
    const filters = useFilterParams(RULES);
    return (
      <FilterBar label="Filter things" active={filters.active} onClear={filters.clear}>
        <p data-testid="values">{JSON.stringify(filters.values)}</p>
        <button type="button" onClick={() => filters.set({ status: 'on' })}>
          On
        </button>
      </FilterBar>
    );
  }

  it('reads valid values, drops invalid ones from the URL and clears', async () => {
    const user = userEvent.setup();
    const { router } = renderWithProviders(<Harness />, { path: '/x?status=bogus&q=abc' });
    await waitFor(() => expect(router.state.location.search).toBe('?q=abc'));
    expect(screen.getByRole('search', { name: 'Filter things' })).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('values').textContent ?? '{}')).toEqual({
      status: 'all',
      q: 'abc',
    });
    await user.click(screen.getByRole('button', { name: 'On' }));
    expect(router.state.location.search).toBe('?status=on&q=abc');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });
});
