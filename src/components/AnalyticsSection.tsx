import React, { useMemo } from 'react';
import { AlertMark, OkMark } from './StatusMark';
import { RotateCcw } from 'lucide-react';
import { Pair, Currency, HistoricalRatePoint, CalculatedPosition } from '../types';
import { formatFXRate, formatPercent, formatEUR, formatSignedEUR, formatECBDate, MINUS } from '../utils/formatters';
import { RISK_LIMIT_EUR, Shocks, NO_SHOCK, uniformShock } from '../services/quantEngine';
import { RateChart } from './RateChart';

interface AnalyticsSectionProps {
  selectedPair: Pair;
  onSelectPair: (pair: Pair) => void;
  shocks: Shocks;
  onShocksChange: (shocks: Shocks) => void;
  history: HistoricalRatePoint[];
  positions: CalculatedPosition[];
}

const PAIRS: { pair: Pair; currency: Currency }[] = [
  { pair: 'EUR/USD', currency: 'USD' },
  { pair: 'EUR/GBP', currency: 'GBP' },
  { pair: 'EUR/JPY', currency: 'JPY' },
  { pair: 'EUR/CHF', currency: 'CHF' },
];

const SHOCK_MIN = -0.1;
const SHOCK_MAX = 0.1;
const CURRENCIES: Currency[] = ['USD', 'GBP', 'JPY', 'CHF'];

export function scenarioPnl(positions: CalculatedPosition[], shocks: Shocks): number {
  return positions.reduce(
    (acc, p) => acc + (p.notional / (p.spotActual * (1 + shocks[p.currency])) - p.notional / p.budgetRate),
    0
  );
}

/** Shocks that take every pair back to its budget rate. */
export function backToBudget(positions: CalculatedPosition[]): Shocks {
  const s = { ...NO_SHOCK };
  positions.forEach((p) => (s[p.currency] = p.budgetRate / p.spotActual - 1));
  return s;
}

const sameShocks = (a: Shocks, b: Shocks) => CURRENCIES.every((c) => Math.abs(a[c] - b[c]) < 1e-6);

export const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
  selectedPair,
  onSelectPair,
  shocks,
  onShocksChange,
  history,
  positions,
}) => {
  const meta = PAIRS.find((p) => p.pair === selectedPair) || PAIRS[0];
  const pos = positions.find((p) => p.pair === selectedPair);
  const ccy = meta.currency;

  const chartData = useMemo(
    () => history.map((pt) => ({ date: pt.date, rate: pt[ccy] })).filter((d) => typeof d.rate === 'number' && isFinite(d.rate)),
    [history, ccy]
  );

  const isUniform = CURRENCIES.every((c) => Math.abs(shocks[c] - shocks.USD) < 1e-9);
  const moved = CURRENCIES.filter((c) => Math.abs(shocks[c]) > 1e-9);
  const single = !isUniform && moved.length === 1 ? moved[0] : null;
  const sliderValue = isUniform ? shocks.USD : 0;
  const pairShock = shocks[ccy];
  const simulatedPnl = useMemo(() => scenarioPnl(positions, shocks), [positions, shocks]);

  const thumbPos = ((sliderValue - SHOCK_MIN) / (SHOCK_MAX - SHOCK_MIN)) * 100;
  const shockColor = sliderValue < 0 ? 'rgb(var(--neg))' : sliderValue > 0 ? 'rgb(var(--pos))' : 'rgba(255,255,255,0.55)';
  const trackFill =
    !isUniform || sliderValue === 0
      ? 'rgba(255,255,255,0.14)'
      : `linear-gradient(90deg, rgba(255,255,255,0.14) ${Math.min(thumbPos, 50)}%, ${shockColor} ${Math.min(thumbPos, 50)}%, ${shockColor} ${Math.max(
          thumbPos,
          50
        )}%, rgba(255,255,255,0.14) ${Math.max(thumbPos, 50)}%)`;
  const pctText = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`;

  const scenarios = useMemo(
    () => [
      { id: 'btn-scenario-base', label: 'Mercado actual', note: 'Tipos BCE de hoy', shocks: NO_SHOCK },
      {
        id: 'btn-scenario-usd-up',
        label: 'El dólar sube otro 5%',
        note: 'Solo EUR/USD',
        shocks: { ...NO_SHOCK, USD: 1 / 1.05 - 1 },
      },
      {
        id: 'btn-scenario-budget',
        label: 'Tipos del presupuesto',
        note: 'Los de agosto',
        shocks: backToBudget(positions),
      },
      {
        id: 'btn-scenario-global-shock',
        label: 'Shock de liquidez global',
        note: 'Euro −8,5% frente a todas',
        shocks: uniformShock(-0.085),
      },
    ],
    [positions]
  );

  const lines = pos
    ? [
        { y: pos.budgetRate, label: `Presupuesto ${formatFXRate(pos.budgetRate, ccy)}`, color: 'rgb(var(--ref))', dash: '6 4' },
        ...(Math.abs(pairShock) > 1e-9
          ? [{ y: pos.spotSimulated, label: `Simulado ${formatFXRate(pos.spotSimulated, ccy)}`, color: 'rgb(var(--sim))', dash: '2 4', width: 2 }]
          : []),
      ]
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Chart */}
      <section className="panel print-break lg:col-span-8 p-5 flex flex-col min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">Tipo de cambio frente al presupuesto</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Fixing diario del BCE, últimos {chartData.length} días hábiles
              {chartData.length > 0 && <>, hasta el {formatECBDate(chartData[chartData.length - 1].date)}</>}
            </p>
          </div>
          <div role="tablist" aria-label="Par de divisas" className="flex self-start rounded-md border border-white/[0.08] p-0.5 bg-ink">
            {PAIRS.map(({ pair }) => {
              const active = selectedPair === pair;
              return (
                <button
                  key={pair}
                  role="tab"
                  aria-selected={active}
                  id={`btn-pair-${pair.replace('/', '-')}`}
                  onClick={() => onSelectPair(pair)}
                  className={`h-7 px-2.5 rounded-[5px] text-xs font-medium tabular-nums transition-colors ${
                    active ? 'bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {pair}
                </button>
              );
            })}
          </div>
        </div>

        {pos && (
          <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-6">
            <div>
              <dt className="text-xs text-gray-400">Cambio BCE hoy</dt>
              <dd className="quote text-lg text-white mt-0.5">{formatFXRate(pos.spotActual, ccy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Presupuesto (agosto)</dt>
              <dd className="quote text-lg text-ref mt-0.5">{formatFXRate(pos.budgetRate, ccy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Spot simulado</dt>
              <dd className={`quote text-lg mt-0.5 ${Math.abs(pairShock) > 1e-9 ? 'text-sim' : 'text-muted'}`}>
                {formatFXRate(pos.spotSimulated, ccy)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Volatilidad 30d anual</dt>
              <dd className="quote text-lg text-white mt-0.5">{formatPercent(pos.volAnnual * 100, false)}</dd>
            </div>
          </dl>
        )}

        <div className="mt-4 flex-1 min-h-[300px]">
          <RateChart
            height="fill"
            data={chartData}
            ccy={ccy}
            pairLabel={selectedPair}
            lines={lines}
            compare={pos ? { y: pos.budgetRate, label: 'vs presupuesto' } : undefined}
            fillId="companyFill"
          />
        </div>
      </section>

      {/* Stress simulator */}
      <section className="panel print-break lg:col-span-4 p-5 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">Simulador de escenarios</h2>
            <p className="text-xs text-gray-400 mt-0.5">Mueve el euro frente a las cuatro divisas</p>
          </div>
          <button
            onClick={() => onShocksChange(NO_SHOCK)}
            disabled={sameShocks(shocks, NO_SHOCK)}
            className="no-print inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-0 disabled:pointer-events-none transition"
          >
            <RotateCcw className="w-3 h-3" />
            Reiniciar
          </button>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-400 mb-1.5">{single ? 'Movimiento de la divisa' : 'Euro frente a las divisas'}</div>
            <div
              id="current-shock-value"
              className="text-[40px] leading-none font-semibold tracking-[-0.03em] tabular-nums"
              style={{ color: !isUniform ? 'rgb(var(--sim))' : sliderValue === 0 ? 'rgb(var(--fg))' : shockColor }}
            >
              {isUniform ? pctText(sliderValue) : single ? `${single} ${pctText(1 / (1 + shocks[single]) - 1)}` : 'Varias'}
            </div>
            <div className="text-xs text-gray-400 mt-2 truncate">
              {!isUniform && single
                ? `Euro ${pctText(shocks[single])} frente a ${single}`
                : !isUniform
                ? CURRENCIES.filter((c) => Math.abs(shocks[c]) > 1e-9)
                    .map((c) => `${c} ${pctText(shocks[c])}`)
                    .join(', ')
                : sliderValue < 0
                ? 'El euro se deprecia'
                : sliderValue > 0
                ? 'El euro se aprecia'
                : 'Sin movimiento: tipos de hoy'}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-gray-400 mb-1.5">Desviación</div>
            <div
              className={`text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${
                simulatedPnl < 0 ? 'text-neg' : 'text-pos'
              }`}
            >
              {formatSignedEUR(simulatedPnl)}
            </div>
            <div className="text-xs text-gray-400 mt-2 tabular-nums">límite {formatEUR(RISK_LIMIT_EUR)}</div>
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor="stress-slider" className="sr-only">
            Movimiento del euro frente a todas las divisas
          </label>
          <div className="relative">
            <span className="absolute top-[19px] left-1/2 w-0.5 h-2.5 -translate-x-1/2 bg-gray-300 pointer-events-none" />
            <input
              id="stress-slider"
              type="range"
              min={SHOCK_MIN}
              max={SHOCK_MAX}
              step={0.005}
              value={sliderValue}
              onChange={(e) => onShocksChange(uniformShock(parseFloat(e.target.value)))}
              className="shock-range relative"
              style={{ ['--track' as string]: trackFill }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums">
            <span>{MINUS}10%</span>
            <span>0</span>
            <span>+10%</span>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-xs text-gray-400 mb-2">Escenarios</h3>
          <ul className="flex flex-col gap-1.5">
            {scenarios.map((s) => {
              const active = sameShocks(shocks, s.shocks);
              const pnl = scenarioPnl(positions, s.shocks);
              const breach = pnl < RISK_LIMIT_EUR;
              return (
                <li key={s.id}>
                  <button
                    id={s.id}
                    onClick={() => onShocksChange(s.shocks)}
                    aria-pressed={active}
                    className={`w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                      active ? 'border-accent/60 bg-accent/[0.10]' : 'border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] text-gray-100">{s.label}</span>
                      <span className="block text-[11px] text-muted">{s.note}</span>
                    </span>
                    <span className="flex flex-col items-end shrink-0">
                      <span className={`text-[13px] font-medium tabular-nums ${Math.round(pnl) < 0 ? 'text-neg' : 'text-pos'}`}>
                        {formatSignedEUR(pnl)}
                      </span>
                      <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                        {breach ? <AlertMark className="w-2.5 h-2.5" /> : <OkMark className="w-2.5 h-2.5" />}
                        {breach ? 'supera el límite' : 'dentro del límite'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
};
