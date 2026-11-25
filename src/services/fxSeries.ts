import { HistoricalRatePoint } from '../types';
import { ECB_WEEKLY } from '../data/ecbWeekly';

const TIMEOUT_MS = 4000;

export interface SeriesResult {
  series: HistoricalRatePoint[];
  live: boolean;
}

/** ECB reference rates between two ISO dates (inclusive). Falls back to the bundled weekly copy. */
export async function fetchSeries(start: string, end: string, offline = false): Promise<SeriesResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (offline) throw new Error('offline');
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${start}..${end}?from=EUR&to=USD,GBP,JPY,CHF`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.rates) throw new Error('Malformed response');
    const series: HistoricalRatePoint[] = Object.keys(json.rates)
      .sort()
      .map((date) => ({ date, ...json.rates[date] }));
    if (series.length < 2) throw new Error('Not enough data');
    return { series, live: true };
  } catch {
    clearTimeout(timer);
    const series = ECB_WEEKLY.filter((p) => p.date >= start && p.date <= end);
    // make sure the window has both ends, even between two weekly points
    const before = [...ECB_WEEKLY].reverse().find((p) => p.date <= start);
    const out = before && (!series.length || series[0].date !== before.date) ? [before, ...series] : series;
    return { series: out.length ? out : ECB_WEEKLY.slice(-2), live: false };
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
