import React, { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, MessageSquareText, X } from 'lucide-react';

export interface AskAnswer {
  /** Key figure, shown large on its own line. */
  headline?: React.ReactNode;
  body: React.ReactNode;
}

interface AskBarProps {
  suggestions: string[];
  onAsk: (question: string) => void;
  answer: AskAnswer | null;
  /** Active scenario, if the answer changed the numbers on screen. */
  scenarioLabel?: string | null;
  onClear?: () => void;
  placeholder?: string;
  /** Height reserved under the input so the page never jumps when an answer arrives. */
  reserve?: string;
}

/**
 * Plain-language questions about the data. A suggestion is typed into the box
 * first so a viewer can read what is being asked; the answer then takes the
 * place of the suggestions, inside a reserved area.
 */
export const AskBar: React.FC<AskBarProps> = ({
  suggestions,
  onAsk,
  answer,
  scenarioLabel,
  onClear,
  placeholder = 'Pregunta a tus datos…',
  reserve = 'lg:min-h-[150px]',
}) => {
  const [value, setValue] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState<'typing' | 'thinking' | null>(null);
  const timers = useRef<number[]>([]);
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    if (reduceMotion) {
      setAsked(text);
      onAsk(text);
      return;
    }
    setBusy('thinking');
    setAsked(text);
    later(() => {
      setBusy(null);
      onAsk(text);
    }, 420);
  };

  const typeAndAsk = (q: string) => {
    if (busy) return;
    if (reduceMotion) {
      setValue(q);
      submit(q);
      return;
    }
    setBusy('typing');
    setValue('');
    q.split('').forEach((_, i) => later(() => setValue(q.slice(0, i + 1)), 22 * (i + 1)));
    later(() => submit(q), 22 * q.length + 160);
  };

  const reset = () => {
    setAsked(null);
    setValue('');
  };

  const showAnswer = !!answer && !!asked && busy === null;

  return (
    <div className="no-print">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) submit(value);
        }}
        className="flex items-center gap-2 rounded-[10px] border border-white/[0.14] bg-white/[0.04] pl-3.5 pr-1.5 h-12 focus-within:border-white/60 focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.10)] transition"
      >
        <MessageSquareText className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
        <label htmlFor="ask-input" className="sr-only">
          Pregunta sobre tus datos
        </label>
        <input
          id="ask-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent text-[15px] text-white placeholder:text-muted outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim() || !!busy}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium text-accent-fg bg-accent hover:bg-accent disabled:bg-transparent disabled:text-white/40 disabled:border disabled:border-white/15 disabled:hover:bg-transparent transition"
        >
          Preguntar
          <CornerDownLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </form>

      <div className={`mt-2.5 ${reserve}`}>
        {busy === 'thinking' ? (
          <div className="flex items-center gap-2 h-9 pl-1 text-xs text-gray-400" aria-live="polite">
            <span className="thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Calculando con los tipos del BCE
          </div>
        ) : showAnswer ? (
          <div
            key={asked}
            aria-live="polite"
            className="answer-in rounded-[10px] border border-white/[0.08] border-l-2 border-l-accent bg-gradient-to-r from-white/[0.09] to-white/[0.02] px-4 py-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-gray-400 truncate">{asked}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                {scenarioLabel && onClear && (
                  <button
                    type="button"
                    onClick={() => {
                      onClear();
                      reset();
                    }}
                    className="inline-flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-full bg-sim/[0.14] text-[11px] font-medium text-sim hover:bg-sim/[0.22] transition-colors"
                    title="Quitar el escenario y volver a los tipos reales"
                  >
                    {scenarioLabel}
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            {answer.headline && (
              <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">{answer.headline}</div>
            )}
            <div className="mt-2 text-[15px] leading-relaxed text-gray-100">{answer.body}</div>
            <button
              type="button"
              onClick={reset}
              className="mt-2.5 text-xs text-gray-400 hover:text-white underline underline-offset-4 decoration-white/20"
            >
              Otra pregunta
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => typeAndAsk(s)}
                disabled={!!busy}
                className="h-8 px-3 rounded-full border border-white/[0.12] text-[13px] text-gray-200 hover:text-white hover:border-white/[0.40] bg-white/[0.02] hover:bg-white/[0.04] disabled:opacity-60 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
