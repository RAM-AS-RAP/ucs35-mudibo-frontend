import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expectNoAxeViolations } from '@/test/axe';
import { useCountdown } from '@/lib/useCountdown';
import { CountdownButton } from './CountdownButton';
import { formatCodeInput } from './CodeInput';
import { PasswordField } from './PasswordField';
import { PasswordRequirements } from './PasswordRequirements';
import { FormErrorSummary } from './FormErrorSummary';

afterEach(() => vi.useRealTimers());

describe('useCountdown', () => {
  it('ticks once per second and stops at zero', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdown());
    expect(result.current.remaining).toBe(0);
    act(() => result.current.start(3));
    expect(result.current).toMatchObject({ remaining: 3, active: true });
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.remaining).toBe(2);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toMatchObject({ remaining: 0, active: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('CountdownButton', () => {
  it('announces only when the wait starts and when it ends, not every second', () => {
    const { rerender, container } = render(
      <CountdownButton remaining={0}>Sign in</CountdownButton>,
    );
    const status = /** @type {HTMLElement} */ (container.querySelector('[data-countdown-status]'));
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('');

    rerender(<CountdownButton remaining={42}>Sign in</CountdownButton>);
    expect(status).toHaveTextContent('Wait 42 seconds before trying again.');
    const button = screen.getByRole('button', { name: 'Try again in 42 s' });
    expect(button).toBeDisabled();
    // The changing text is not inside a live region.
    expect(button.closest('[aria-live]')).toBeNull();

    for (const seconds of [41, 40, 12, 1]) {
      rerender(<CountdownButton remaining={seconds}>Sign in</CountdownButton>);
      expect(status).toHaveTextContent('Wait 42 seconds before trying again.');
    }
    rerender(<CountdownButton remaining={0}>Sign in</CountdownButton>);
    expect(status).toHaveTextContent('You can try again now.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('shows a spinner label and is disabled while pending', () => {
    render(
      <CountdownButton remaining={0} pending pendingLabel="Signing in…">
        Sign in
      </CountdownButton>,
    );
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });
});

describe('PasswordField', () => {
  it('has a show or hide toggle with an accessible name and aria-pressed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PasswordField id="pw" label="Password" autoComplete="current-password" />,
    );
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(input).toHaveAttribute('type', 'text');
    await expectNoAxeViolations(container);
  });

  it('allows paste and ignores a value passed from state', async () => {
    const user = userEvent.setup();
    render(
      <PasswordField
        id="pw"
        label="Password"
        autoComplete="new-password"
        // @ts-expect-error a stored value must never be filled in
        defaultValue="stored-secret"
      />,
    );
    const input = screen.getByLabelText('Password');
    expect(input).toHaveValue('');
    await user.click(input);
    await user.paste('Pasted#2026');
    expect(input).toHaveValue('Pasted#2026');
  });
});

describe('formatCodeInput', () => {
  it.each([
    ['abcd2345', 'ABCD2345'],
    ['abcd-2345', 'ABCD-2345'],
    ['abcd 2345', 'ABCD2345'],
    [' ab cd - 23 45 ', 'ABCD-2345'],
    ['abcd--2345', 'ABCD-2345'],
    ['-abcd', 'ABCD'],
    ['abcd2345xyz', 'ABCD2345'],
    ['ab!cd#23', 'ABCD23'],
  ])('%j becomes %j', (raw, expected) => {
    expect(formatCodeInput(raw)).toBe(expected);
  });
});

describe('PasswordRequirements', () => {
  it('pairs every state with an icon and a word, not colour alone', () => {
    render(
      <PasswordRequirements
        id="req"
        password="abcdefgh"
        context={{ role: 'farmer', characterClasses: true }}
      />,
    );
    expect(screen.getByText('8 to 128 characters')).toHaveTextContent('8 to 128 characters: Done');
    expect(screen.getByText(/An upper case letter/)).toHaveTextContent(': Not yet');
  });
});

describe('FormErrorSummary', () => {
  it('links problems to their fields and moves focus there on click', async () => {
    const user = userEvent.setup();
    render(
      <>
        <FormErrorSummary problems={[{ text: 'Enter your name.', fieldId: 'name' }]} />
        <input id="name" aria-label="Name" />
      </>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Enter your name.' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('renders nothing without problems', () => {
    const { container } = render(<FormErrorSummary problems={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
