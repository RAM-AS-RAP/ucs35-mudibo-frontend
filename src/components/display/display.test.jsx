import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expectNoAxeViolations } from '@/test/axe';
import { fixtures } from '@/test/fixtures';
import { explainabilityChart, summaryText } from '@/lib/forecast';
import { parseShap } from '@/lib/shapSchema';
import { DataTable } from './DataTable';
import { DeltaTag } from './DeltaTag';
import { ExplainabilityBars } from './ExplainabilityBars';
import { MarketChips } from './MarketChips';
import { PriceCard } from './PriceCard';
import { Segmented } from './Segmented';

describe('DeltaTag with a direction', () => {
  it.each([
    [4.5, 'rise', 'Increasing', 'lucide-arrow-up'],
    [-2, 'fall', 'Falling', 'lucide-arrow-down'],
    [0.5, 'flat', 'Little change', 'lucide-minus'],
  ])('%s as %s shows the word and its icon', async (value, direction, word, icon) => {
    const { container } = render(
      <DeltaTag value={value} direction={/** @type {any} */ (direction)} suffix="vs 1 month ago" />,
    );
    const tag = container.firstElementChild;
    expect(tag).toHaveAttribute('data-direction', direction);
    expect(tag).toHaveTextContent(word);
    expect(tag).toHaveTextContent('vs 1 month ago');
    expect(tag?.querySelector('svg')).toHaveClass(icon);
    await expectNoAxeViolations(container);
  });
});

describe('PriceCard', () => {
  it('shows the latest price, bag line, change and the older tag, without a month', async () => {
    const { container } = render(
      <PriceCard market="Kisumu" pricePerKg={82} changePct={4.5} monthsOlder={2} />,
    );
    const card = container.firstElementChild;
    expect(card).toHaveTextContent('Latest price');
    expect(card).toHaveTextContent('KES 82.00per kg');
    expect(card).toHaveTextContent('About KES 7,380 per 90 kg bag');
    expect(card).toHaveTextContent('+4.5% vs 1 month agoIncreasing');
    expect(card).toHaveTextContent('2 months older');
    await expectNoAxeViolations(container);
  });

  it('shows "No change data" when the change is null', () => {
    render(<PriceCard market="Nairobi" pricePerKg={40} changePct={null} />);
    expect(screen.getByText('No change data')).toBeInTheDocument();
    expect(screen.queryByText(/older/)).not.toBeInTheDocument();
  });
});

describe('Segmented', () => {
  function Harness({ onChange = () => {} }) {
    const [value, setValue] = useState('maize');
    return (
      <Segmented
        legend="Crop"
        options={[
          { value: 'maize', label: 'Maize' },
          { value: 'beans', label: 'Beans' },
        ]}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  }

  it('is a labelled radio group operable with the keyboard', async () => {
    const onChange = vi.fn();
    const { container } = render(<Harness onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Crop' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Maize' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Beans' })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith('beans');
    // Each option is at least 44 px high.
    for (const label of container.querySelectorAll('label > span')) {
      expect(label).toHaveClass('min-h-11');
    }
    await expectNoAxeViolations(container);
  });
});

describe('MarketChips', () => {
  function Harness() {
    const [selected, setSelected] = useState(['Nairobi', 'Kisumu']);
    return (
      <MarketChips markets={['Nairobi', 'Kisumu']} selected={selected} onChange={setSelected} />
    );
  }

  it('toggles with aria-pressed and keeps at least one selected', async () => {
    const { container } = render(<Harness />);
    const user = userEvent.setup();
    const group = screen.getByRole('group', { name: 'Markets' });
    const [nairobi, kisumu] = within(group).getAllByRole('button');
    await user.click(nairobi);
    expect(nairobi).toHaveAttribute('aria-pressed', 'false');
    await user.click(kisumu);
    expect(kisumu).toHaveAttribute('aria-pressed', 'true');
    await user.click(nairobi);
    await user.click(kisumu);
    expect(kisumu).toHaveAttribute('aria-pressed', 'false');
    expect(nairobi).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('At least one market stays selected.')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

describe('ExplainabilityBars', () => {
  const forecast = fixtures.forecastOneMonth;
  const shap = /** @type {import('@/lib/shapSchema').ShapValues} */ (
    parseShap(forecast.shap_values)
  );
  const chart = explainabilityChart(shap);
  const summary = summaryText(forecast, chart.steps);

  it('is a list from the latest price, through signed steps, to the forecast price', async () => {
    const { container } = render(
      <ExplainabilityBars chart={chart} when="in 1 month" summary={summary} />,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.dataset.row)).toEqual([
      'start',
      'step',
      'step',
      'step',
      'step',
      'end',
    ]);
    expect(items[0]).toHaveTextContent('Latest priceKES 40.00');
    expect(items[2]).toHaveTextContent('Time of year+KES 1.45');
    expect(items[5]).toHaveTextContent('Forecast in 1 monthKES 42.49');
    expect(container).not.toHaveTextContent(/Boost|Drag|No effect|do not add up/);
    expect(screen.getByRole('figure')).toHaveAccessibleName(summary);
    await expectNoAxeViolations(container);
  });

  it('draws up steps solid green and down steps hatched red, each with a triangle', () => {
    const { container } = render(
      <ExplainabilityBars chart={chart} when="in 1 month" summary={summary} />,
    );
    const steps = [...container.querySelectorAll('[data-row="step"]')];
    expect(steps.map((li) => /** @type {HTMLElement} */ (li).dataset.direction)).toEqual([
      'up',
      'up',
      'up',
      'down',
    ]);
    const upBar = steps[1].querySelector('[data-bar]');
    const downBar = steps[3].querySelector('[data-bar]');
    expect(upBar).toHaveClass('bg-positive-soft', 'border-positive');
    expect(downBar).toHaveClass('bar-hatch-down', 'border-negative');
    expect(steps[3]).toHaveTextContent('-KES 0.50');
    expect(steps[3].querySelector('.lucide-triangle')).toHaveClass('rotate-180');
    expect(steps[1].querySelector('.lucide-triangle')).not.toHaveClass('rotate-180');
    for (const bar of container.querySelectorAll('[data-bar]')) {
      expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(bar).toHaveClass('min-w-2');
    }
  });

  it('places each step where the one before ended, on the shared scale', () => {
    const { container } = render(
      <ExplainabilityBars chart={chart} when="in 1 month" summary={summary} />,
    );
    const bars = [...container.querySelectorAll('[data-bar]')].map(
      (b) => /** @type {HTMLElement} */ (b).style,
    );
    const left = bars.map((style) => Number.parseFloat(style.left));
    const width = bars.map((style) => Number.parseFloat(style.width));
    // Each up step starts where the previous one ended.
    expect(left[1]).toBeCloseTo(left[0] + width[0], 6);
    expect(left[2]).toBeCloseTo(left[1] + width[1], 6);
    // The down step ends where the previous one ended.
    expect(left[3] + width[3]).toBeCloseTo(left[2] + width[2], 6);
    const ticks = [...container.querySelectorAll('[data-tick]')].map((t) => t.textContent);
    expect(ticks).toEqual(['40', '41', '42', '43']);
  });
});

describe('DataTable', () => {
  it('has a caption, column headers and row headers', async () => {
    const { container } = render(
      <DataTable
        caption="Maize prices by month, newest last"
        columns={[
          { key: 'period', header: 'Period' },
          { key: 'Nairobi', header: 'Nairobi (KES per kg)', numeric: true },
        ]}
        rows={[
          { id: '1', period: '1 month ago', Nairobi: 'KES 38.28' },
          { id: '0', period: 'Latest', Nairobi: 'KES 40.00' },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Maize prices by month, newest last' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(within(table).getByRole('rowheader', { name: 'Latest' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
