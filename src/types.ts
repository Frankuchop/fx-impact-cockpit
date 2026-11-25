export type Currency = 'USD' | 'GBP' | 'JPY' | 'CHF';
export type Pair = 'EUR/USD' | 'EUR/GBP' | 'EUR/JPY' | 'EUR/CHF';

export interface CorporatePosition {
  currency: Currency;
  pair: Pair;
  name: string;
  currencySymbol: string;
  notional: number; // e.g. -4250000
  budgetRate: number; // e.g. 1.0850
  description: string;
  type: 'liability' | 'asset';
}

export type SuggestedActionType = 'urgent' | 'collar' | 'covered';

export interface CalculatedPosition extends CorporatePosition {
  spotActual: number;
  spotSimulated: number;
  mtmEUR: number;
  budgetEUR: number;
  pnlEUR: number;
  pnlPct: number;
  volDaily: number;
  volAnnual: number;
  var1D: number;
  actionType: SuggestedActionType;
  actionLabel: string;
  actionReason: string;
}

export interface HistoricalRatePoint {
  date: string;
  USD: number;
  GBP: number;
  JPY: number;
  CHF: number;
}

export interface PortfolioMetrics {
  totalNotionalEUR: number;
  totalAssetsEUR: number;
  totalLiabilitiesEUR: number;
  totalMtMEUR: number;
  totalBudgetEUR: number;
  totalPnlEUR: number;
  totalPnlPct: number;
  undiversifiedVaR: number;
  diversifiedVaR: number;
  diversificationBenefitEUR: number;
  diversificationBenefitPct: number;
  riskLimit: number; // -150000
  isBreach: boolean;
}

export type ECBFeedStatus = 'LIVE' | 'FALLBACK' | 'LOADING';
