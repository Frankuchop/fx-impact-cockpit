import React from 'react';
import { Printer, RefreshCw, WifiOff, Wifi } from 'lucide-react';
import { ECBFeedStatus } from '../types';
import { formatECBDate } from '../utils/formatters';

export type Mode = 'cartera' | 'inversor' | 'empresa';

interface HeaderProps {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  status: ECBFeedStatus;
  officialDate: string;
  isFallback: boolean;
  onRefresh: () => void;
  onToggleOffline: () => void;
  isBreach: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  onModeChange,
  status,
  officialDate,
  isFallback,
  onRefresh,
  onToggleOffline,
}) => {
  const isLoading = status === 'LOADING';
  // The offline toggle is a test tool: shown with ?qa in the URL (or when already offline).
  const showQa = isFallback || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('qa'));
  const feedLabel = isLoading ? 'Conectando…' : isFallback ? 'Copia local' : 'Tipos BCE';
  const feedTone = isLoading
    ? 'text-gray-400 border-white/10'
    : isFallback
    ? 'text-sim border-sim/35 bg-sim/[0.07]'
    : 'text-pos border-pos/35 bg-pos/[0.07]';
  const dotTone = isLoading ? 'bg-gray-500' : isFallback ? 'bg-sim' : 'bg-pos';

  return (
    <header className="md:sticky md:top-0 z-30 border-b border-white/[0.08] bg-black/40 backdrop-blur-xl">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-8 min-h-[60px] py-3 md:py-0 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 md:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0" aria-hidden="true">
            <rect x="0.5" y="0.5" width="27" height="27" rx="6" fill="rgb(var(--panel))" stroke="rgba(255,255,255,0.12)" />
            <path d="M6 18.5 L11 13 L15 16 L22 8.5" fill="none" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6 21.5 H22" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="2 2" />
          </svg>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-white leading-tight">
              FX Impact Cockpit
            </h1>
            <p className="hidden lg:block text-xs text-gray-400 leading-tight mt-0.5">Qué parte de tu resultado es tipo de cambio</p>
          </div>
        </div>

        <nav
          aria-label="Vista"
          className="no-print order-last md:order-none flex self-stretch md:self-auto rounded-lg border border-white/[0.08] bg-panel p-0.5"
        >
          {(
            [
              ['cartera', 'Mi cartera'],
              ['inversor', 'Una inversión'],
              ['empresa', 'Empresa'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              id={`mode-${m}`}
              onClick={() => onModeChange(m)}
              aria-current={mode === m ? 'page' : undefined}
              className={`flex-1 md:flex-none h-8 px-3 sm:px-4 rounded-md text-[13px] whitespace-nowrap font-medium transition-colors ${
                mode === m ? 'bg-white/[0.10] text-white ring-1 ring-white/15' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center flex-nowrap gap-2">
          <div
            id="ecb-status-badge"
            className={`inline-flex items-center gap-2 h-8 px-2.5 rounded-md border text-xs font-medium whitespace-nowrap ${feedTone}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotTone}`} />
            <span>{feedLabel}</span>
            <span className="w-px h-3 bg-white/15 hidden sm:inline" />
            <span className="hidden sm:inline font-normal tracking-normal text-gray-300 tabular-nums">
              {formatECBDate(officialDate)}
            </span>
          </div>

          {showQa && (
          <button
            onClick={onToggleOffline}
            title={isFallback ? 'Volver a pedir los datos al BCE' : 'Cortar la conexión para probar el modo de respaldo'}
            aria-label={isFallback ? 'Reconectar con el BCE' : 'Simular sin conexión'}
            className="no-print inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.08] transition-colors"
          >
            {isFallback ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          </button>
          )}

          <button
            onClick={onRefresh}
            title="Volver a cargar los tipos del BCE"
            aria-label="Volver a cargar los tipos del BCE"
            className="no-print inline-flex items-center justify-center w-8 h-8 rounded-md text-gray-300 hover:text-white hover:bg-white/[0.06] border border-white/[0.08] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => window.print()}
            aria-label="Exportar informe en PDF"
            className="no-print inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-md text-xs font-medium text-gray-200 border border-white/[0.12] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Exportar informe</span>
          </button>
        </div>
      </div>
    </header>
  );
};
