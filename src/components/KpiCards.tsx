import React from 'react';
import { AlertMark, OkMark } from './StatusMark';
import { PortfolioMetrics } from '../types';
import { formatEUR, formatPercent } from '../utils/formatters';

interface KpiCardsProps {
  metrics: PortfolioMetrics;
}

const Cell: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className = '',
}) => (
  <div className={`p-5 flex flex-col min-w-0 border-white/[0.08] border-b sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0 sm:[&:nth-child(n+3)]:border-b-0 ${className}`}>
    <span className="text-[13px] text-gray-400">{label}</span>
    {children}
  </div>
);

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics }) => {
  const pnlNegative = metrics.totalPnlEUR < 0;
  const loss = Math.max(0, -metrics.totalPnlEUR);
  const limitAbs = Math.abs(metrics.riskLimit);
  const usage = loss / limitAbs; // 1 = limit fully consumed
  const fillPct = Math.min(usage, 1) * 100; // right edge of the bar = the limit

  return (
    <section
      aria-label="Indicadores de la cartera"
      className="panel print-break grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 overflow-hidden"
    >
      <Cell label="Exposición neta total">
        <span className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums text-white">
          {formatEUR(metrics.totalMtMEUR)}
        </span>
        <dl className="mt-auto pt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-400">Activos FX</dt>
          <dd className="text-right tabular-nums text-gray-200 whitespace-nowrap">{formatEUR(metrics.totalAssetsEUR)}</dd>
          <dt className="text-gray-400">Pasivos FX</dt>
          <dd className="text-right tabular-nums text-gray-200 whitespace-nowrap">{formatEUR(-metrics.totalLiabilitiesEUR)}</dd>
        </dl>
      </Cell>

      <Cell label="Desviación frente al presupuesto">
        <span
          className={`mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${
            pnlNegative ? 'text-neg' : 'text-pos'
          }`}
        >
          {metrics.totalPnlEUR > 0 ? '+' : ''}
          {formatEUR(metrics.totalPnlEUR)}
        </span>
        <dl className="mt-auto pt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-400">Desviación</dt>
          <dd className={`text-right tabular-nums font-medium ${pnlNegative ? 'text-neg' : 'text-pos'}`}>
            {formatPercent(metrics.totalPnlPct)}
          </dd>
          <dt className="text-gray-400">Valor presupuestado</dt>
          <dd className="text-right tabular-nums text-gray-200 whitespace-nowrap">{formatEUR(metrics.totalBudgetEUR)}</dd>
        </dl>
      </Cell>

      <Cell label="VaR diversificado 95%, 1 día">
        <span className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums text-white">
          {formatEUR(metrics.diversifiedVaR)}
        </span>
        <dl className="mt-auto pt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-400">Suma VaR individual</dt>
          <dd className="text-right tabular-nums text-gray-200 whitespace-nowrap">{formatEUR(metrics.undiversifiedVaR)}</dd>
          <dt className="text-gray-400">Ahorro por diversificación</dt>
          <dd className="text-right tabular-nums text-gray-200 whitespace-nowrap">
            {formatEUR(metrics.diversificationBenefitEUR)}{' '}
            <span className="text-gray-400">({formatPercent(metrics.diversificationBenefitPct, false, 1)})</span>
          </dd>
        </dl>
      </Cell>

      <Cell
        label="Consumo del límite de pérdida"
        className={metrics.isBreach ? 'bg-white/[0.05]' : ''}
      >
        <span
          id="risk-limit-status"
          className={`mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${
            metrics.isBreach ? 'text-neg' : usage > 0.75 ? 'text-sim' : 'text-white'
          }`}
        >
          {Math.round(usage * 100)}%
        </span>
        <div className="mt-auto pt-4">
          <div className="relative h-1.5 rounded-full bg-white/[0.08]" aria-hidden="true">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${
                metrics.isBreach ? 'bg-neg' : usage > 0.75 ? 'bg-sim' : 'bg-pos'
              }`}
              style={{ width: `${fillPct}%`, transition: 'width 300ms ease' }}
            />
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-medium ${metrics.isBreach ? 'text-neg' : 'text-pos'}`}>
              {metrics.isBreach ? <AlertMark /> : <OkMark />}
              {metrics.isBreach ? 'Límite superado' : 'Dentro del límite'}
            </span>
            <span className="tabular-nums text-gray-400">de {formatEUR(metrics.riskLimit)}</span>
          </div>
        </div>
      </Cell>
    </section>
  );
};
