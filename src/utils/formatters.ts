import { Currency } from '../types';

/** Typographic minus (U+2212), used for every negative figure. */
export const MINUS = '\u2212';

/**
 * Formats an amount in EUR rounded to whole integers with dot thousands separator,
 * matching institutional standard: e.g. -332.949 € or 1.250.000 €
 */
export function formatEUR(amount: number): string {
  const isNegative = Math.round(amount) < 0;
  const rounded = Math.round(Math.abs(amount));
  // Format with dot as thousands separator
  const parts = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? MINUS : ''}${parts} €`;
}

/**
 * Formats FX exchange rate:
 * - JPY: 2 decimals (e.g. 162.50)
 * - USD, GBP, CHF: 4 decimals (e.g. 1.0850)
 */
export function formatFXRate(rate: number, currency: Currency): string {
  if (currency === 'JPY') {
    return rate.toFixed(2);
  }
  return rate.toFixed(4);
}

/**
 * Formats percentages with explicit sign and 2 decimals: e.g. +1.45% or -8.50%
 */
export function formatPercent(value: number, includeSign: boolean = true, decimals: number = 1): string {
  const rounded = Math.abs(value).toFixed(decimals);
  const isZero = Number(rounded) === 0;
  const sign = isZero ? '' : value < 0 ? MINUS : includeSign && value > 0 ? '+' : '';
  return `${sign}${rounded.replace('.', ',')}%`;
}

/** Signed EUR amount: +1.234 € / −1.234 € */
export function formatSignedEUR(amount: number): string {
  return `${Math.round(amount) > 0 ? '+' : ''}${formatEUR(amount)}`;
}

/**
 * Formats nominal currency position in native currency:
 * e.g. -4.250.000 USD or +1.850.000 GBP
 */
export function formatNativeCurrency(amount: number, currency: Currency): string {
  const isNegative = amount < 0;
  const rounded = Math.round(Math.abs(amount));
  const parts = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? MINUS : '+'}${parts} ${currency}`;
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-23' -> '23 nov 2026' */
export function formatECBDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ES[m - 1]} ${y}`;
}

/** '2026-11-23' -> '23 nov' (chart axis) */
export function formatAxisDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${MONTHS_ES[m - 1]}`;
}
