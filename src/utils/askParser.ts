
/**
 * Turns a plain-Spanish question into a scenario the app can run.
 * Rule-based on purpose: works offline and is predictable on screen.
 *
 *   "¿y si el dólar cae un 5%?"        -> move  { currency: 'USD', change: -0.05 }
 *   "¿qué pasa si el euro sube un 3%?"  -> move  { currency: 'EUR', change: +0.03 }
 *   "¿y si hubiera cubierto la divisa?" -> hedge
 *   "¿qué divisa me hace más daño?"     -> biggest
 *   "¿y si volvemos al forecast?"       -> budget
 *   "volver a hoy"                      -> reset
 */
export type AskIntent =
  | { kind: 'move'; currency: string; change: number }
  | { kind: 'hedge' }
  | { kind: 'biggest' }
  | { kind: 'budget' }
  | { kind: 'reset' }
  | { kind: 'unknown' };

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!]/g, ' ');

const CURRENCY_WORDS: [RegExp, string][] = [
  [/\b(dolar(es)? canadiense(s)?|cad)\b/, 'CAD'],
  [/\b(dolar(es)? australiano(s)?|aud)\b/, 'AUD'],
  [/\b(dolar(es)? de hong kong|hkd)\b/, 'HKD'],
  [/\b(corona(s)? sueca(s)?|sek)\b/, 'SEK'],
  [/\b(corona(s)? noruega(s)?|nok)\b/, 'NOK'],
  [/\b(corona(s)? danesa(s)?|dkk)\b/, 'DKK'],
  [/\b(dolar|dolares|usd|\$)/, 'USD'],
  [/\b(libra|libras|esterlina|gbp|£)/, 'GBP'],
  [/\b(yen|yenes|jpy|¥)/, 'JPY'],
  [/\b(franco|francos|suizo|chf)/, 'CHF'],
  [/\b(euro|euros|eur|€)/, 'EUR'],
];

const DOWN = /\b(cae|caen|cayera|cayese|baja|bajan|bajara|bajase|deprecia|depreciara|debilita|debilitara|pierde|perdiera|hunde|hundiera|desploma)/;
const UP = /\b(sube|suben|subiera|subiese|aprecia|apreciara|fortalece|fortaleciera|gana|ganara|revaloriza|dispara|disparara)/;

export function parseQuestion(input: string): AskIntent {
  const q = strip(input);
  if (!q.trim()) return { kind: 'unknown' };

  if (/\b(cubiert|cubrir|cubro|cubre|cobertura|hedge)/.test(q)) return { kind: 'hedge' };
  if (/\b(forecast|presupuest|agosto)/.test(q) && /\b(volv|vuelv|regres|como en|a los tipos)/.test(q))
    return { kind: 'budget' };
  if (/cuanto me (ha|han) (costado|quitado|llevado|comido|regalado|dado|sumado)/.test(q)) return { kind: 'biggest' };
  if (/(mas dano|mas me duele|duele mas|pesa mas|mas pesa|afecta mas|mas afecta|peor divisa|que divisa|cual.*divisa|quien.*culpa)/.test(q))
    return { kind: 'biggest' };
  if (/\b(reset|reinici|quitar|sin escenario|volver a hoy|mercado actual|como hoy)/.test(q)) return { kind: 'reset' };

  const pctMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(%|por ?ciento|puntos)/) || q.match(/\bun\s+(\d+(?:[.,]\d+)?)\b/);
  const currency = CURRENCY_WORDS.find(([re]) => re.test(q))?.[1];
  const dir = DOWN.test(q) ? -1 : UP.test(q) ? 1 : 0;

  if (pctMatch && currency && dir !== 0) {
    const pct = Math.min(parseFloat(pctMatch[1].replace(',', '.')), 50) / 100;
    return { kind: 'move', currency, change: dir * pct };
  }
  return { kind: 'unknown' };
}

/**
 * EUR-side shock for one currency, given how that currency moves.
 * "El dólar cae un 5%" -> the EUR buys 1/0.95 more dollars -> +5,26 %.
 */
export function eurShockFor(change: number, currency: string): number {
  if (currency === 'EUR') return change;
  return 1 / (1 + change) - 1;
}

export const CURRENCY_NAME: Record<string, string> = {
  USD: 'el dólar',
  GBP: 'la libra',
  JPY: 'el yen',
  CHF: 'el franco suizo',
  CAD: 'el dólar canadiense',
  AUD: 'el dólar australiano',
  SEK: 'la corona sueca',
  NOK: 'la corona noruega',
  DKK: 'la corona danesa',
  HKD: 'el dólar de Hong Kong',
  EUR: 'el euro',
};
