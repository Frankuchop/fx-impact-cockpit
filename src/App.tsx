import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { CompanyView } from './components/CompanyView';
import { InvestorView } from './components/InvestorView';
import { PortfolioView } from './components/PortfolioView';
import { Mode } from './components/Header';
import { fetchECBData } from './services/ecbService';
import { calculateQuantMetrics, NO_SHOCK, Shocks } from './services/quantEngine';
import { generateRealisticFallbackHistory } from './services/fallbackData';
import { Currency, Pair, ECBFeedStatus } from './types';
import { formatEUR } from './utils/formatters';

export const App: React.FC = () => {
  // Feed state
  const fallbackInitial = useMemo(() => generateRealisticFallbackHistory(), []);
  const [feedStatus, setFeedStatus] = useState<ECBFeedStatus>('LOADING');
  const [officialDate, setOfficialDate] = useState<string>(fallbackInitial.latestDate);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [spotRates, setSpotRates] = useState<Record<Currency, number>>(fallbackInitial.latestRates);
  const [history, setHistory] = useState(fallbackInitial.history);
  const [forceOffline, setForceOffline] = useState<boolean>(false);

  // Quantitative state
  const [shocks, setShocks] = useState<Shocks>(NO_SHOCK);
  const [mode, setMode] = useState<Mode>('cartera');
  const [selectedPair, setSelectedPair] = useState<Pair>('EUR/USD');

  // Load ECB Data
  const loadData = useCallback(async (offline = forceOffline) => {
    setFeedStatus('LOADING');
    try {
      const res = await fetchECBData(offline);
      setFeedStatus(res.status);
      setOfficialDate(res.officialDate);
      setIsFallback(res.isFallback);
      setSpotRates(res.spotRates);
      setHistory(res.history);
    } catch {
      const fb = generateRealisticFallbackHistory();
      setFeedStatus('FALLBACK');
      setOfficialDate(fb.latestDate);
      setIsFallback(true);
      setSpotRates(fb.latestRates);
      setHistory(fb.history);
    }
  }, [forceOffline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleOffline = () => {
    const nextOffline = !forceOffline;
    setForceOffline(nextOffline);
    loadData(nextOffline);
  };

  const quantResult = useMemo(() => calculateQuantMetrics(shocks, spotRates, history), [shocks, spotRates, history]);

  return (
    <div className="min-h-screen text-fg flex flex-col">
      <Header
        mode={mode}
        onModeChange={setMode}
        status={feedStatus}
        officialDate={officialDate}
        isFallback={isFallback}
        onRefresh={() => loadData(forceOffline)}
        onToggleOffline={handleToggleOffline}
        isBreach={quantResult.metrics.isBreach}
      />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 lg:px-8 py-6 lg:py-8 flex flex-col gap-4">
        {mode === 'cartera' ? (
          <PortfolioView offline={forceOffline} />
        ) : mode === 'inversor' ? (
          <InvestorView offline={forceOffline} />
        ) : (
          <CompanyView
            positions={quantResult.positions}
            metrics={quantResult.metrics}
            history={history}
            shocks={shocks}
            onShocksChange={setShocks}
            selectedPair={selectedPair}
            onSelectPair={setSelectedPair}
          />
        )}
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-8 py-4 flex flex-col sm:flex-row justify-between gap-2 text-xs text-muted">
          <span>
            Datos: tipos de referencia del Banco Central Europeo vía Frankfurter. Ejemplos ilustrativos; no es asesoramiento financiero.
          </span>
          {mode === 'empresa' && (
            <span className="tabular-nums whitespace-nowrap">
              Límite de pérdida {formatEUR(quantResult.metrics.riskLimit)}:{' '}
              <span className={quantResult.metrics.isBreach ? 'text-neg font-medium' : 'text-pos'}>
                {quantResult.metrics.isBreach ? 'superado' : 'respetado'}
              </span>
            </span>
          )}
        </div>
      </footer>
    </div>
  );
};

export default App;
