import React from 'react';
import { Money } from './Money';
import { AlertMark, OkMark, WatchMark } from './StatusMark';
import { CalculatedPosition, PortfolioMetrics, Pair, SuggestedActionType } from '../types';
import { formatEUR, formatFXRate, formatPercent, formatNativeCurrency } from '../utils/formatters';

interface PositionsTableProps {
  positions: CalculatedPosition[];
  metrics: PortfolioMetrics;
  selectedPair: Pair;
  onSelectPair: (pair: Pair) => void;
}

/** Shape + colour + text, so the action never depends on colour alone. */
const ActionMark: React.FC<{ type: SuggestedActionType }> = ({ type }) =>
  type === 'urgent' ? <AlertMark /> : type === 'collar' ? <WatchMark /> : <OkMark />;

const ACTION_TEXT: Record<SuggestedActionType, string> = {
  urgent: 'text-neg',
  collar: 'text-sim',
  covered: 'text-pos',
};

const signedEUR = (v: number) => `${v > 0 ? '+' : ''}${formatEUR(v)}`;

export const PositionsTable: React.FC<PositionsTableProps> = ({ positions, metrics, selectedPair, onSelectPair }) => {
  const th = 'py-2.5 px-4 font-medium text-xs text-gray-400 whitespace-nowrap';
  const td = 'py-3.5 px-4 align-top';

  return (
    <section id="positions" className="panel print-break overflow-hidden">
      <div className="px-5 pt-5 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">Posiciones y coberturas sugeridas</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Valoración a mercado con el spot simulado. Pulsa una fila para verla en el gráfico.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Forward urgente si la pérdida supera el 2,5% del presupuesto; collar entre el 0,5% y el 2,5%.
          </p>
        </div>
      </div>

      {/* Mobile: one card per position */}
      <ul className="md:hidden border-t border-white/[0.08] divide-y divide-white/[0.06]">
        {positions.map((p) => {
          const selected = selectedPair === p.pair;
          return (
            <li key={p.pair}>
              <button
                onClick={() => onSelectPair(p.pair)}
                className={`w-full text-left px-5 py-4 ${selected ? 'bg-accent/[0.07]' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">{p.pair}</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ACTION_TEXT[p.actionType]}`}>
                    <ActionMark type={p.actionType} />
                    {p.actionLabel}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <div className="text-xs text-gray-400">Valor a mercado</div>
                    <div className="tabular-nums text-white mt-0.5">{signedEUR(p.mtmEUR)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Desviación</div>
                    <div className={`tabular-nums font-medium mt-0.5 ${p.pnlEUR < 0 ? 'text-neg' : 'text-pos'}`}>
                      <Money v={p.pnlEUR} /> <span className="text-xs text-muted font-normal">{formatPercent(p.pnlPct)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted quote">
                  {formatNativeCurrency(p.notional, p.currency)} · presupuesto {formatFXRate(p.budgetRate, p.currency)} · spot{' '}
                  {formatFXRate(p.spotSimulated, p.currency)}
                </div>
              </button>
            </li>
          );
        })}
        <li className="px-5 py-4 flex items-center justify-between">
          <span className="font-semibold text-white">Total cartera</span>
          <span className={`tabular-nums font-semibold ${metrics.totalPnlEUR < 0 ? 'text-neg' : 'text-pos'}`}>
            <Money v={metrics.totalPnlEUR} />
          </span>
        </li>
      </ul>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-[13px] border-collapse">
          <thead>
            <tr className="border-y border-white/[0.08] bg-white/[0.015]">
              <th className={th}>Par</th>
              <th className={`${th} hidden md:table-cell`}>Concepto</th>
              <th className={`${th} text-right`}>Posición nominal</th>
              <th className={`${th} text-right`}>Presup. agosto</th>
              <th className={`${th} text-right`}>Spot BCE (simulado)</th>
              <th className={`${th} text-right`}>Valor a mercado</th>
              <th className={`${th} text-right`}>Desviación</th>
              <th className={`${th} text-right`}>Vol. 30d</th>
              <th className={th}>Acción sugerida</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const selected = selectedPair === p.pair;
              const neg = p.pnlEUR < 0;
              const moved = Math.abs(p.spotSimulated - p.spotActual) > 1e-9;
              return (
                <tr
                  key={p.pair}
                  onClick={() => onSelectPair(p.pair)}
                  className={`cursor-pointer border-b border-white/[0.05] transition-colors ${
                    selected ? 'bg-accent/[0.07]' : 'hover:bg-white/[0.025]'
                  }`}
                >
                  <td className={`${td} relative`}>
                    {selected && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-accent" />}
                    <span className="font-semibold text-white">{p.pair}</span>
                  </td>
                  <td className={`${td} hidden md:table-cell`}>
                    <div className="text-gray-100">{p.name}</div>
                    <div className="text-xs text-muted mt-0.5">{p.notional > 0 ? 'Cobro (activo)' : 'Pago (pasivo)'}</div>
                  </td>
                  <td className={`${td} text-right tabular-nums text-gray-200 whitespace-nowrap`}>
                    {formatNativeCurrency(p.notional, p.currency)}
                  </td>
                  <td className={`${td} text-right quote text-gray-300`}>{formatFXRate(p.budgetRate, p.currency)}</td>
                  <td className={`${td} text-right`}>
                    <div className="quote text-white">
                      {formatFXRate(p.spotSimulated, p.currency)}
                    </div>
                    {moved && (
                      <div className="quote text-[11px] text-muted mt-0.5">hoy {formatFXRate(p.spotActual, p.currency)}</div>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums text-white whitespace-nowrap`}>{signedEUR(p.mtmEUR)}</td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    <div className={`font-medium ${neg ? 'text-neg' : 'text-pos'}`}>
                      <Money v={p.pnlEUR} />
                    </div>
                    <div className="text-xs text-muted mt-0.5">{formatPercent(p.pnlPct)}</div>
                  </td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    <div className="text-gray-200">{formatPercent(p.volAnnual * 100, false)}</div>
                    <div className="text-xs text-muted mt-0.5">VaR {formatEUR(p.var1D)}</div>
                  </td>
                  <td className={td} title={p.actionReason}>
                    <span className={`inline-flex items-center gap-2 whitespace-nowrap font-medium ${ACTION_TEXT[p.actionType]}`}>
                      <ActionMark type={p.actionType} />
                      {p.actionLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-white/[0.015]">
              <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                Total cartera
              </td>
              <td className="hidden md:table-cell" />
              <td />
              <td />
              <td />
              <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-white whitespace-nowrap">
                {signedEUR(metrics.totalMtMEUR)}
              </td>
              <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                <div className={`font-semibold ${metrics.totalPnlEUR < 0 ? 'text-neg' : 'text-pos'}`}>
                  {metrics.totalPnlEUR > 0 ? '+' : ''}
                  {formatEUR(metrics.totalPnlEUR)}
                </div>
                <div className="text-xs text-muted mt-0.5">{formatPercent(metrics.totalPnlPct)}</div>
              </td>
              <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                <div className="text-gray-200">{formatEUR(metrics.diversifiedVaR)}</div>
                <div className="text-xs text-muted mt-0.5">VaR diversificado</div>
              </td>
              <td className="py-3.5 px-4">
                <span
                  className={`inline-flex items-center gap-2 font-medium whitespace-nowrap ${
                    metrics.isBreach ? 'text-neg' : 'text-pos'
                  }`}
                >
                  {metrics.isBreach ? 'Límite superado' : 'Dentro del límite'}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};
