import React, { useEffect, useRef, useState } from 'react';
import { formatEUR, formatSignedEUR } from '../utils/formatters';

export interface WaterfallStep {
  label: string;
  sub?: string;
  value: number;
  /** total = bar from the base line; delta = bar floating from the running level */
  kind: 'total' | 'delta';
  emphasis?: boolean;
  /** drawn as a dashed outline: the figure comes from a scenario, not from the market */
  simulated?: boolean;
}

interface WaterfallProps {
  steps: WaterfallStep[];
  /** Pixel height, or 'fill' to grow with the parent (min 320). */
  height?: number | 'fill';
}

/**
 * Bridge chart: start, each effect, end. Every bar carries its own value, so
 * there is no axis to read. Losses are hatched as well as red, gains solid
 * green with a light cap, totals grey/blue: colour is never the only cue.
 * Bars build left to right on first render.
 */
export const Waterfall: React.FC<WaterfallProps> = ({ steps, height: heightProp = 340 }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [boxH, setBoxH] = useState(340);
  const fill = heightProp === 'fill';
  const height = fill ? Math.max(320, boxH - 20) : heightProp;

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => {
      setWidth(Math.max(280, e.contentRect.width));
      setBoxH(e.contentRect.height);
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  let level = 0;
  const bars = steps.map((s) => {
    if (s.kind === 'total') {
      level = s.value;
      return { ...s, from: 0, to: s.value };
    }
    const from = level;
    level += s.value;
    return { ...s, from, to: level };
  });

  const values = bars.flatMap((b) => (b.kind === 'total' ? [b.to] : [b.from, b.to]));
  const vMax = Math.max(...values);
  const vMin = Math.min(...values);
  const span = Math.max(vMax - vMin, Math.abs(vMax) * 0.04, 1);
  // the base line sits well below the lowest level, rounded to a readable figure
  const mag = Math.pow(10, Math.floor(Math.log10(span)));
  const lo = Math.max(0, Math.floor((vMin - span * 1.1) / mag) * mag);
  const hi = vMax + span * 0.3;

  const padX = 4;
  const padT = 36;
  const padB = 56;
  const plotW = width - padX * 2;
  const plotH = height - padT - padB;
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const colW = plotW / bars.length;
  const barW = Math.min(104, colW * 0.6);
  const narrow = colW < 120;
  const baseY = padT + plotH;

  return (
    <div ref={wrap} className={`w-full ${fill ? 'h-full min-h-[340px] relative' : ''}`}>
      <svg width={width} height={height} className={fill ? 'absolute inset-x-0 top-0' : ''} role="img" aria-label="Puente desde lo invertido hasta el valor en tu cuenta">
        <defs>
          <pattern id="hatch-loss" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="rgb(var(--neg))" fillOpacity="0.12" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgb(var(--neg))" strokeWidth="3" />
          </pattern>
        </defs>

        {/* base line with a break mark: bars start at `lo`, not at zero */}
        <line x1={padX} x2={padX + plotW} y1={baseY} y2={baseY} stroke="rgb(var(--fg) / 0.2)" />
        {lo > 0 && (
          <g>
            <path
              d={`M${padX},${baseY - 3} l4,-4 l4,8 l4,-8 l4,8 l4,-4`}
              fill="none"
              stroke="rgb(var(--fg) / 0.6)"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <text x={padX} y={baseY + 15} fontSize={11} fill="rgb(var(--muted))" className="tabular-nums">
              {formatEUR(lo)}
            </text>
          </g>
        )}

        {bars.map((b, i) => {
          const cx = padX + colW * i + colW / 2;
          const top = y(Math.max(b.from, b.to));
          const bottom = b.kind === 'total' ? baseY : y(Math.min(b.from, b.to));
          const h = Math.max(2, bottom - top);
          const isLoss = b.kind === 'delta' && Math.round(b.value) < 0;
          // three codes that do not depend on shade: outline (start), solid (gain / end), hatch (loss)
          const isStart = b.kind === 'total' && !b.emphasis;
          const fill = b.simulated
            ? 'rgb(var(--fg) / 0.06)'
            : isStart
            ? 'rgb(var(--fg) / 0.04)'
            : b.kind === 'total'
            ? 'rgb(var(--accent))'
            : isLoss
            ? 'url(#hatch-loss)'
            : 'rgb(var(--fg) / 0.88)';
          const stroke = b.simulated ? 'rgb(var(--fg))' : isStart ? 'rgb(var(--fg) / 0.7)' : isLoss ? 'rgb(var(--neg))' : 'none';
          const valueText =
            b.kind === 'total' ? formatEUR(b.value) : `${Math.round(b.value) < 0 ? '▽' : '▲'} ${formatSignedEUR(b.value)}`;
          const valueColor = b.kind === 'total' ? 'rgb(var(--fg))' : isLoss ? 'rgb(var(--neg))' : 'rgb(var(--pos))';
          const fontSize = b.emphasis ? (narrow ? 15 : 20) : narrow ? 12 : 15;
          const next = bars[i + 1];
          return (
            <g key={i}>
              <g className="bar-in" style={{ animationDelay: `${i * 250}ms` }}>
                <rect
                  x={cx - barW / 2}
                  y={top}
                  width={barW}
                  height={h}
                  rx={3}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={stroke === 'none' ? 0 : 1.5}
                  strokeDasharray={b.simulated ? '5 4' : undefined}
                  style={{ transition: 'y 320ms ease, height 320ms ease' }}
                />
              </g>
              <text
                className="label-in tabular-nums"
                style={{ animationDelay: `${i * 250 + 200}ms` }}
                x={cx}
                y={top - 10}
                textAnchor="middle"
                fontSize={fontSize}
                fontWeight={b.emphasis ? 700 : 600}
                fill={valueColor}
              >
                {valueText}
              </text>
              <text x={cx} y={baseY + 22} textAnchor="middle" fontSize={narrow ? 12 : 13} fill="rgb(var(--fg) / 0.92)" fontWeight={500}>
                {b.label}
              </text>
              {b.sub && !narrow && (
                <text x={cx} y={baseY + 40} textAnchor="middle" fontSize={12} fill="rgb(var(--muted))">
                  {b.sub}
                </text>
              )}
              {next && (
                <line
                  x1={cx + barW / 2}
                  x2={padX + colW * (i + 1) + colW / 2 - barW / 2}
                  y1={y(b.to)}
                  y2={y(b.to)}
                  stroke="rgb(var(--fg) / 0.4)"
                  strokeDasharray="3 3"
                  style={{ transition: 'all 320ms ease' }}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
