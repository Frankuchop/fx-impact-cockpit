import { HistoricalRatePoint } from '../types';

// Realistic 65 business days of ECB rates
export function generateRealisticFallbackHistory(): {
  history: HistoricalRatePoint[];
  latestDate: string;
  latestRates: { USD: number; GBP: number; JPY: number; CHF: number };
} {
  const points: HistoricalRatePoint[] = [];
  const totalDays = 65;
  
  // Starting date 95 days ago to get ~65 business days
  const now = new Date();
  const baseRates = {
    USD: 1.0939,
    GBP: 0.8367,
    JPY: 174.01,
    CHF: 0.9186,
  };

  // Seeded random walk for consistent realistic curves
  let curUSD = 1.0790;
  let curGBP = 0.8510;
  let curJPY = 160.40;
  let curCHF = 0.9480;

  // Generate 65 business days leading up to today
  const businessDates: Date[] = [];
  let d = new Date(now);
  // Walk backwards to collect 65 business days
  while (businessDates.length < totalDays) {
    d.setDate(d.getDate() - 1);
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDates.unshift(new Date(d));
    }
  }

  // Pseudo-random deterministic walk
  const pseudoRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  businessDates.forEach((dateObj, idx) => {
    const r1 = pseudoRandom(idx * 7 + 1) - 0.49;
    const r2 = pseudoRandom(idx * 11 + 3) - 0.49;
    const r3 = pseudoRandom(idx * 13 + 5) - 0.48;
    const r4 = pseudoRandom(idx * 17 + 7) - 0.50;

    curUSD = +(curUSD * (1 + r1 * 0.0055)).toFixed(4);
    curGBP = +(curGBP * (1 + r2 * 0.0045)).toFixed(4);
    curJPY = +(curJPY * (1 + r3 * 0.0065)).toFixed(2);
    curCHF = +(curCHF * (1 + r4 * 0.0040)).toFixed(4);

    const dateStr = dateObj.toISOString().split('T')[0];
    points.push({
      date: dateStr,
      USD: curUSD,
      GBP: curGBP,
      JPY: curJPY,
      CHF: curCHF,
    });
  });

  // Ensure latest point is realistic around the base rates
  const lastIdx = points.length - 1;
  points[lastIdx].USD = baseRates.USD;
  points[lastIdx].GBP = baseRates.GBP;
  points[lastIdx].JPY = baseRates.JPY;
  points[lastIdx].CHF = baseRates.CHF;

  return {
    history: points,
    latestDate: points[lastIdx].date,
    latestRates: {
      USD: points[lastIdx].USD,
      GBP: points[lastIdx].GBP,
      JPY: points[lastIdx].JPY,
      CHF: points[lastIdx].CHF,
    },
  };
}
