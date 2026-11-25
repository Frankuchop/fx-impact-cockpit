import { CorporatePosition, CalculatedPosition, HistoricalRatePoint, PortfolioMetrics, Currency } from '../types';

/** Budget rates = ECB fixing of 25 Aug 2026, used for the company's August forecast. */
export const BUDGET_DATE = '2026-08-25';

export const CORPORATE_POSITIONS: CorporatePosition[] = [
  {
    currency: 'USD',
    pair: 'EUR/USD',
    name: 'Proveedores de tecnología y energía',
    currencySymbol: '$',
    notional: -4250000,
    budgetRate: 1.1662,
    description: 'Pagos a proveedores tech/energía (Exposición Pasiva USD)',
    type: 'liability',
  },
  {
    currency: 'GBP',
    pair: 'EUR/GBP',
    name: 'Cobros de la filial en Reino Unido',
    currencySymbol: '£',
    notional: 1850000,
    budgetRate: 0.8555,
    description: 'Cobros de filial UK (Cobertura natural parcial)',
    type: 'asset',
  },
  {
    currency: 'JPY',
    pair: 'EUR/JPY',
    name: 'Maquinaria importada de Japón',
    currencySymbol: '¥',
    notional: -320000000,
    budgetRate: 185.7,
    description: 'Importación de maquinaria industrial (Pasivo JPY)',
    type: 'liability',
  },
  {
    currency: 'CHF',
    pair: 'EUR/CHF',
    name: 'Servicios financieros en Suiza',
    currencySymbol: 'CHF',
    notional: -950000,
    budgetRate: 0.9361,
    description: 'Servicios de consultoría y tesorería suiza (Pasivo CHF)',
    type: 'liability',
  },
];

export const RISK_LIMIT_EUR = -150000;

export interface QuantCalculationResult {
  positions: CalculatedPosition[];
  metrics: PortfolioMetrics;
  historyWindow: HistoricalRatePoint[];
}

/** EUR move per currency: -0.05 means the EUR is 5% weaker against that currency. */
export type Shocks = Record<Currency, number>;

export const NO_SHOCK: Shocks = { USD: 0, GBP: 0, JPY: 0, CHF: 0 };

export const uniformShock = (v: number): Shocks => ({ USD: v, GBP: v, JPY: v, CHF: v });

export function calculateQuantMetrics(
  shocks: Shocks,
  spotRates: Record<Currency, number>,
  history: HistoricalRatePoint[]
): QuantCalculationResult {
  // Ensure we have at least 31 points for 30 daily returns
  const historyWindow = history.length >= 31 ? history.slice(-31) : history;
  const numDays = historyWindow.length;

  // 1. Calculate Daily & Annualized Volatility per Currency Pair
  const pairVolatilities: Record<Currency, { volDaily: number; volAnnual: number }> = {
    USD: { volDaily: 0, volAnnual: 0 },
    GBP: { volDaily: 0, volAnnual: 0 },
    JPY: { volDaily: 0, volAnnual: 0 },
    CHF: { volDaily: 0, volAnnual: 0 },
  };

  const currencies: Currency[] = ['USD', 'GBP', 'JPY', 'CHF'];

  currencies.forEach((cur) => {
    const returns: number[] = [];
    for (let i = 1; i < numDays; i++) {
      const prev = historyWindow[i - 1][cur];
      const curr = historyWindow[i][cur];
      if (prev > 0 && curr > 0) {
        returns.push(Math.log(curr / prev));
      }
    }

    if (returns.length > 1) {
      const mean = returns.reduce((acc, v) => acc + v, 0) / returns.length;
      const variance =
        returns.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (returns.length - 1);
      const volDaily = Math.sqrt(variance);
      const volAnnual = volDaily * Math.sqrt(252);
      pairVolatilities[cur] = { volDaily, volAnnual };
    }
  });

  // 2. Calculate Mark-to-Market, PnL, Individual VaRs
  const positions: CalculatedPosition[] = CORPORATE_POSITIONS.map((pos) => {
    const spotActual = spotRates[pos.currency] || pos.budgetRate;
    // Formula 1: Spot_Simulado = Spot_Actual * (1 + shock_pct)
    const spotSimulated = spotActual * (1 + shocks[pos.currency]);

    // Formula 2: Valor_EUR = Exposicion_Divisa / Spot_Simulado
    const mtmEUR = pos.notional / spotSimulated;

    // Budget EUR Valuation
    const budgetEUR = pos.notional / pos.budgetRate;

    // Formula 3: PnL_EUR = (Exposicion_Divisa / Spot_Simulado) - (Exposicion_Divisa / Budget_Rate)
    const pnlEUR = mtmEUR - budgetEUR;

    // Percentage deviation relative to budget absolute value
    const pnlPct = (pnlEUR / Math.abs(budgetEUR)) * 100;

    const { volDaily, volAnnual } = pairVolatilities[pos.currency];

    // Formula 5a: Individual VaR 95% 1-day = |Valor_EUR| * volDaily * 1.645
    const var1D = Math.abs(mtmEUR) * volDaily * 1.645;

    // Suggested Action classification
    let actionType: 'urgent' | 'collar' | 'covered' = 'covered';
    let actionLabel = 'Favorable, sin acción';
    let actionReason = 'Rendimiento positivo o dentro de la tolerancia de riesgo normal';

    if (pnlPct < -2.5) {
      actionType = 'urgent';
      actionLabel = 'Cubrir ya con forward';
      actionReason = `Pérdida superior al 2.5% (-${Math.abs(pnlPct).toFixed(1)}%). Recomendado asegurar tipo forward inmediato.`;
    } else if (pnlPct < -0.5) {
      actionType = 'collar';
      actionLabel = 'Vigilar (collar)';
      actionReason = `Desviación moderada (-${Math.abs(pnlPct).toFixed(1)}%). Implementar estrategia Collar o Stop-Loss.`;
    }

    return {
      ...pos,
      spotActual,
      spotSimulated,
      mtmEUR,
      budgetEUR,
      pnlEUR,
      pnlPct,
      volDaily,
      volAnnual,
      var1D,
      actionType,
      actionLabel,
      actionReason,
    };
  });

  // 3. Diversified Portfolio VaR Calculation (Formula 5b)
  // Compute aggregated portfolio value for each day in historyWindow
  const portfolioHistoryValues: number[] = [];
  for (let d = 0; d < numDays; d++) {
    let dayTotalEUR = 0;
    CORPORATE_POSITIONS.forEach((p) => {
      // Apply the same stress shock as the individual VaRs so both are comparable
      const rateOnDay = historyWindow[d][p.currency] * (1 + shocks[p.currency]);
      if (rateOnDay > 0) {
        dayTotalEUR += p.notional / rateOnDay;
      }
    });
    portfolioHistoryValues.push(dayTotalEUR);
  }

  // Daily changes in aggregated portfolio value
  const dailyPortfolioDeltas: number[] = [];
  for (let i = 1; i < portfolioHistoryValues.length; i++) {
    dailyPortfolioDeltas.push(portfolioHistoryValues[i] - portfolioHistoryValues[i - 1]);
  }

  let diversifiedVaR = 0;
  if (dailyPortfolioDeltas.length > 1) {
    const meanDelta =
      dailyPortfolioDeltas.reduce((acc, v) => acc + v, 0) / dailyPortfolioDeltas.length;
    const varDelta =
      dailyPortfolioDeltas.reduce((acc, v) => acc + Math.pow(v - meanDelta, 2), 0) /
      (dailyPortfolioDeltas.length - 1);
    const stdDelta = Math.sqrt(varDelta);
    diversifiedVaR = stdDelta * 1.645;
  }

  // Undiversified VaR is the direct sum of individual VaRs
  const undiversifiedVaR = positions.reduce((acc, p) => acc + p.var1D, 0);

  // Real Diversified VaR without artificial cap
  const diversificationBenefitEUR = Math.max(0, undiversifiedVaR - diversifiedVaR);
  const diversificationBenefitPct =
    undiversifiedVaR > 0 ? (diversificationBenefitEUR / undiversifiedVaR) * 100 : 0;

  // 4. Portfolio Aggregates
  const totalAssetsEUR = positions
    .filter((p) => p.notional > 0)
    .reduce((acc, p) => acc + p.mtmEUR, 0);

  const totalLiabilitiesEUR = positions
    .filter((p) => p.notional < 0)
    .reduce((acc, p) => acc + Math.abs(p.mtmEUR), 0);

  const totalMtMEUR = positions.reduce((acc, p) => acc + p.mtmEUR, 0);
  const totalBudgetEUR = positions.reduce((acc, p) => acc + p.budgetEUR, 0);
  const totalPnlEUR = positions.reduce((acc, p) => acc + p.pnlEUR, 0);
  const totalPnlPct =
    Math.abs(totalBudgetEUR) > 0 ? (totalPnlEUR / Math.abs(totalBudgetEUR)) * 100 : 0;

  const totalNotionalEUR = totalAssetsEUR + totalLiabilitiesEUR;

  // 5. Risk Limit Check (Formula 6: Limit = -150,000 EUR)
  const isBreach = totalPnlEUR < RISK_LIMIT_EUR;

  return {
    positions,
    metrics: {
      totalNotionalEUR,
      totalAssetsEUR,
      totalLiabilitiesEUR,
      totalMtMEUR,
      totalBudgetEUR,
      totalPnlEUR,
      totalPnlPct,
      undiversifiedVaR,
      diversifiedVaR,
      diversificationBenefitEUR,
      diversificationBenefitPct,
      riskLimit: RISK_LIMIT_EUR,
      isBreach,
    },
    historyWindow,
  };
}
