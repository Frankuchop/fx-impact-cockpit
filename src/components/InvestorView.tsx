import React, { useEffect, useMemo, useState } from 'react';
import { Currency, HistoricalRatePoint } from '../types';
import { fetchSeries, todayISO } from '../services/fxSeries';
import { formatEUR, formatSignedEUR, formatPercent, formatFXRate, formatECBDate, MINUS } from '../utils/formatters';
import { parseQuestion, eurShockFor, CURRENCY_NAME } from '../utils/askParser';
import { AskBar, AskAnswer } from './AskBar';
import { Waterfall } from './Waterfall';
import { RateChart } from './RateChart';

interface Preset {
  id: string;
  chip: string;
  asset: string;
  currency: Currency;
  amount: number;
  buy: string;
  end: string; // '' = today
  ret: number; // % in the asset's own currency
}

const PRESETS: Preset[] = [
  { id: 'sp2025', chip: 'S&P 500 en 2025', asset: 'Fondo S&P 500 sin cobertura', currency: 'USD', amount: 10000, buy: '2025-01-02', end: '2025-12-31', ret: 14 },
  { id: 'aug2026', chip: 'Comprado en agosto, bolsa plana', asset: 'Fondo S&P 500 sin cobertura', currency: 'USD', amount: 10000, buy: '2026-08-25', end: '', ret: 0 },
];

const CCY_LABEL: Record<Currency, string> = { USD: 'dólares', GBP: 'libras', JPY: 'yenes', CHF: 'francos' };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const Field: React.FC<{ label: string; htmlFor: string; children: React.ReactNode; hint?: string }> = ({ label, htmlFor, children, hint }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <label htmlFor={htmlFor} className="text-xs text-gray-400">
      {label}
    </label>
    {children}
    {hint && <span className="text-[11px] text-muted">{hint}</span>}
  </div>
);

const inputCls =
  'h-9 w-full min-w-0 rounded-md bg-field border border-white/[0.10] px-2.5 text-sm text-white tabular-nums outline-none focus:border-accent/70 [color-scheme:dark]';

export const InvestorView: React.FC<{ offline?: boolean }> = ({ offline = false }) => {
  const today = todayISO();
  const [presetId, setPresetId] = useState('sp2025');
  const [asset, setAsset] = useState(PRESETS[0].asset);
  const [currency, setCurrency] = useState<Currency>(PRESETS[0].currency);
  const [amount, setAmount] = useState(PRESETS[0].amount);
  const [buy, setBuy] = useState(PRESETS[0].buy);
  const [end, setEnd] = useState(PRESETS[0].end || today);
  const [ret, setRet] = useState(PRESETS[0].ret);
  const [fxShock, setFxShock] = useState(0);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null);
  const [series, setSeries] = useState<HistoricalRatePoint[]>([]);
  const [live, setLive] = useState(true);

  const applyPreset = (p: Preset) => {
    setPresetId(p.id);
    setAsset(p.asset);
    setCurrency(p.currency);
    setAmount(p.amount);
    setBuy(p.buy);
    setEnd(p.end || today);
    setRet(p.ret);
    setFxShock(0);
    setAnswer(null);
    setScenarioLabel(null);
  };

  const custom = () => {
    if (presetId !== 'custom') setPresetId('custom');
  };

  useEffect(() => {
    if (!buy || !end || buy >= end) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const res = await fetchSeries(buy, end, offline);
      if (cancelled) return;
      setSeries(res.series);
      setLive(res.live);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [buy, end, offline]);

  const calc = useMemo(() => {
    if (series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const buyRate = first[currency];
    const endRate = last[currency] * (1 + fxShock);
    const r = ret / 100;
    const A = amount || 0;
    const valueEUR = (A * buyRate * (1 + r)) / endRate;
    const market = A * r;
    const fx = valueEUR - A * (1 + r);
    return {
      buyRate,
      endRate,
      rawEndRate: last[currency],
      buyDate: first.date,
      endDate: last.date,
      valueEUR,
      market,
      fx,
      totalPct: (valueEUR / A - 1) * 100,
      fxPct: (buyRate / endRate - 1) * 100,
      hedgedValue: A * (1 + r),
    };
  }, [series, currency, fxShock, ret, amount]);

  const chartData = useMemo(() => series.map((p) => ({ date: p.date, rate: p[currency] })), [series, currency]);


  const ccyName = CURRENCY_NAME[currency];
  const ccyCap = capital(ccyName);
  const pctMove = (change: number) => formatPercent(Math.abs(change) * 100, false, 1).replace(',0%', '%');

  const handleAsk = (q: string) => {
    if (!calc) return;
    const intent = parseQuestion(q);
    if (intent.kind === 'move') {
      if (intent.currency !== 'EUR' && intent.currency !== currency) {
        setAnswer({ body: <>Tu inversión está en {CCY_LABEL[currency]}: {CURRENCY_NAME[intent.currency]} no le afecta.</> });
        return;
      }
      const s = eurShockFor(intent.change, intent.currency);
      const newEnd = calc.rawEndRate * (1 + s);
      const newValue = (amount * calc.buyRate * (1 + ret / 100)) / newEnd;
      const pct = pctMove(intent.change);
      setFxShock(s);
      setScenarioLabel(`${intent.currency === 'EUR' ? 'Euro' : intent.currency} ${intent.change < 0 ? MINUS : '+'}${pct}`);
      setAnswer({
        headline: (
          <span className={Math.round(newValue - amount) < 0 ? 'text-neg' : 'text-pos'}>
            {formatPercent((newValue / amount - 1) * 100, true, 1)}
          </span>
        ),
        body: (
          <>
            Si {CURRENCY_NAME[intent.currency]} {intent.change < 0 ? 'cae' : 'sube'} un {pct} más, tu inversión valdría{' '}
            <b className="text-white tabular-nums">{formatEUR(newValue)}</b>.
          </>
        ),
      });
      return;
    }
    if (intent.kind === 'hedge') {
      setScenarioLabel(null);
      setFxShock(0);
      setAnswer({
        headline: <span className={ret < 0 ? 'text-neg' : 'text-pos'}>{formatPercent(ret, true, 1)}</span>,
        body: (
          <>
            Con la divisa cubierta habrías ganado lo mismo que la bolsa, <span className="tabular-nums">{formatSignedEUR(calc.market)}</span>, en
            lugar de <span className="tabular-nums">{formatPercent(calc.totalPct, true, 1)}</span>.{' '}
            <span className="text-gray-400">Sin descontar el coste de la cobertura.</span>
          </>
        ),
      });
      return;
    }
    if (intent.kind === 'biggest') {
      setScenarioLabel(null);
      const share = calc.market > 0 ? Math.abs(calc.fx / calc.market) * 100 : 0;
      setAnswer({
        headline: <span className={calc.fx < 0 ? 'text-neg' : 'text-pos'}>{formatSignedEUR(calc.fx)}</span>,
        body:
          calc.fx < 0 && calc.market > 0 ? (
            <>
              Es lo que {ccyName} le quitó a tu inversión: el <b className="tabular-nums text-white">{Math.round(share)}%</b> de lo que ganó la
              bolsa.
            </>
          ) : calc.fx < 0 ? (
            <>Es lo que {ccyName} le quitó a tu inversión.</>
          ) : (
            <>Es lo que {ccyName} le sumó a tu inversión, sin que la bolsa tuviera nada que ver.</>
          ),
      });
      return;
    }
    if (intent.kind === 'reset') {
      setFxShock(0);
      setScenarioLabel(null);
      setAnswer({ body: <>Vuelves a los tipos reales del BCE.</> });
      return;
    }
    setAnswer({
      body: (
        <span className="text-gray-300">
          No sé responder a eso todavía. Prueba con "¿y si hubiera cubierto la divisa?" o "¿y si {ccyName} cae un 10%?".
        </span>
      ),
    });
  };

  const suggestions = [
    '¿Y si lo hubiera cubierto?',
    `¿Cuánto me ha ${calc && calc.fx < 0 ? 'costado' : 'sumado'} ${ccyName}?`,
    `¿Y si ${ccyName} cae un 10%?`,
  ];

  const lines = calc
    ? [
        {
          y: calc.buyRate,
          label: `Tu cambio de compra ${formatFXRate(calc.buyRate, currency)}`,
          color: 'rgb(var(--ref))',
          dash: '6 4',
          place: 'above' as const,
          align: 'right' as const,
        },
        ...(fxShock !== 0
          ? [
              {
                y: calc.endRate,
                label: `Simulado ${formatFXRate(calc.endRate, currency)}`,
                color: 'rgb(var(--sim))',
                dash: '2 4',
                width: 2,
                place: (calc.endRate > calc.buyRate ? 'above' : 'below') as 'above' | 'below',
                align: 'left' as const,
              },
            ]
          : []),
      ]
    : [];

  const neutral = calc ? Math.abs(calc.totalPct) < 1 : false;
  const simulated = fxShock !== 0;

  // Second hero line: what the currency did, in money
  const fxLine = calc ? (
    calc.fx < 0 ? (
      calc.market > 0 && Math.abs(calc.fx) > calc.market ? (
        <>
          {ccyCap} perdió un {formatPercent(Math.abs(calc.fxPct), false, 1)} frente al euro: se llevó los{' '}
          {formatEUR(calc.market)} que ganó la bolsa y <span className="text-neg font-semibold">{formatEUR(Math.abs(calc.fx) - calc.market)}</span> de
          tu dinero.
        </>
      ) : calc.market > 0 ? (
        <>
          {ccyCap} perdió un {formatPercent(Math.abs(calc.fxPct), false, 1)} frente al euro y se llevó{' '}
          <span className="text-neg font-semibold">{formatEUR(Math.abs(calc.fx))}</span> de los {formatEUR(calc.market)} que ganó la
          bolsa. Esto no aparece en tu extracto.
        </>
      ) : (
        <>
          {ccyCap} perdió un {formatPercent(Math.abs(calc.fxPct), false, 1)} frente al euro y te costó{' '}
          <span className="text-neg font-semibold">{formatEUR(Math.abs(calc.fx))}</span>.
        </>
      )
    ) : (
      <>
        {ccyCap} ganó un {formatPercent(Math.abs(calc.fxPct), false, 1)} frente al euro y te sumó{' '}
        <span className="text-pos font-semibold">{formatEUR(calc.fx)}</span> sin que hicieras nada. El efecto puede darse la vuelta.
      </>
    )
  ) : null;

  return (
    <>
      {/* Hero: two numbers, one gap */}
      <section className="pt-1">
        <p className="text-sm text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-1">
          {simulated && scenarioLabel && (
            <span className="inline-flex items-center h-5 px-1.5 rounded bg-sim/15 text-sim text-[11px] font-medium">
              Escenario: {scenarioLabel}
            </span>
          )}
          <span>
            {asset}, {formatEUR(amount)} invertidos
            {calc && (
              <>
                {' '}
                del {formatECBDate(calc.buyDate)} al {formatECBDate(calc.endDate)}
              </>
            )}
          </span>
        </p>
        {calc ? (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-x-6 sm:gap-x-10 gap-y-4">
              <div>
                <div className="text-sm text-gray-400 mb-1">En {CCY_LABEL[currency]}</div>
                <div
                  className={`text-[44px] sm:text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums ${
                    ret > 0 ? 'text-white' : ret < 0 ? 'text-neg' : 'text-gray-300'
                  }`}
                >
                  {formatPercent(ret, true, 1)}
                </div>
              </div>
              <svg viewBox="0 0 48 24" className="hidden sm:block w-12 h-6 mb-5 text-muted shrink-0" aria-hidden="true">
                <path d="M2 12 H42 M34 4 L44 12 L34 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <div className="text-sm text-gray-400 mb-1">En euros, en tu cuenta</div>
                <div
                  id="investor-result"
                  className={`text-[44px] sm:text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums underline underline-offset-[14px] decoration-2 [text-decoration-skip-ink:none] ${
                    simulated ? 'decoration-dashed' : ''
                  } ${
                    neutral
                      ? 'text-white decoration-sim'
                      : calc.totalPct < 0
                      ? 'text-neg decoration-neg/50'
                      : 'text-pos decoration-pos/50'
                  }`}
                >
                  {formatPercent(calc.totalPct, true, 1)}
                </div>
              </div>
            </div>
            <p className="mt-6 text-[16px] sm:text-[17px] leading-relaxed text-gray-300 max-w-[68ch] [text-wrap:pretty] tabular-nums">{fxLine}</p>
          </>
        ) : (
          <div className="mt-4 h-[112px] text-[28px] font-semibold text-muted">Cargando tipos del BCE…</div>
        )}
      </section>

      {/* Bridge + ask */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="panel print-break lg:col-span-8 p-5 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">De lo invertido a tu cuenta</h2>
              <p className="text-xs text-gray-400 mt-0.5">Qué parte es bolsa y qué parte es tipo de cambio</p>
            </div>
            <span className={`text-[11px] ${live ? 'text-muted' : 'text-sim'}`}>
              {live ? 'Tipos de referencia del BCE' : 'Sin conexión: copia semanal de los tipos del BCE'}
            </span>
          </div>
          <div className="mt-3">
            {calc ? (
              <Waterfall
                height={390}
                key={`${presetId}-${currency}-${buy}-${end}`}
                steps={[
                  { label: 'Invertido', sub: formatECBDate(calc.buyDate), value: amount, kind: 'total' },
                  { label: 'Bolsa', sub: `${formatPercent(ret, true, 1)} en ${currency}`, value: calc.market, kind: 'delta' },
                  { label: 'Divisa', sub: `${currency} ${formatPercent(calc.fxPct, true, 1)} vs €`, value: calc.fx, kind: 'delta' },
                  { label: 'En tu cuenta', sub: formatECBDate(calc.endDate), value: calc.valueEUR, kind: 'total', emphasis: true },
                ]}
              />
            ) : (
              <div className="h-[340px]" />
            )}
          </div>
        </section>

        <aside className="lg:col-span-4 flex flex-col gap-4">
          <section className="panel p-5">
            <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">Pregunta a tus datos</h2>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">En lenguaje normal, sin fórmulas</p>
            <AskBar
              key={`${presetId}-${currency}`}
              suggestions={suggestions}
              onAsk={handleAsk}
              answer={answer}
              scenarioLabel={scenarioLabel}
              onClear={() => {
                setFxShock(0);
                setScenarioLabel(null);
                setAnswer(null);
              }}
              reserve="lg:min-h-[196px]"
            />
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">Ejemplos</h2>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  aria-pressed={presetId === p.id}
                  className={`h-8 px-3 rounded-full border text-[13px] transition-colors ${
                    presetId === p.id
                      ? 'border-accent/60 bg-accent/[0.12] text-white'
                      : 'border-white/[0.12] text-gray-300 hover:border-white/[0.28]'
                  }`}
                >
                  {p.chip}
                </button>
              ))}
            </div>
            <details className="group mt-4 border-t border-white/[0.06] pt-3">
              <summary className="cursor-pointer list-none text-[13px] text-gray-300 hover:text-white flex items-center justify-between">
                Cambiar datos de la inversión
                <span className="text-muted transition-transform group-open:rotate-180" aria-hidden="true">
                  ▾
                </span>
              </summary>
              <div className="mt-4 flex flex-col gap-4">
                <Field label="Qué compraste" htmlFor="inv-asset">
                  <input id="inv-asset" className={inputCls} value={asset} onChange={(e) => (custom(), setAsset(e.target.value))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Importe (EUR)" htmlFor="inv-amount">
                    <input
                      id="inv-amount"
                      type="number"
                      min={100}
                      step={100}
                      className={inputCls}
                      value={amount}
                      onChange={(e) => (custom(), setAmount(Math.max(0, Number(e.target.value))))}
                    />
                  </Field>
                  <Field label="Divisa del activo" htmlFor="inv-ccy">
                    <select
                      id="inv-ccy"
                      className={inputCls}
                      value={currency}
                      onChange={(e) => (custom(), setCurrency(e.target.value as Currency), setFxShock(0), setScenarioLabel(null), setAnswer(null))}
                    >
                      <option value="USD">Dólar (USD)</option>
                      <option value="GBP">Libra (GBP)</option>
                      <option value="JPY">Yen (JPY)</option>
                      <option value="CHF">Franco suizo (CHF)</option>
                    </select>
                  </Field>
                  <Field label="Fecha de compra" htmlFor="inv-buy">
                    <input id="inv-buy" type="date" min="2000-01-03" max={end} className={inputCls} value={buy} onChange={(e) => (custom(), setBuy(e.target.value))} />
                  </Field>
                  <Field label="Valorado a" htmlFor="inv-end">
                    <input id="inv-end" type="date" min={buy} max={today} className={inputCls} value={end} onChange={(e) => (custom(), setEnd(e.target.value))} />
                  </Field>
                </div>
                <Field
                  label={`Rentabilidad del activo en ${CCY_LABEL[currency]} (%)`}
                  htmlFor="inv-ret"
                  hint="La que ves en la ficha del fondo o del índice"
                >
                  <input id="inv-ret" type="number" step={0.5} className={inputCls} value={ret} onChange={(e) => (custom(), setRet(Number(e.target.value)))} />
                </Field>
              </div>
            </details>
          </section>
        </aside>
      </div>

      {/* FX since purchase */}
      {calc && (
        <section className="panel print-break p-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">EUR/{currency} desde tu compra</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Cuando la línea sube, el euro compra más {CCY_LABEL[currency]} y tu inversión vale menos en euros.
              </p>
            </div>
            <dl className="flex gap-6">
              <div>
                <dt className="text-xs text-gray-400">Compra</dt>
                <dd className="quote text-ref">{formatFXRate(calc.buyRate, currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-400">{simulated ? 'Simulado' : 'Final'}</dt>
                <dd className={`quote ${simulated ? 'text-sim' : 'text-white'}`}>{formatFXRate(calc.endRate, currency)}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-4">
            <RateChart
              data={chartData}
              ccy={currency}
              pairLabel={`EUR/${currency}`}
              lines={lines}
              compare={{ y: calc.buyRate, label: 'vs compra' }}
              height={260}
              fillId="investorFill"
            />
          </div>
        </section>
      )}
    </>
  );
};
