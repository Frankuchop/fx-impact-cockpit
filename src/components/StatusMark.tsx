import React from 'react';

/**
 * Status glyphs, separate from the ▲/▽ used for the sign of money:
 * octagon with "!" = limit breached / act now; circle with tick = fine.
 */
export const AlertMark: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden="true">
    <path d="M4 0.8 H8 L11.2 4 V8 L8 11.2 H4 L0.8 8 V4 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M6 3.2 V6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="6" cy="8.6" r="0.8" fill="currentColor" />
  </svg>
);

export const OkMark: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden="true">
    <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M3.6 6.2 L5.3 7.8 L8.4 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Watch: hollow diamond. */
export const WatchMark: React.FC<{ className?: string }> = ({ className = 'w-3 h-3' }) => (
  <svg viewBox="0 0 12 12" className={`shrink-0 ${className}`} aria-hidden="true">
    <path d="M6 0.9 L11.1 6 L6 11.1 L0.9 6 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);
