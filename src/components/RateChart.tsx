import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  ReferenceDot,
} from 'recharts';
import { Currency } from '../types';
import { formatFXRate, formatECBDate, MINUS } from '../utils/formatters';

export interface RateLine {
  y: number;
  label: string;
  color: string;
  /** SVG dash pattern; every line gets its own so colour is never the only cue. */
  dash: string;
  width?: number;
  /** Where the label sits; default: highest line above-left, others below-right. */
  place?: 'above' | 'below';
  align?: 'left' | 'right';
}

interface RateChartProps {
  data: { date: string; rate: number }[];
  ccy: Currency;
  pairLabel: string;
  lines: RateLine[];
  /** Tooltip shows the distance to this rate. */
  compare?: { y: number; label: string };
  /** Pixel height, or 'fill' to take the height of the parent. */
  height?: number | 'fill';
  fillId: string;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

type LabelViewBox = { x?: number; y?: number; width?: number; height?: number };

function niceTicks(min: number, max: number, count: number): number[] {
  const rawStep = (max - min) / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

/** Label sitting on a horizontal line, with a panel-coloured backing so it reads over the area fill. */
function lineLabel(text: string, color: string, place: 'above' | 'below', align: 'left' | 'right') {
  return (props: { viewBox?: unknown }) => {
    const vb = props.viewBox as LabelViewBox | undefined;
    if (!vb || vb.x == null || vb.y == null || vb.width == null) return null;
    const w = text.length * 6.4 + 12;
    const h = 18;
    const x = align === 'left' ? vb.x + 6 : vb.x + vb.width - w - 6;
    const y = place === 'above' ? vb.y - h - 4 : vb.y + 4;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={3} fill="rgb(var(--panel))" fillOpacity={0.92} />
        <text x={x + 6} y={y + 12.5} fill={color} fontSize={11} fontWeight={500} fontFamily="Inter, sans-serif">
          {text}
        </text>
      </g>
    );
  };
}

/** Value tag on the right axis for the latest fixing. */
function priceTag(text: string) {
  return (props: { viewBox?: unknown }) => {
    const vb = props.viewBox as LabelViewBox | undefined;
    if (!vb || vb.x == null || vb.y == null || vb.width == null) return null;
    const w = text.length * 7 + 10;
    const x = vb.x + vb.width + 2;
    const y = vb.y - 9;
    return (
      <g>
        <rect x={x} y={y} width={w} height={18} rx={3} fill="rgb(var(--accent))" />
        <text x={x + 5} y={y + 13} fill="rgb(var(--accent-fg))" fontSize={11} fontWeight={600} fontFamily="JetBrains Mono, monospace">
          {text}
        </text>
      </g>
    );
  };
}

export const RateChart: React.FC<RateChartProps> = ({ data, ccy, pairLabel, lines, compare, height = 300, fillId }) => {
  const last = data[data.length - 1];
  const spanDays = data.length > 1 ? (Date.parse(last.date) - Date.parse(data[0].date)) / 86400000 : 0;
  const longRange = spanDays > 200;

  const axisDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return longRange ? `${MONTHS_ES[m - 1]} ${String(y).slice(2)}` : `${d} ${MONTHS_ES[m - 1]}`;
  };

  // long ranges: one tick per month (or every 2-3 months), never repeated
  const xTicks = useMemo(() => {
    if (!longRange) return undefined;
    const firsts: string[] = [];
    let prev = '';
    data.forEach((d) => {
      const ym = d.date.slice(0, 7);
      if (ym !== prev) {
        firsts.push(d.date);
        prev = ym;
      }
    });
    const small = typeof window !== 'undefined' && window.innerWidth < 640;
    const every = small ? Math.ceil(firsts.length / 4) : firsts.length > 16 ? 3 : firsts.length > 8 ? 2 : 1;
    return firsts.filter((_, i) => i % every === 0);
  }, [data, longRange]);

  const { ticks, domain } = useMemo((): { ticks: number[] | undefined; domain: [number, number] | [string, string] } => {
    const values = data.map((d) => d.rate).concat(lines.map((l) => l.y));
    if (!values.length) return { ticks: undefined, domain: ['auto', 'auto'] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || min * 0.01;
    const lo = min - pad * 1.5;
    const hi = max + pad;
    const lastRate = last ? last.rate : NaN;
    const t = niceTicks(lo, hi, 5).filter((v) => v >= lo && v <= hi && !(Math.abs(v - lastRate) / (hi - lo) < 0.06));
    return { ticks: t, domain: [lo, hi] };
  }, [data, lines, last]);

  // Highest line labels above itself, the rest below; alternate sides so labels never share an x.
  const sorted = [...lines].sort((a, b) => b.y - a.y);

  return (
    <div className={`w-full ${height === 'fill' ? 'h-full min-h-[300px]' : ''}`} style={height === 'fill' ? undefined : { height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 24, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity={0.14} />
              <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            tickFormatter={axisDate}
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            {...(xTicks ? { ticks: xTicks, interval: 0 } : { minTickGap: 40, interval: 'preserveStartEnd' as const })}
            dy={8}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            orientation="right"
            stroke="rgba(255,255,255,0.45)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatFXRate(v, ccy)}
            width={ccy === 'JPY' ? 58 : 62}
            fontFamily="JetBrains Mono, monospace"
          />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { date: string; rate: number };
              const diff = compare ? d.rate - compare.y : 0;
              return (
                <div className="rounded-md border border-white/[0.12] bg-field px-3 py-2 text-xs shadow-lg shadow-black/40">
                  <div className="text-gray-400">{formatECBDate(d.date)}</div>
                  <div className="mt-1 flex items-baseline justify-between gap-6">
                    <span className="text-gray-300">{pairLabel}</span>
                    <span className="quote text-white text-sm">{formatFXRate(d.rate, ccy)}</span>
                  </div>
                  {compare && (
                    <div className="flex items-baseline justify-between gap-6">
                      <span className="text-gray-400">{compare.label}</span>
                      <span className="quote text-gray-300">
                        {diff >= 0 ? '+' : MINUS}
                        {formatFXRate(Math.abs(diff), ccy)}
                      </span>
                    </div>
                  )}
                </div>
              );
            }}
          />
          {sorted.map((l, i) => (
            <ReferenceLine
              key={l.label}
              y={l.y}
              stroke={l.color}
              strokeDasharray={l.dash}
              strokeWidth={l.width ?? 1.5}
              ifOverflow="extendDomain"
              label={{
                content: lineLabel(l.label, l.color, l.place ?? (i === 0 ? 'above' : 'below'), l.align ?? (i % 2 === 0 ? 'left' : 'right')),
              }}
            />
          ))}
          <Area
            type="linear"
            dataKey="rate"
            stroke="rgb(var(--accent))"
            strokeWidth={1.75}
            fill={`url(#${fillId})`}
            isAnimationActive={false}
            activeDot={{ r: 3.5, fill: 'rgb(var(--accent))', stroke: 'rgb(var(--ink))', strokeWidth: 2 }}
          />
          {last && <ReferenceLine y={last.rate} stroke="none" label={{ content: priceTag(formatFXRate(last.rate, ccy)) }} />}
          {last && <ReferenceDot x={last.date} y={last.rate} r={4.5} fill="rgb(var(--fg))" stroke="rgb(var(--accent))" strokeWidth={2} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
