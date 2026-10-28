import { useId } from 'react';
import { Sparkles, Triangle } from 'lucide-react';
import { axisPercent, stepAmountText } from '@/lib/forecast';
import { formatAxisNumber, formatKES } from '@/lib/format';
import { FORECAST_TEXT } from '@/lib/messages';
import { cn } from '@/lib/utils';

/** @typedef {import('@/lib/forecast').ExplainabilityChart} ExplainabilityChart */
/** @typedef {import('@/lib/forecast').ExplainabilityStep} ExplainabilityStep */

/*
 * Every row shares one grid so the tracks line up: on small screens the name and amount share a line and
 * the track sits underneath at full width; from `sm` the name, track and amount are side by side.
 */
const ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 sm:grid-cols-[10rem_minmax(0,1fr)_7rem] md:grid-cols-[13rem_minmax(0,1fr)_7.5rem]';
const NAME = 'order-1 min-w-0';
const AMOUNT = 'order-2 whitespace-nowrap text-right tabular-nums sm:order-3';
const TRACK =
  'relative order-3 col-span-2 h-6 sm:order-2 sm:col-span-1 sm:-my-1.5 sm:h-auto sm:min-h-9 sm:self-stretch';

/** Up steps: solid green. Down steps: hatched red. The triangle and the sign always go with them. */
const DIRECTION = {
  up: { bar: 'border-positive bg-positive-soft', text: 'text-positive-text', icon: '' },
  down: { bar: 'border-negative bar-hatch-down', text: 'text-negative-text', icon: 'rotate-180' },
};

/** @param {number} percent */
const at = (percent) => ({ left: `${percent}%` });

/**
 * Faint vertical lines at the tick marks, behind the bars.
 * @param {{ ticks: number[], axis: ExplainabilityChart['axis'] }} props
 */
function GridLines({ ticks, axis }) {
  return ticks.map((tick) => (
    <span
      key={tick}
      className="absolute inset-y-0 border-l border-border"
      style={at(axisPercent(axis, tick))}
    />
  ));
}

/**
 * A dotted line joining one step to the next: from the top of the row to the bar, or from the bar
 * to the bottom of the row.
 * @param {{ percent: number, half: 'top' | 'bottom' }} props
 */
function Connector({ percent, half }) {
  return (
    <span
      data-connector={half}
      className={cn(
        'absolute border-l-2 border-dotted border-text-secondary',
        half === 'top' ? 'top-0 bottom-1/2' : 'top-1/2 bottom-0',
      )}
      style={at(percent)}
    />
  );
}

/** @param {{ percent: number }} props */
function Dot({ percent }) {
  return (
    <span
      data-dot=""
      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text ring-2 ring-card"
      style={at(percent)}
    />
  );
}

/**
 * Centres a tick label on its mark, except near the edges, where it stays inside the track.
 * @param {number} percent
 */
function tickShift(percent) {
  if (percent < 6) return 'translate-x-0';
  if (percent > 94) return '-translate-x-full';
  return '-translate-x-1/2';
}

/**
 * The tick labels above the tracks, in KES (decorative; the amounts are in the rows' text).
 * @param {{ axis: ExplainabilityChart['axis'] }} props
 */
function Scale({ axis }) {
  return (
    <div aria-hidden="true" className={cn(ROW, 'py-0')}>
      <span className="hidden sm:order-1 sm:block" />
      <div className="relative order-3 col-span-2 h-5 text-xs text-text-secondary sm:order-2 sm:col-span-1">
        {axis.ticks.map((tick) => {
          const percent = axisPercent(axis, tick);
          return (
            <span
              key={tick}
              data-tick={tick}
              className={cn('absolute top-0 tabular-nums', tickShift(percent))}
              style={at(percent)}
            >
              {formatAxisNumber(tick)}
            </span>
          );
        })}
      </div>
      <span className="hidden sm:order-3 sm:block" />
    </div>
  );
}

/**
 * The explanation of a forecast as a price staircase: the latest price, one step per part of the
 * model (green with ▲ for up, hatched red with ▼ for down, always signed), and the forecast price.
 * It is an accessible list: every row's name and amount are text, and the tracks are decorative
 * (`aria-hidden`). Built from `div`s, not Recharts (docs/forecast-display.md). Only call this with
 * the result of explainabilityChart().
 * @param {{
 *   chart: ExplainabilityChart,
 *   when: string,
 *   summary: string,
 *   className?: string,
 * }} props  `when` is the horizon in words, for example "in 1 month".
 */
export function ExplainabilityBars({ chart, when, summary, className }) {
  const captionId = useId();
  const { axis, steps, start, end } = chart;
  const startAt = axisPercent(axis, start);
  const endAt = axisPercent(axis, end);
  const lastTo = steps.length > 0 ? steps[steps.length - 1].to : start;

  return (
    <figure aria-labelledby={captionId} className={cn('m-0 flex flex-col gap-2', className)}>
      <figcaption
        id={captionId}
        className="flex items-start gap-3 rounded-xl bg-primary-soft p-4 text-text"
      >
        <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>{summary}</span>
      </figcaption>
      <p className="mt-2 text-sm text-text-secondary">{FORECAST_TEXT.chartIntro}</p>
      <div className="rounded-xl border border-border bg-canvas p-2 sm:p-3">
        <Scale axis={axis} />
        <ul className="flex flex-col">
          <li data-row="start" className={ROW}>
            <span className={cn(NAME, 'font-medium text-text')}>{FORECAST_TEXT.startLabel}</span>
            <span
              className={cn(
                AMOUNT,
                'justify-self-end rounded-full bg-neutral-bg px-2.5 py-0.5 font-semibold text-neutral-text',
              )}
            >
              {formatKES(start)}
            </span>
            <div aria-hidden="true" className={TRACK}>
              <GridLines ticks={axis.ticks} axis={axis} />
              <Connector percent={startAt} half="bottom" />
              <Dot percent={startAt} />
            </div>
          </li>

          {steps.map((step) => {
            const style = step.up ? DIRECTION.up : DIRECTION.down;
            const fromAt = axisPercent(axis, step.from);
            const toAt = axisPercent(axis, step.to);
            return (
              <li
                key={step.id}
                data-row="step"
                data-kind={step.kind}
                data-direction={step.up ? 'up' : 'down'}
                className={ROW}
              >
                <span className={cn(NAME, 'flex items-start gap-1.5')}>
                  <Triangle
                    aria-hidden="true"
                    className={cn('mt-1.5 size-3 shrink-0 fill-current', style.text, style.icon)}
                  />
                  <span className="font-medium text-text">{step.label}</span>
                </span>
                <span className={cn(AMOUNT, 'font-medium', style.text)}>
                  {stepAmountText(step)}
                </span>
                <div aria-hidden="true" className={TRACK}>
                  <GridLines ticks={axis.ticks} axis={axis} />
                  <Connector percent={fromAt} half="top" />
                  <Connector percent={toAt} half="bottom" />
                  <span
                    data-bar=""
                    className={cn(
                      'absolute top-1/2 h-5 min-w-2 -translate-y-1/2 rounded-md border',
                      style.bar,
                    )}
                    style={{
                      left: `${Math.min(fromAt, toAt)}%`,
                      width: `${Math.abs(toAt - fromAt)}%`,
                    }}
                  />
                </div>
              </li>
            );
          })}

          <li data-row="end" className={cn(ROW, 'mt-1 border-t border-border pt-2.5')}>
            <span className={cn(NAME, 'font-bold text-text')}>
              {FORECAST_TEXT.forecastLabel(when)}
            </span>
            <span
              className={cn(
                AMOUNT,
                'justify-self-end rounded-full bg-primary px-2.5 py-0.5 font-bold text-on-primary',
              )}
            >
              {formatKES(end)}
            </span>
            <div aria-hidden="true" className={TRACK}>
              <GridLines ticks={axis.ticks} axis={axis} />
              <Connector percent={axisPercent(axis, lastTo)} half="top" />
              <span
                data-line=""
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
                style={{
                  left: `${Math.min(startAt, endAt)}%`,
                  width: `${Math.abs(endAt - startAt)}%`,
                }}
              />
              <Dot percent={endAt} />
            </div>
          </li>
        </ul>
      </div>
    </figure>
  );
}
