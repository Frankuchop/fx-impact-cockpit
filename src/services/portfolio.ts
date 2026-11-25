import { ECB_WEEKLY } from '../data/ecbWeekly';

/** Currencies the ECB publishes that a Spanish investor is likely to hold. */
export const PORTFOLIO_CCYS = ['USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'HKD'] as const;
export type PCcy = (typeof PORTFOLIO_CCYS)[number];

export const PCCY_NAME: Record<PCcy, string> = {
  USD: 'dólar',
  GBP: 'libra',
  JPY: 'yen',
  CHF: 'franco suizo',
  CAD: 'dólar canadiense',
  AUD: 'dólar australiano',
  SEK: 'corona sueca',
  NOK: 'corona noruega',
  DKK: 'corona danesa',
  HKD: 'dólar de Hong Kong',
};

export interface Holding {
  id: string;
  name: string;
  currency: PCcy;
  quantity: number;
  /** Price paid per unit, in the asset's currency */
  buyPrice: number;
  buyDate: string;
  /** EUR/ccy rate on the buy date (ECB by default, editable to the broker's rate) */
  buyFx: number;
  /** Latest price per unit, in the asset's currency (entered by the user) */
  currentPrice: number;
  priceDate: string;
}

export interface HoldingCalc extends Holding {
  fxNow: number;
  costEUR: number;
  valueEUR: number;
  marketEUR: number;
  fxEUR: number;
  totalEUR: number;
  /** move of the currency against the euro since purchase, % */
  ccyMovePct: number;
}

const TIMEOUT_MS = 4000;
const STORE_KEY = 'fxcockpit.holdings.v1';

async function getJSON(url: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Latest ECB rates for the given currencies. Falls back to the bundled copy (4 majors only). */
export async function fetchLatestRates(
  ccys: PCcy[],
  offline = false
): Promise<{ rates: Partial<Record<PCcy, number>>; date: string; live: boolean }> {
  const list = Array.from(new Set(ccys.length ? ccys : (['USD'] as PCcy[])));
  try {
    if (offline) throw new Error('offline');
    const j = await getJSON(`https://api.frankfurter.dev/v1/latest?from=EUR&to=${list.join(',')}`);
    if (!j.rates) throw new Error('Malformed');
    return { rates: j.rates, date: j.date, live: true };
  } catch {
    const last = ECB_WEEKLY[ECB_WEEKLY.length - 1];
    const rates: Partial<Record<PCcy, number>> = {};
    list.forEach((c) => {
      if (c in last) rates[c] = (last as unknown as Record<string, number>)[c];
    });
    return { rates, date: last.date, live: false };
  }
}

/** ECB rate on a given date (the latest fixing on or before it). */
export async function fetchRateOn(date: string, ccy: PCcy, offline = false): Promise<{ rate: number | null; date: string }> {
  try {
    if (offline) throw new Error('offline');
    const j = await getJSON(`https://api.frankfurter.dev/v1/${date}?from=EUR&to=${ccy}`);
    return { rate: j.rates?.[ccy] ?? null, date: j.date ?? date };
  } catch {
    const p = [...ECB_WEEKLY].reverse().find((r) => r.date <= date);
    const v = p ? (p as unknown as Record<string, number>)[ccy] : undefined;
    return { rate: typeof v === 'number' ? v : null, date: p?.date ?? date };
  }
}

export function calcHolding(h: Holding, fxNow: number): HoldingCalc {
  const costEUR = (h.quantity * h.buyPrice) / h.buyFx;
  const valueLocal = h.quantity * h.currentPrice;
  const valueEUR = valueLocal / fxNow;
  const marketEUR = (h.quantity * (h.currentPrice - h.buyPrice)) / h.buyFx;
  const fxEUR = valueLocal * (1 / fxNow - 1 / h.buyFx);
  return {
    ...h,
    fxNow,
    costEUR,
    valueEUR,
    marketEUR,
    fxEUR,
    totalEUR: valueEUR - costEUR,
    ccyMovePct: (h.buyFx / fxNow - 1) * 100,
  };
}

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Illustrative portfolio so the screen is never empty. Prices are invented; buy rates are real ECB fixings. */
export const EXAMPLE_HOLDINGS: Holding[] = [
  { id: 'ex1', name: 'Fondo indexado EE. UU. (ejemplo)', currency: 'USD', quantity: 20, buyPrice: 520, buyDate: '2025-01-02', buyFx: 1.0321, currentPrice: 598, priceDate: '2026-11-24' },
  { id: 'ex2', name: 'Acción británica (ejemplo)', currency: 'GBP', quantity: 300, buyPrice: 12.4, buyDate: '2025-06-03', buyFx: 0.8436, currentPrice: 13.1, priceDate: '2026-11-24' },
  { id: 'ex3', name: 'ETF de Japón (ejemplo)', currency: 'JPY', quantity: 50, buyPrice: 3000, buyDate: '2025-03-06', buyFx: 159.24, currentPrice: 3320, priceDate: '2026-11-24' },
  { id: 'ex4', name: 'Acción suiza (ejemplo)', currency: 'CHF', quantity: 40, buyPrice: 95, buyDate: '2026-02-06', buyFx: 0.9175, currentPrice: 98, priceDate: '2026-11-24' },
];

export function loadHoldings(): { holdings: Holding[]; isExample: boolean } {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.holdings)) return { holdings: parsed.holdings, isExample: !!parsed.isExample };
    }
  } catch {
    /* storage unavailable: fall through to the example */
  }
  return { holdings: EXAMPLE_HOLDINGS, isExample: true };
}

export function saveHoldings(holdings: Holding[], isExample: boolean) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ holdings, isExample }));
  } catch {
    /* private mode or storage full: the session still works in memory */
  }
}
