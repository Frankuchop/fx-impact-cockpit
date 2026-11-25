import React, { useState } from 'react';
import { AlertMark } from './StatusMark';
import { CalculatedPosition, HistoricalRatePoint, Pair, PortfolioMetrics, Currency } from '../types';
import { RISK_LIMIT_EUR, Shocks, NO_SHOCK, uniformShock } from '../services/quantEngine';
import { formatEUR, formatSignedEUR, formatPercent, MINUS } from '../utils/formatters';
import { parseQuestion, eurShockFor, CURRENCY_NAME } from '../utils/askParser';
import { AskBar, AskAnswer } from './AskBar';
import { KpiCards } from './KpiCards';
import { AnalyticsSection, scenarioPnl, backToBudget } from './AnalyticsSection';
import { PositionsTable } from './PositionsTable';

interface CompanyViewProps {
  positions: CalculatedPosition[];
  metrics: PortfolioMetrics;
  history: HistoricalRatePoint[];
  shocks: Shocks;
  onShocksChange: (s: Shocks) => void;
  selectedPair: Pair;
  onSelectPair: (p: Pair) => void;
}

const SUGGESTIONS = [
  '¿Qué divisa pesa más?',
  '¿Y si el dólar sube un 5%?',
  '¿Qué tengo que cubrir?',
  '¿Y si volvemos al presupuesto?',
];

const Num: React.FC<{ v: number; children?: React.ReactNode }> = ({ v, children }) => (
  <span className={`tabular-nums font-semibold ${Math.round(v) < 0 ? 'text-neg' : 'text-pos'}`}>
    {children ?? formatSignedEUR(v)}
  </span>
);

const limitText = (pnl: number) =>
  pnl < RISK_LIMIT_EUR
    ? `El límite es ${formatEUR(Math.abs(RISK_LIMIT_EUR))}: se supera en ${formatEUR(RISK_LIMIT_EUR - pnl)}.`
    : `Dentro del límite de ${formatEUR(Math.abs(RISK_LIMIT_EUR))}.`;

export const CompanyView: React.FC<CompanyViewProps> = ({
  positions,
  metrics,
  history,
  shocks,
  onShocksChange,
  selectedPair,
  onSelectPair,
}) => {
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null);

  const basePnl = scenarioPnl(positions, NO_SHOCK);
  const isBase = (['USD', 'GBP', 'JPY', 'CHF'] as Currency[]).every((c) => Math.abs(shocks[c]) < 1e-9);
  const losers = [...positions].filter((p) => p.pnlEUR < 0).sort((a, b) => a.pnlEUR - b.pnlEUR);
  const grossLoss = losers.reduce((a, p) => a + p.pnlEUR, 0);
  const worst = losers[0];

  const handleAsk = (q: string) => {
    const intent = parseQuestion(q);
    if (intent.kind === 'move' && intent.currency !== 'EUR' && !positions.some((p) => p.currency === intent.currency)) {
      setScenarioLabel(null);
      setAnswer({ body: <>La empresa no tiene posiciones en {CURRENCY_NAME[intent.currency]}: ese movimiento no le afecta.</> });
      return;
    }
    if (intent.kind === 'move') {
      const s: Shocks =
        intent.currency === 'EUR'
          ? uniformShock(intent.change)
          : { ...NO_SHOCK, [intent.currency as Currency]: eurShockFor(intent.change, intent.currency) };
      const pnl = scenarioPnl(positions, s);
      const verb = intent.change < 0 ? 'cae' : 'sube';
      const pct = formatPercent(Math.abs(intent.change) * 100, false, 1).replace(',0%', '%');
      onShocksChange(s);
      setScenarioLabel(`${intent.currency === 'EUR' ? 'Euro' : intent.currency} ${intent.change < 0 ? MINUS : '+'}${pct}`);
      setAnswer({
        headline: <Num v={pnl} />,
        body: (
          <>
            Si {CURRENCY_NAME[intent.currency]} {verb} un {pct}, la desviación pasa de <Num v={basePnl} /> a esta cifra. {limitText(pnl)}
          </>
        ),
      });
      return;
    }
    if (intent.kind === 'budget') {
      const s = backToBudget(positions);
      onShocksChange(s);
      setScenarioLabel('Tipos de agosto');
      const usd = positions.find((p) => p.currency === 'USD');
      const need = usd ? (usd.budgetRate / usd.spotActual - 1) * 100 : 0;
      setAnswer({
        headline: <span className="text-white">0 €</span>,
        body: (
          <>
            Con los tipos de agosto no habría desviación. Para volver ahí, el euro tendría que recuperar un{' '}
            <span className="tabular-nums font-semibold text-white">{formatPercent(need, false, 1)}</span> frente al dólar.
          </>
        ),
      });
      return;
    }
    if (intent.kind === 'hedge') {
      const urgent = positions.filter((p) => p.actionType === 'urgent');
      const natural = positions.filter((p) => p.pnlEUR > 0);
      setScenarioLabel(null);
      setAnswer({
        headline: urgent.length ? <span className="text-white">{urgent.map((p) => p.currency).join(' + ')}</span> : undefined,
        body: urgent.length ? (
          <>
            Prioridad:{' '}
            {urgent.map((p, i) => (
              <React.Fragment key={p.currency}>
                {i > 0 && (i === urgent.length - 1 ? ' y ' : ', ')}
                {p.currency} (<Num v={p.pnlEUR} />)
              </React.Fragment>
            ))}
            : ya pierden más de un 2,5% frente al presupuesto.
            {natural.length > 0 && (
              <>
                {' '}
                {natural.map((p) => p.currency).join(' y ')} compensa <Num v={natural.reduce((a, p) => a + p.pnlEUR, 0)} /> de forma
                natural.
              </>
            )}
          </>
        ) : (
          <>Ninguna posición pierde más de un 2,5% frente al presupuesto. Con vigilar basta.</>
        ),
      });
      return;
    }
    if (intent.kind === 'biggest') {
      setScenarioLabel(null);
      setAnswer({
        headline: worst ? <Num v={worst.pnlEUR} /> : undefined,
        body: worst ? (
          <>
            {CURRENCY_NAME[worst.currency].replace(/^./, (c) => c.toUpperCase())}: el{' '}
            <span className="tabular-nums font-semibold text-white">{Math.round((worst.pnlEUR / grossLoss) * 100)}%</span> de todo lo que
            se pierde por divisa.
          </>
        ) : (
          <>Ninguna divisa está restando frente al presupuesto.</>
        ),
      });
      return;
    }
    if (intent.kind === 'reset') {
      onShocksChange(NO_SHOCK);
      setScenarioLabel(null);
      setAnswer({ body: <>Vuelves a los tipos BCE de hoy.</> });
      return;
    }
    setScenarioLabel(null);
    setAnswer({
      body: (
        <span className="text-gray-300">
          No sé responder a eso todavía. Prueba con un movimiento de divisa ("¿y si el yen cae un 3%?"), "¿qué tengo que cubrir?" o
          "¿qué divisa me hace más daño?".
        </span>
      ),
    });
  };

  const pnl = metrics.totalPnlEUR;

  return (
    <>
      {/* Hero: the answer first */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-6 pt-1">
        <div className="lg:col-span-7">
          <p className="text-sm text-gray-400">
            Empresa importadora: presupuesto de agosto frente a los tipos BCE {isBase ? 'de hoy' : 'del escenario'}
          </p>
          <h2 className="mt-3 text-[34px] sm:text-[48px] leading-[1.06] font-semibold tracking-[-0.035em] text-white [text-wrap:balance]">
            {Math.round(pnl) < 0 ? (
              <>
                El tipo de cambio cuesta <Num v={pnl}>{formatEUR(Math.abs(pnl))}</Num> al&nbsp;presupuesto.
              </>
            ) : (
              <>
                El tipo de cambio suma <Num v={pnl}>{formatEUR(pnl)}</Num> al&nbsp;presupuesto.
              </>
            )}
          </h2>
          <p className="mt-4 text-[16px] sm:text-[17px] leading-relaxed text-gray-300 max-w-[62ch] [text-wrap:pretty]">
            {limitText(pnl)}
            {worst && Math.round(pnl) < 0 && (
              <>
                {' '}
                Lo que más pesa: {CURRENCY_NAME[worst.currency]} (<Num v={worst.pnlEUR} />).
              </>
            )}
          </p>
          {metrics.isBreach && (
            <button
              onClick={() => document.getElementById('positions')?.scrollIntoView({ behavior: 'smooth' })}
              className="no-print mt-5 inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium text-neg bg-neg/15 border border-neg/40 hover:bg-neg/25 transition-colors"
            >
              <AlertMark />
              Ver coberturas sugeridas
            </button>
          )}
        </div>
        <div className="lg:col-span-5 lg:pt-8">
          <AskBar
            suggestions={SUGGESTIONS}
            onAsk={handleAsk}
            answer={answer}
            scenarioLabel={scenarioLabel}
            onClear={() => {
              onShocksChange(NO_SHOCK);
              setScenarioLabel(null);
              setAnswer(null);
            }}
            reserve="lg:min-h-[200px]"
          />
        </div>
      </section>

      <KpiCards metrics={metrics} />
      <AnalyticsSection
        selectedPair={selectedPair}
        onSelectPair={onSelectPair}
        shocks={shocks}
        onShocksChange={(s) => {
          onShocksChange(s);
          setScenarioLabel(null);
          setAnswer(null);
        }}
        history={history}
        positions={positions}
      />
      <PositionsTable positions={positions} metrics={metrics} selectedPair={selectedPair} onSelectPair={onSelectPair} />
    </>
  );
};
