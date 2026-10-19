import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expectNoAxeViolations } from '@/test/axe';
import { fixtures } from '@/test/fixtures';
import { explainabilityRows, summaryText } from '@/lib/forecast';
import { parseShap } from '@/lib/shapSchema';
import { DataTable } from './DataTable';
import { DeltaTag } from './DeltaTag';
import { ExplainabilityBars } from './ExplainabilityBars';
import { FreshnessNote } from './FreshnessNote';
import { MarketChips } from './MarketChips';
import { PriceCard } from './PriceCard';
import { Recommendation } from './Recommendation';
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

describe('Recommendation and FreshnessNote', () => {
  it.each([
    ['rise', 'bg-positive-soft', 'lucide-arrow-up'],
    ['fall', 'bg-negative-soft', 'lucide-arrow-down'],
    ['flat', 'bg-neutral-bg', 'lucide-minus'],
  ])('%s has its tint, an icon and the title text', async (tone, tint, icon) => {
    const { container } = render(
      <Recommendation tone={/** @type {any} */ (tone)} title="Title" body="Body" note="Note" />,
    );
    const box = container.firstElementChild;
    expect(box).toHaveClass(tint);
    expect(box?.querySelector('svg')).toHaveClass(icon);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('FreshnessNote shows its text with an icon', () => {
    const { container } = render(
      <FreshnessNote text="Prices are monthly figures from FEWS NET." />,
    );
    expect(container).toHaveTextContent('Prices are monthly figures from FEWS NET.');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ExplainabilityBars', () => {
  const forecast = fixtures.forecastOneMonth;
  const shap = /** @type {import('@/lib/shapSchema').ShapValues} */ (
    parseShap(forecast.shap_values)
  );
  const { rows, typical } = explainabilityRows(shap);

  it('is a list of rows with words, signs, KES and decorative bars sized by barFraction', async () => {
    const { container } = render(
      <ExplainabilityBars
        rows={rows}
        typical={typical}
        expectedChangePct={forecast.expected_change_pct}
        predictedPrice={forecast.predicted_price}
        summary={summaryText(forecast, rows)}
      />,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    const bars = [...container.querySelectorAll('[data-bar]')];
    expect(bars.map((b) => /** @type {HTMLElement} */ (b).style.width)).toEqual([
      '20%',
      '100%',
      '86%',
      '33%',
    ]);
    for (const bar of bars) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(items[1]).toHaveTextContent('Boost');
    expect(items[3]).toHaveTextContent('Drag');
    expect(screen.getByRole('figure')).toHaveAccessibleName(summaryText(forecast, rows));
    await expectNoAxeViolations(container);
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
