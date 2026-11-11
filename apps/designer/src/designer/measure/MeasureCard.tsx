/**
 * One measuring card: progress, a heading, one line of instruction, the
 * picture, one box, Next and Back. It fills whatever height it is given and
 * never scrolls: the picture is the part that gives way when the screen is
 * short, so the box and the buttons stay where the thumb expects them.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MeasureCardDef } from '@setout/engine';

export interface MeasureCardProps {
  card: MeasureCardDef;
  /** Position in the deck, for the bar. */
  step: number;
  stepCount: number;
  readingCount: number;
  value: number | null;
  onChange: (value: number | null) => void;
  onNext: () => void;
  onBack: () => void;
  canBack: boolean;
  visual: ReactNode;
  nextLabel?: string;
}

export function MeasureCard({ card, step, stepCount, readingCount, value, onChange, onNext, onBack, canBack, visual, nextLabel }: MeasureCardProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(value === null ? '' : String(value));
  }, [card.id, value]);

  const isReading = card.kind === 'reading';
  const n = text.trim() === '' ? null : Number(text);
  const inRange = n !== null && Number.isFinite(n) && n >= (card.minMm ?? 1) && n <= (card.maxMm ?? 9999);
  const canNext = !isReading || inRange;
  const progress = isReading
    ? `Reading ${card.readingIndex} of ${readingCount}`
    : card.kind === 'review'
      ? 'All done'
      : 'Before you start';

  const commit = (raw: string) => {
    setText(raw);
    const v = raw.trim() === '' ? null : Number(raw);
    onChange(v !== null && Number.isFinite(v) ? Math.round(v) : null);
  };

  return (
    <section className="flex h-full flex-col bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8" aria-labelledby="mw-title">
      <div className="shrink-0">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{progress}</span>
          <span className="tabular-nums">
            {step} / {stepCount}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(step / stepCount) * 100}%` }} />
        </div>
        <h2 id="mw-title" className="mt-4 text-xl font-bold leading-tight sm:text-2xl">
          {card.title}
        </h2>
        {card.instruction && <p className="mt-1 text-sm leading-snug text-muted-foreground sm:text-base">{card.instruction}</p>}
      </div>

      <div className="my-3 flex min-h-0 flex-1 items-center justify-center">{visual}</div>

      {isReading && (
        <div className="shrink-0">
          <label htmlFor={`mw-${card.id}`} className="text-sm font-medium">
            {card.inputLabel}
          </label>
          <div className="mt-1.5 flex h-14 items-center gap-2 rounded-md border-2 border-input bg-background px-4 focus-within:border-primary">
            <input
              ref={input}
              id={`mw-${card.id}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="next"
              autoComplete="off"
              value={text}
              placeholder="0"
              aria-describedby={`mw-${card.id}-unit`}
              onChange={(e) => commit(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canNext) onNext();
              }}
              className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/40"
            />
            <span id={`mw-${card.id}-unit`} className="text-lg text-muted-foreground">
              mm
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 flex shrink-0 items-center gap-3">
        <Button type="button" variant="outline" className="h-12 px-4" onClick={onBack} disabled={!canBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <Button type="button" className="h-12 flex-1 text-base" onClick={onNext} disabled={!canNext}>
          {nextLabel ?? 'Next'}
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </section>
  );
}
