import { Currency, HistoricalRatePoint, ECBFeedStatus } from '../types';
import { generateRealisticFallbackHistory } from './fallbackData';

export interface ECBFeedResult {
  status: ECBFeedStatus;
  officialDate: string;
  spotRates: Record<Currency, number>;
  history: HistoricalRatePoint[];
  isFallback: boolean;
  error?: string;
}

const TIMEOUT_MS = 4000;

export async function fetchECBData(forceOffline: boolean = false): Promise<ECBFeedResult> {
  const fallback = generateRealisticFallbackHistory();

  if (forceOffline) {
    return {
      status: 'FALLBACK',
      officialDate: fallback.latestDate,
      spotRates: fallback.latestRates,
      history: fallback.history,
      isFallback: true,
      error: 'Simulated Offline Mode',
    };
  }

  // Calculate dynamic date range: today and 90 calendar days ago
  const now = new Date();
  const past90 = new Date();
  past90.setDate(now.getDate() - 90);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const endDate = formatDate(now);
  const startDate = formatDate(past90);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const [latestRes, historyRes] = await Promise.all([
      fetch('https://api.frankfurter.dev/v1/latest?from=EUR&to=USD,GBP,JPY,CHF', {
        signal: controller.signal,
      }),
      fetch(`https://api.frankfurter.dev/v1/${startDate}..${endDate}?from=EUR&to=USD,GBP,JPY,CHF`, {
        signal: controller.signal,
      }),
    ]);

    clearTimeout(timeoutId);

    if (!latestRes.ok || !historyRes.ok) {
      throw new Error(`API responded with HTTP ${latestRes.status} / ${historyRes.status}`);
    }

    const latestData = await latestRes.json();
    const historyData = await historyRes.json();

    if (!latestData.rates || !historyData.rates) {
      throw new Error('Malformed API response');
    }

    const spotRates: Record<Currency, number> = {
      USD: latestData.rates.USD ?? fallback.latestRates.USD,
      GBP: latestData.rates.GBP ?? fallback.latestRates.GBP,
      JPY: latestData.rates.JPY ?? fallback.latestRates.JPY,
      CHF: latestData.rates.CHF ?? fallback.latestRates.CHF,
    };

    // Sort historical dates chronologically
    const rawDates = Object.keys(historyData.rates).sort();
    let history: HistoricalRatePoint[] = rawDates.map((dateStr) => {
      const r = historyData.rates[dateStr];
      return {
        date: dateStr,
        USD: r.USD ?? fallback.latestRates.USD,
        GBP: r.GBP ?? fallback.latestRates.GBP,
        JPY: r.JPY ?? fallback.latestRates.JPY,
        CHF: r.CHF ?? fallback.latestRates.CHF,
      };
    });

    // If fewer than 31 points (e.g., holiday periods), use fallback dataset and return FALLBACK status
    const isUnderThreshold = history.length < 31;
    if (isUnderThreshold) {
      history = fallback.history;
    }

    // Spot and date come from the same place as the chart: the newest fixing available.
    const lastPoint = history[history.length - 1];
    const useLast = !isUnderThreshold && lastPoint && (!latestData.date || lastPoint.date >= latestData.date);
    return {
      status: isUnderThreshold ? 'FALLBACK' : 'LIVE',
      officialDate: useLast ? lastPoint.date : latestData.date || endDate,
      spotRates: useLast ? { USD: lastPoint.USD, GBP: lastPoint.GBP, JPY: lastPoint.JPY, CHF: lastPoint.CHF } : spotRates,
      history,
      isFallback: isUnderThreshold,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    console.warn('[ECB Feed] API unreachable or timed out (4000ms). Activating 65-day cached fallback dataset.', err);

    return {
      status: 'FALLBACK',
      officialDate: fallback.latestDate,
      spotRates: fallback.latestRates,
      history: fallback.history,
      isFallback: true,
      error: err instanceof Error ? err.message : 'Timeout / Network Error',
    };
  }
}
