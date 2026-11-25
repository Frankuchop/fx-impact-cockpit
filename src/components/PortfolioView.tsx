import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2, Undo2, X } from 'lucide-react';
import {
  Holding,
  HoldingCalc,
  PCcy,
  PORTFOLIO_CCYS,
  PCCY_NAME,
  calcHolding,
  fetchLatestRates,
  fetchRateOn,
  loadHoldings,
  saveHoldings,
  newId,
  EXAMPLE_HOLDINGS,
} from '../services/portfolio';
import { todayISO } from '../services/fxSeries';
import { formatEUR, formatPercent, formatECBDate, MINUS } from '../utils/formatters';
import { parseQuestion, eurShockFor, CURRENCY_NAME } from '../utils/askParser';
import { AskBar, AskAnswer } from './AskBar';
import { Waterfall } from './Waterfall';
import { Mark, Money } from './Money';

const REFRESH_MS = 15 * 60 * 1000;

const fmtRate = (v: number, ccy: string) => (ccy === 'JPY' ? v.toFixed(2) : v.toFixed(4));
const fmtPrice = (v: number) => v.toLocaleString('es-ES', { useGrouping: false, maximumFractionDigits: 4 });
const fmtNum = (v: number, d = 2) =>
  v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true });

const priceCls =
  'w-full min-w-0 rounded-md bg-white/[0.04] border border-dashed border-white/25 hover:border-white/50 focus:border-solid focus:border-white px-2.5 text-sm text-fg tabular-nums outline-none transition-colors';

const inputCls =
  'h-9 w-full min-w-0 rounded-md bg-field border border-white/[0.12] px-2.5 text-sm text-fg tabular-nums outline-none focus:border-white/50 [color-scheme:dark]';

interface Draft {
  name: string;
  currency: PCcy;
  quantity: string;
  buyPrice: string;
  buyDate: string;
  buyFx: string;
  currentPrice: string;
}

const emptyDraft = (): Draft => ({
  name: '',
  currency: 'USD',
  quantity: '',
  buyPrice: '',
  buyDate: '',
  buyFx: '',
  currentPrice: '',
});

export const PortfolioView: React.FC<{ offline?: boolean }> = ({ offline = false }) => {
  const initial = useMemo(() => loadHoldings(), []);
  const [holdings, setHoldings] = useState<Holding[]>(initial.holdings);
  const [rates, setRates] = useState<Partial<Record<PCcy, number>>>({});
  const [ratesDate, setRatesDate] = useState<string>('');
  const [live, setLive] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [shocks, setShocks] = useState<Partial<Record<string, number>>>({});
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [draftFxNote, setDraftFxNote] = useState<string>('');
  const [lastDeleted, setLastDeleted] = useState<{ h: Holding; index: number } | null>(null);

  const hasExample = holdings.some((h) => h.id.startsWith('ex'));

  useEffect(() => saveHoldings(holdings, hasExample), [holdings, hasExample]);

  // An answer refers to the portfolio as it was asked: when the holdings change, it no longer applies.
  useEffect(() => {
    setAnswer(null);
    setScenarioLabel(null);
    setShocks({});
  }, [holdings]);

  const ccys = useMemo(() => Array.from(new Set(holdings.map((h) => h.currency))) as PCcy[], [holdings]);
  const ccyKey = ccys.join(',');

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetchLatestRates(ccyKey ? (ccyKey.split(',') as PCcy[]) : [], offline);
    setRates((r) => ({ ...r, ...res.rates }));
    setRatesDate(res.date);
    setLive(res.live);
    setCheckedAt(new Date());
    setLoading(false);
  }, [ccyKey, offline]);

  // Live monitoring: check the ECB feed on load, every 15 minutes, and when the tab comes back.
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const calcs: HoldingCalc[] = useMemo(
    () =>
      holdings
        .filter((h) => typeof rates[h.currency] === 'number')
        .map((h) => calcHolding(h, (rates[h.currency] as number) * (1 + (shocks[h.currency] ?? 0)))),
    [holdings, rates, shocks]
  );
  const baseValue = useMemo(
    () =>
      holdings
        .filter((h) => typeof rates[h.currency] === 'number')
        .reduce((a, h) => a + calcHolding(h, rates[h.currency] as number).valueEUR, 0),
    [holdings, rates]
  );
  const missing = holdings.filter((h) => typeof rates[h.currency] !== 'number');

  const tot = useMemo(() => {
    const t = calcs.reduce(
      (a, c) => ({
        cost: a.cost + c.costEUR,
        value: a.value + c.valueEUR,
        market: a.market + c.marketEUR,
        fx: a.fx + c.fxEUR,
      }),
      { cost: 0, value: 0, market: 0, fx: 0 }
    );
    return { ...t, total: t.value - t.cost, marketPct: t.cost ? (t.market / t.cost) * 100 : 0, totalPct: t.cost ? ((t.value - t.cost) / t.cost) * 100 : 0 };
  }, [calcs]);

  const byCcy = useMemo(() => {
    const m = new Map<string, { ccy: PCcy; value: number; fx: number; cost: number }>();
    calcs.forEach((c) => {
      const e = m.get(c.currency) ?? { ccy: c.currency, value: 0, fx: 0, cost: 0 };
      e.value += c.valueEUR;
      e.fx += c.fxEUR;
      e.cost += c.costEUR;
      m.set(c.currency, e);
    });
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [calcs]);

  // A 1 % stronger euro takes ~1/1.01 off every foreign-currency euro value.
  const sensitivity = tot.value * (1 / 1.01 - 1);
  const simulated = Object.values(shocks).some((v) => Math.abs(v ?? 0) > 1e-9);

  /* ---------- questions ---------- */
  const handleAsk = (q: string) => {
    const intent = parseQuestion(q);
    if (intent.kind === 'move') {
      if (intent.currency !== 'EUR' && !ccys.includes(intent.currency as PCcy)) {
        setAnswer({ body: <>No tienes inversiones en {CURRENCY_NAME[intent.currency] ?? intent.currency}: ese movimiento no te afecta.</> });
        return;
      }
      const s = eurShockFor(intent.change, intent.currency);
      const next: Record<string, number> = {};
      (intent.currency === 'EUR' ? ccys : [intent.currency]).forEach((c) => (next[c] = s));
      const newTotal = holdings
        .filter((h) => typeof rates[h.currency] === 'number')
        .map((h) => calcHolding(h, (rates[h.currency] as number) * (1 + (next[h.currency] ?? 0))))
        .reduce((a, c) => a + c.valueEUR, 0);
      const pct = formatPercent(Math.abs(intent.change) * 100, false, 1).replace(',0%', '%');
      setShocks(next);
      setScenarioLabel(`${intent.currency === 'EUR' ? 'Euro' : intent.currency} ${intent.change < 0 ? MINUS : '+'}${pct}`);
      setAnswer({
        headline: <Money v={newTotal - baseValue} />,
        body: (
          <>
            Si {CURRENCY_NAME[intent.currency]} {intent.change < 0 ? 'cae' : 'sube'} un {pct} desde hoy, tu cartera pasaría de{' '}
            <b className="tabular-nums text-fg">{formatEUR(baseValue)}</b> a <b className="tabular-nums text-fg">{formatEUR(newTotal)}</b>.
          </>
        ),
      });
      return;
    }
    if (intent.kind === 'biggest') {
      const worst = [...byCcy].sort((a, b) => a.fx - b.fx)[0];
      setScenarioLabel(null);
      setAnswer({
        headline: <Money v={tot.fx} />,
        body: worst ? (
          <>
            Es lo que el tipo de cambio ha movido tu cartera desde cada compra. Lo que más pesa: {CURRENCY_NAME[worst.ccy] ?? worst.ccy} (
            <Money v={worst.fx} />
            ).
          </>
        ) : (
          <>Añade una inversión para ver el efecto de la divisa.</>
        ),
      });
      return;
    }
    if (intent.kind === 'hedge') {
      setScenarioLabel(null);
      setShocks({});
      setAnswer({
        headline: <Money v={tot.market} />,
        body: (
          <>
            Con la divisa cubierta solo contaría el mercado: <b className="tabular-nums text-fg">{formatPercent(tot.marketPct, true, 1)}</b> en lugar de{' '}
            <b className="tabular-nums text-fg">{formatPercent(tot.totalPct, true, 1)}</b>. <span className="text-muted">Sin descontar el coste de cubrirse.</span>
          </>
        ),
      });
      return;
    }
    if (intent.kind === 'reset') {
      setShocks({});
      setScenarioLabel(null);
      setAnswer({ body: <>Vuelves a los tipos BCE de hoy.</> });
      return;
    }
    setAnswer({
      body: (
        <span className="text-muted">
          No sé responder a eso todavía. Prueba con "¿y si el dólar cae un 10%?", "¿cuánto me ha costado la divisa?" o "¿y si lo hubiera cubierto?".
        </span>
      ),
    });
  };

  /* ---------- editing ---------- */
  const updateHolding = (id: string, patch: Partial<Holding>) =>
    setHoldings((hs) => hs.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  const removeHolding = (id: string) =>
    setHoldings((hs) => {
      const index = hs.findIndex((h) => h.id === id);
      if (index >= 0) setLastDeleted({ h: hs[index], index });
      return hs.filter((h) => h.id !== id);
    });

  const undoDelete = () => {
    if (!lastDeleted) return;
    setHoldings((hs) => {
      const copy = [...hs];
      copy.splice(lastDeleted.index, 0, lastDeleted.h);
      return copy;
    });
    setLastDeleted(null);
  };

  // Fill the buy rate from the ECB when currency or date change
  useEffect(() => {
    if (!adding || !draft.buyDate) return;
    let cancelled = false;
    fetchRateOn(draft.buyDate, draft.currency, offline).then(({ rate, date }) => {
      if (cancelled) return;
      if (rate) {
        setDraft((d) => ({ ...d, buyFx: String(rate) }));
        setDraftFxNote(`Tipo BCE del ${formatECBDate(date)}. Cámbialo si tu bróker te aplicó otro.`);
      } else {
        setDraftFxNote('No hay tipo del BCE para esa fecha sin conexión. Escríbelo a mano.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [adding, draft.buyDate, draft.currency, offline]);

  const num = (s: string) => Number(String(s).replace(',', '.'));
  const draftValid =
    draft.name.trim() && num(draft.quantity) > 0 && num(draft.buyPrice) > 0 && draft.buyDate && num(draft.buyFx) > 0 && num(draft.currentPrice) > 0;

  const addHolding = () => {
    if (!draftValid) return;
    const h: Holding = {
      id: newId(),
      name: draft.name.trim(),
      currency: draft.currency,
      quantity: num(draft.quantity),
      buyPrice: num(draft.buyPrice),
      buyDate: draft.buyDate,
      buyFx: num(draft.buyFx),
      currentPrice: num(draft.currentPrice),
      priceDate: todayISO(),
    };
    // the first real holding replaces the example, so invented and real figures never mix
    setHoldings((hs) => [...hs.filter((x) => !x.id.startsWith('ex')), h]);
    setDraft(emptyDraft());
    setDraftFxNote('');
    setAdding(false);
  };

  const startOwn = () => {
    setHoldings([]);
    setShocks({});
    setAnswer(null);
    setScenarioLabel(null);
    setAdding(true);
  };

  const suggestions = ['¿Cuánto me ha costado la divisa?', '¿Y si el dólar cae un 10%?', '¿Y si lo hubiera cubierto?'];
  const empty = holdings.length === 0;
  const fxHurts = tot.fx < 0;

  return (
    <>
      {/* Hero */}
      <section className="pt-1">
        <p className="text-sm text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {empty
              ? 'Tu cartera está vacía'
              : `${hasExample ? 'Cartera de ejemplo (precios inventados, tipos BCE reales)' : 'Mi cartera'}: ${holdings.length} ${
                  holdings.length === 1 ? 'inversión' : 'inversiones'
                }, ${formatEUR(tot.cost)} invertidos.`}
          </span>
          {hasExample && !empty && (
            <button onClick={startOwn} className="no-print text-fg underline underline-offset-4 decoration-white/40 hover:decoration-white">
              Empezar la mía
            </button>
          )}
        </p>

        {empty ? (
          <div className="mt-4">
            <h2 className="text-[34px] sm:text-[48px] leading-[1.06] font-semibold tracking-[-0.035em] text-fg [text-wrap:balance] max-w-[22ch]">
              Añade lo que compraste y te diré cuánto te cuesta el tipo de cambio.
            </h2>
            <button
              onClick={() => setAdding(true)}
              className="mt-6 inline-flex items-center gap-2 h-10 px-4 rounded-md bg-accent text-accent-fg text-sm font-medium hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Añadir inversión
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-end gap-x-6 sm:gap-x-10 gap-y-4">
              <div>
                <div className="text-sm text-muted mb-1">En sus divisas</div>
                <div className="text-[44px] sm:text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums text-fg">
                  {formatPercent(tot.marketPct, true, 1)}
                </div>
              </div>
              <svg viewBox="0 0 48 24" className="hidden sm:block w-12 h-6 mb-5 text-white/40 shrink-0" aria-hidden="true">
                <path d="M2 12 H42 M34 4 L44 12 L34 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <div className="text-sm text-muted mb-1 flex items-center gap-2">
                  En euros, {simulated ? 'en el escenario' : 'hoy'}
                  {simulated && (
                    <span className="inline-flex items-center h-5 px-1.5 rounded border border-dashed border-white/60 text-fg text-[11px] font-medium">
                      Simulado
                    </span>
                  )}
                </div>
                <div
                  id="portfolio-result"
                  className={`text-[44px] sm:text-[64px] leading-none font-semibold tracking-[-0.04em] tabular-nums text-fg underline underline-offset-[14px] decoration-2 [text-decoration-skip-ink:none] decoration-white ${
                    simulated ? 'decoration-dashed' : ''
                  }`}
                >
                  {formatPercent(tot.totalPct, true, 1)}
                </div>
              </div>
            </div>
            <p className="mt-6 text-[16px] sm:text-[17px] leading-relaxed text-white/75 max-w-[68ch] [text-wrap:pretty]">
              El tipo de cambio {simulated ? (fxHurts ? 'te restaría' : 'te sumaría') : fxHurts ? 'te ha restado' : 'te ha sumado'}{' '}
              <b className="text-fg tabular-nums">{formatEUR(Math.abs(tot.fx))}</b> desde que compraste
              {tot.market > 0 && fxHurts && (
                <>
                  : el <b className="text-fg tabular-nums">{Math.round((Math.abs(tot.fx) / tot.market) * 100)}%</b> de lo que ganó el mercado
                </>
              )}
              . Si mañana el euro sube un 1%, tu cartera pierde unos <b className="text-fg tabular-nums">{formatEUR(Math.abs(sensitivity))}</b>.
            </p>
          </>
        )}
      </section>

      {simulated && scenarioLabel && (
        <div className="no-print sticky top-0 md:top-[64px] z-20 glass-soft border-dashed rounded-[12px] px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-sm text-fg">
            Viendo el escenario <b className="tabular-nums">{scenarioLabel}</b>. Las cifras de abajo no son las de hoy.
          </p>
          <button
            onClick={() => {
              setShocks({});
              setScenarioLabel(null);
              setAnswer(null);
            }}
            className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium bg-accent text-accent-fg hover:opacity-90"
          >
            Volver a hoy <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {!empty && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="panel print-break lg:col-span-8 p-5 min-w-0 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold text-fg tracking-[-0.01em]">De lo invertido a lo que vale hoy</h2>
                <p className="text-xs text-muted mt-0.5">Toda la cartera: qué parte es mercado y qué parte es tipo de cambio</p>
              </div>
              <LiveStamp live={live} date={ratesDate} checkedAt={checkedAt} loading={loading} onRefresh={refresh} />
            </div>
            <div className="mt-3 flex-1 min-h-[360px]">
              {calcs.length === 0 ? (
                <div className="h-[360px] flex items-center justify-center text-sm text-muted">Cargando tipos del BCE…</div>
              ) : (
              <Waterfall
                height="fill"
                steps={[
                  { label: 'Invertido', sub: 'a tipos de compra', value: tot.cost, kind: 'total' },
                  { label: 'Mercado', sub: `${formatPercent(tot.marketPct, true, 1)} en sus divisas`, value: tot.market, kind: 'delta' },
                  { label: 'Divisa', sub: 'desde que compraste', value: tot.fx, kind: 'delta' },
                  simulated
                    ? { label: 'Simulado', sub: scenarioLabel ?? '', value: tot.value, kind: 'total', emphasis: true, simulated: true }
                    : { label: 'Hoy', sub: ratesDate ? formatECBDate(ratesDate) : '', value: tot.value, kind: 'total', emphasis: true },
                ]}
              />
              )}
            </div>
          </section>

          <aside className="lg:col-span-4 flex flex-col gap-4">
            <section className="panel p-5 flex-none">
              <h2 className="text-[15px] font-semibold text-fg tracking-[-0.01em]">Pregunta a tu cartera</h2>
              <p className="text-xs text-muted mt-0.5 mb-3">En lenguaje normal, sin fórmulas</p>
              <AskBar
                suggestions={suggestions}
                onAsk={handleAsk}
                answer={answer}
                scenarioLabel={scenarioLabel}
                onClear={() => {
                  setShocks({});
                  setScenarioLabel(null);
                  setAnswer(null);
                }}
                reserve="lg:min-h-[168px]"
              />
            </section>
            <section className={`panel p-5 flex-1 ${simulated ? 'outline-1 outline-dashed outline-white/40 outline-offset-4' : ''}`}>
              <h2 className="text-[15px] font-semibold text-fg tracking-[-0.01em] flex items-center gap-2">
                Exposición por divisa
                {simulated && <SimChip />}
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {byCcy.map((e) => {
                  const share = tot.value ? (e.value / tot.value) * 100 : 0;
                  return (
                    <li key={e.ccy}>
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-fg font-medium">
                          {e.ccy} <span className="text-muted font-normal">{PCCY_NAME[e.ccy]}</span>
                        </span>
                        <Money v={e.fx} className="text-[13px]" />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="relative h-1.5 flex-1 rounded-full bg-white/[0.08]">
                          <div className="absolute inset-y-0 left-0 rounded-full bg-white/80" style={{ width: `${share}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs text-muted tabular-nums">{formatPercent(share, false, 0)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </aside>
        </div>
      )}

      {/* Holdings */}
      <section id="holdings" className={`panel print-break overflow-hidden ${simulated ? 'outline-1 outline-dashed outline-white/40 outline-offset-4' : ''}`}>
        <div className="px-5 pt-5 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-fg tracking-[-0.01em] flex items-center gap-2">
              Tus inversiones
              {simulated && <SimChip />}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              El tipo de cambio se actualiza solo. El precio actual lo pones tú: escríbelo en la columna de la derecha.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastDeleted && (
              <button onClick={undoDelete} className="no-print inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs text-fg border border-white/[0.14] hover:bg-white/[0.06]">
                <Undo2 className="w-3.5 h-3.5" /> Deshacer
              </button>
            )}
            <button
              onClick={() => setAdding((a) => !a)}
              aria-expanded={adding}
              className="no-print inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-accent text-accent-fg hover:opacity-90 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir inversión
            </button>
          </div>
        </div>

        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addHolding();
            }}
            className="no-print mx-5 mb-5 rounded-[10px] border border-white/[0.12] bg-white/[0.03] p-4 grid grid-cols-2 lg:grid-cols-7 gap-3 items-end"
          >
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
              Qué compraste
              <input className={inputCls} placeholder="Ej.: Fondo S&P 500" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Divisa
              <select className={inputCls} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as PCcy })}>
                {PORTFOLIO_CCYS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Cantidad
              <input className={inputCls} inputMode="decimal" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Precio de compra ({draft.currency})
              <input className={inputCls} inputMode="decimal" value={draft.buyPrice} onChange={(e) => setDraft({ ...draft, buyPrice: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Fecha de compra
              <input type="date" max={todayISO()} min="2000-01-03" className={inputCls} value={draft.buyDate} onChange={(e) => setDraft({ ...draft, buyDate: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Precio actual ({draft.currency})
              <input className={inputCls} inputMode="decimal" value={draft.currentPrice} onChange={(e) => setDraft({ ...draft, currentPrice: e.target.value })} />
            </label>
            <label className="col-span-2 lg:col-span-2 flex flex-col gap-1 text-xs text-muted">
              Tipo de cambio de compra (EUR/{draft.currency})
              <input className={`${inputCls} quote`} inputMode="decimal" value={draft.buyFx} onChange={(e) => setDraft({ ...draft, buyFx: e.target.value })} />
            </label>
            <p className="col-span-2 lg:col-span-3 text-[11px] text-muted self-center">
              {draftFxNote || 'Al poner la fecha, traigo el tipo oficial del BCE de ese día.'}
              {hasExample && ' Al guardar se borra la cartera de ejemplo.'}
            </p>
            <div className="col-span-2 lg:col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setAdding(false)} className="h-9 px-3 rounded-md text-xs text-muted hover:text-fg">
                Cancelar
              </button>
              <button type="submit" disabled={!draftValid} className="h-9 px-4 rounded-md text-xs font-medium bg-accent text-accent-fg disabled:opacity-40 transition">
                Guardar inversión
              </button>
            </div>
          </form>
        )}

        {!empty && (
          <>
            {/* Mobile cards */}
            <ul className="md:hidden border-t border-white/[0.08] divide-y divide-white/[0.06]">
              {calcs.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-fg font-medium line-clamp-2">{c.name}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {fmtNum(c.quantity, c.quantity % 1 ? 2 : 0)} × {fmtNum(c.buyPrice)} {c.currency}, {formatECBDate(c.buyDate)}
                      </div>
                    </div>
                    <Money v={c.totalEUR} className="text-sm font-semibold" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted">Valor hoy</div>
                      <div className="tabular-nums text-fg mt-0.5">{formatEUR(c.valueEUR)}</div>
                    </div>
                    <div>
                      <div className="text-muted">Mercado</div>
                      <div className="mt-0.5"><Money v={c.marketEUR} /></div>
                    </div>
                    <div>
                      <div className="text-muted">Divisa</div>
                      <div className="mt-0.5"><Money v={c.fxEUR} /></div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-xs text-muted shrink-0" htmlFor={`m-price-${c.id}`}>
                      Precio actual
                    </label>
                    <input
                      id={`m-price-${c.id}`}
                      className={`${priceCls} h-8`}
                      inputMode="decimal"
                      defaultValue={fmtPrice(c.currentPrice)}
                      onBlur={(e) => num(e.target.value) > 0 && updateHolding(c.id, { currentPrice: num(e.target.value), priceDate: todayISO() })}
                    />
                    <button onClick={() => removeHolding(c.id)} aria-label={`Borrar ${c.name}`} className="no-print w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-white/[0.06]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-y border-white/[0.08] bg-white/[0.02]">
                    {['Inversión', 'Divisa desde la compra', 'Invertido', 'Valor hoy', 'Mercado', 'Divisa', 'Total', 'Precio actual (editable)', ''].map((h, i) => (
                      <th key={i} className={`py-2.5 px-4 font-medium text-xs text-muted whitespace-nowrap ${i >= 2 && i <= 6 ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calcs.map((c) => (
                    <tr key={c.id} className="border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="text-fg font-medium flex items-center gap-2">
                          {c.name.replace(' (ejemplo)', '')}
                          {c.id.startsWith('ex') && <span className="text-[11px] font-normal text-muted border border-white/15 rounded px-1.5">ejemplo</span>}
                        </div>
                        <div className="text-xs text-muted mt-0.5 tabular-nums">
                          {fmtNum(c.quantity, c.quantity % 1 ? 2 : 0)} × {fmtNum(c.buyPrice)} {c.currency}, {formatECBDate(c.buyDate)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 text-fg">
                          <Mark v={c.ccyMovePct * 100} />
                          {c.currency} {formatPercent(c.ccyMovePct, true, 1)}
                        </div>
                        <div className="quote text-[11px] text-muted mt-0.5">
                          {fmtRate(c.buyFx, c.currency)} → {fmtRate(c.fxNow, c.currency)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-white/80 whitespace-nowrap">{formatEUR(c.costEUR)}</td>
                      <td className="py-3.5 px-4 text-right tabular-nums text-fg whitespace-nowrap">{formatEUR(c.valueEUR)}</td>
                      <td className="py-3.5 px-4 text-right"><Money v={c.marketEUR} /></td>
                      <td className="py-3.5 px-4 text-right"><Money v={c.fxEUR} className="font-semibold" /></td>
                      <td className="py-3.5 px-4 text-right">
                        <Money v={c.totalEUR} />
                        <div className="text-xs text-muted mt-0.5 tabular-nums">{formatPercent((c.totalEUR / c.costEUR) * 100, true, 1)}</div>
                      </td>
                      <td className="py-2.5 px-4 w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex-1">
                            <Pencil className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" aria-hidden="true" />
                            <input
                              key={`${c.id}-${c.currentPrice}`}
                              aria-label={`Precio actual de ${c.name} en ${c.currency}`}
                              className={`${priceCls} h-8 pl-6 text-right`}
                              inputMode="decimal"
                              defaultValue={fmtPrice(c.currentPrice)}
                              onBlur={(e) => num(e.target.value) > 0 && num(e.target.value) !== c.currentPrice && updateHolding(c.id, { currentPrice: num(e.target.value), priceDate: todayISO() })}
                              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            />
                          </div>
                          <span className="text-[11px] text-muted w-7">{c.currency}</span>
                        </div>
                        <div className="text-[11px] text-muted mt-1 text-right pr-8">Actualizado {formatECBDate(c.priceDate).replace(/ \d{4}$/, '')}</div>
                      </td>
                      <td className="py-2.5 pr-3 pl-0 w-10">
                        <button onClick={() => removeHolding(c.id)} aria-label={`Borrar ${c.name}`} className="no-print w-8 h-8 inline-flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-white/[0.06]">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-white/[0.02]">
                    <td className="py-3.5 px-4 font-semibold text-fg" colSpan={2}>
                      Total cartera
                    </td>
                    <td className="py-3.5 px-4 text-right tabular-nums text-white/80">{formatEUR(tot.cost)}</td>
                    <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-fg">{formatEUR(tot.value)}</td>
                    <td className="py-3.5 px-4 text-right"><Money v={tot.market} /></td>
                    <td className="py-3.5 px-4 text-right"><Money v={tot.fx} className="font-semibold" /></td>
                    <td className="py-3.5 px-4 text-right">
                      <Money v={tot.total} className="font-semibold" />
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            {missing.length > 0 && (
              <p className="px-5 py-3 text-xs text-muted border-t border-white/[0.06]">
                Sin tipo de cambio para {missing.map((h) => h.currency).join(', ')} mientras no haya conexión: esas inversiones no se cuentan.
              </p>
            )}
          </>
        )}
        {empty && !adding && (
          <p className="px-5 pb-5 text-sm text-muted">
            Aún no hay inversiones.{' '}
            <button className="underline underline-offset-4 hover:text-fg" onClick={() => setHoldings(EXAMPLE_HOLDINGS)}>
              Ver la cartera de ejemplo
            </button>
          </p>
        )}
      </section>
    </>
  );
};

const LiveStamp: React.FC<{ live: boolean; date: string; checkedAt: Date | null; loading: boolean; onRefresh: () => void }> = ({
  live,
  date,
  checkedAt,
  loading,
  onRefresh,
}) => (
  <div className="flex items-center gap-2 text-[11px] text-muted">
    <span className="relative inline-flex w-2 h-2" aria-hidden="true">
      {live && <span className="absolute inset-0 rounded-full bg-white/60 live-ping" />}
      <span className={`relative inline-flex w-2 h-2 rounded-full ${live ? 'bg-white' : 'border border-white/60'}`} />
    </span>
    <span className="tabular-nums">
      {live ? 'BCE' : 'Copia local'} {date && formatECBDate(date)}
      {checkedAt && `, comprobado ${checkedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
    </span>
    <button onClick={onRefresh} aria-label="Comprobar tipos ahora" className="no-print w-6 h-6 inline-flex items-center justify-center rounded hover:bg-white/[0.08] hover:text-fg">
      <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
    </button>
  </div>
);


const SimChip: React.FC = () => (
  <span className="inline-flex items-center h-5 px-1.5 rounded border border-dashed border-white/60 text-fg text-[11px] font-medium">Simulado</span>
);
