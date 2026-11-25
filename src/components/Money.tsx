import React from 'react';
import { formatSignedEUR } from '../utils/formatters';

/** ▲ / ▼ / — : sign as shape, so gains and losses never depend on colour. */
export const Mark: React.FC<{ v: number; className?: string }> = ({ v, className = '' }) => {
  const r = Math.round(v);
  return (
    <svg viewBox="0 0 10 10" className={`inline-block w-2 h-2 shrink-0 ${className}`} aria-hidden="true">
      {r > 0 ? (
        <path d="M5 1 L9.5 9 H0.5 Z" fill="currentColor" />
      ) : r < 0 ? (
        <path d="M5 9 L9.5 1 H0.5 Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      ) : (
        <rect x="1" y="4.3" width="8" height="1.4" fill="currentColor" />
      )}
    </svg>
  );
};

export const Money: React.FC<{ v: number; className?: string }> = ({ v, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap ${Math.round(v) < 0 ? 'text-neg' : 'text-pos'} ${className}`}>
    <Mark v={v} />
    {formatSignedEUR(v)}
  </span>
);

