import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expectNoAxeViolations } from '@/test/axe';
import { openapi } from '@/test/openapi';
import { ApiError } from '@/api/errors';
import { ErrorState } from './feedback/ErrorState';
import { EmptyState } from './feedback/EmptyState';
import { LoadingState } from './feedback/LoadingState';
import { OfflineBanner, OFFLINE_MESSAGE } from './feedback/OfflineBanner';
import { DeltaTag } from './display/DeltaTag';
import { StatusBadge } from './display/StatusBadge';
import { Money } from './display/Money';
import { StatCard } from './display/StatCard';

/** @param {boolean} online */
function setOnline(online) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

afterEach(() => setOnline(true));

describe('ErrorState', () => {
  it('shows the user message, a Try again button and the reference', async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <ErrorState
        error={new ApiError({ status: 503, code: 'busy', requestId: 'req-42' })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('The service is busy. Please try again shortly.')).toBeInTheDocument();
    expect(screen.getByText('req-42')).toBeInTheDocument();
    expect(screen.getByText(/Reference:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });
});

describe('OfflineBanner', () => {
  it('appears on the offline event and disappears on online', async () => {
    const { container } = render(<OfflineBanner />);
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
    await expectNoAxeViolations(container);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
  });
});

describe('DeltaTag', () => {
  it.each([
    [4.5, '+4.5%', 'Increasing', 'positive'],
    [-2, '-2.0%', 'Falling', 'negative'],
    [0, '0.0%', 'No change', 'zero'],
    [0.01, '0.0%', 'No change', 'zero'],
  ])('renders %s with sign, word and icon', async (value, text, word, direction) => {
    const { container } = render(<DeltaTag value={value} />);
    const tag = container.firstElementChild;
    expect(tag).toHaveAttribute('data-direction', direction);
    expect(tag).toHaveTextContent(`${text}${word}`);
    expect(tag?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expectNoAxeViolations(container);
  });

  it('accepts a custom word such as Boost or Drag', () => {
    render(<DeltaTag value={1.2} label="Boost" />);
    expect(screen.getByText('Boost')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  const orderStatuses = openapi.components.schemas.OrderStatus.enum;
  const paymentStatuses = openapi.components.schemas.PaymentStatus.enum;

  it.each(orderStatuses)('order status %s has an icon and a text label', (status) => {
    const { container } = render(<StatusBadge status={status} />);
    const badge = container.firstElementChild;
    expect(badge?.textContent?.trim()).toBeTruthy();
    expect(badge?.textContent).not.toBe(status);
    expect(badge?.querySelector('svg')).not.toBeNull();
  });

  it.each(paymentStatuses)('payment status %s has an icon and a text label', (status) => {
    const { container } = render(<StatusBadge status={status} kind="payment" />);
    expect(container.firstElementChild?.textContent?.trim()).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it.each([
    ['active', 'Active'],
    ['sold_out', 'Sold out'],
    ['removed', 'Removed'],
  ])('listing status %s shows an icon and "%s"', (status, words) => {
    const { container } = render(<StatusBadge status={status} kind="listing" />);
    expect(container.firstElementChild?.textContent).toBe(words);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('every listing status in openapi.json has words', () => {
    for (const status of openapi.components.schemas.ListingStatus.enum) {
      const { container, unmount } = render(<StatusBadge status={status} kind="listing" />);
      expect(container.querySelector('[data-status]')?.textContent).not.toBe(status);
      unmount();
    }
  });

  it('renders readable text for an unknown status', async () => {
    const { container } = render(<StatusBadge status="on_hold" />);
    expect(screen.getByText('On hold')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('other display and feedback components', () => {
  it('Money formats with KES', () => {
    render(<Money value="1234.5" />);
    expect(screen.getByText('KES 1,234.50')).toBeInTheDocument();
  });

  it('StatCard, EmptyState and LoadingState are accessible', async () => {
    const { container } = render(
      <div>
        <StatCard label="Current price" value="KES 45.50" hint={<DeltaTag value={2.5} />} />
        <EmptyState title="No listings yet" description="Create your first listing." />
        <LoadingState />
      </div>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    await expectNoAxeViolations(container);
  });
});
