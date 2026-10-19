/**
 * The Recharts drawing of the price trend. Loaded lazily by TrendChart only, so Recharts is in its
 * own chunk and never in the initial JavaScript (scripts/check-build.mjs verifies this).
 * Colours come from the chart tokens through CSS variables. Series also differ by line style and
 * a direct end label, never by colour alone. Gaps in the data stay gaps (connectNulls false).
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TITLE } from '@/lib/messages';
import { priceTickFormatter, tickFormatter, tooltipLine } from '@/lib/trends';
import { useReducedMotion } from '@/lib/useReducedMotion';

/** Series styles, in market order. */
export const SERIES_STYLES = [
  { color: 'var(--chart-1)', dash: undefined },
  { color: 'var(--chart-2)', dash: '6 4' },
  { color: 'var(--chart-3)', dash: '2 3' },
  { color: 'var(--chart-4)', dash: '8 3 2 3' },
];

/**
 * @param {{ active?: boolean, payload?: Array<{ name: string, value: number | null, color?: string }>, label?: number }} props
 */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length || typeof label !== 'number') return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text shadow-md">
      {payload.map((entry) => (
        <p key={entry.name}>
          <span className="font-semibold">{entry.name}</span>
          <br />
          <span className="tabular-nums">{tooltipLine(label, entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * @param {{ data: Array<Record<string, number | null> & { n: number }>, markets: string[] }} props
 */
export default function TrendChartCanvas({ data, markets }) {
  const reducedMotion = useReducedMotion();

  /** Index of the last row with a price, per market: where the end label goes. */
  const lastIndex = Object.fromEntries(
    markets.map((market) => {
      let index = -1;
      data.forEach((row, i) => {
        if (row[market] !== null && row[market] !== undefined) index = i;
      });
      return [market, index];
    }),
  );

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 256 }}>
      <LineChart
        data={data}
        margin={{ top: 12, right: 72, bottom: 8, left: 0 }}
        accessibilityLayer={false}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="n"
          type="category"
          interval={0}
          tickLine={false}
          tickFormatter={tickFormatter}
          stroke="var(--text-secondary)"
          tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          height={44}
          label={{
            value: AXIS_TITLE,
            position: 'insideBottom',
            offset: 0,
            fill: 'var(--text-secondary)',
            fontSize: 12,
          }}
        />
        <YAxis
          width={64}
          tickFormatter={priceTickFormatter}
          stroke="var(--text-secondary)"
          tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          domain={['auto', 'auto']}
        />
        <Tooltip content={<TrendTooltip />} />
        {markets.map((market, i) => {
          const style = SERIES_STYLES[i % SERIES_STYLES.length];
          return (
            <Line
              key={market}
              type="linear"
              dataKey={market}
              name={market}
              stroke={style.color}
              strokeWidth={2}
              strokeDasharray={style.dash}
              dot={{ r: 3, fill: style.color, stroke: style.color }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={!reducedMotion}
              label={(/** @type {{ index: number, x: number, y: number }} */ props) =>
                props.index === lastIndex[market] ? (
                  <text
                    x={props.x + 8}
                    y={props.y}
                    dy={4}
                    fill={style.color}
                    fontSize={12}
                    fontWeight={600}
                  >
                    {market}
                  </text>
                ) : (
                  <g />
                )
              }
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
