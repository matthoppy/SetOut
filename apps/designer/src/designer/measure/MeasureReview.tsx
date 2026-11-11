/**
 * The last screen of the measuring deck: the opening drawn from the numbers,
 * every number listed with a way back to change it, and one button to say
 * they are right. This screen may scroll; the cards before it never do.
 */

import { Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConfiguratorState } from '@setout/engine';
import { readField, readingCards, type MeasureCardDef } from '@setout/engine';
import { useEngine } from '../engine';
import { OpeningDrawing, openingFindings } from './OpeningDrawing';

export function MeasureReview({
  state,
  cards,
  onEdit,
  onConfirm,
  problems = [],
}: {
  state: ConfiguratorState;
  cards: MeasureCardDef[];
  onEdit: (cardId: string) => void;
  onConfirm: () => void;
  /** Anything the checks found that must be sorted before moving on. */
  problems?: string[];
}) {
  const readings = readingCards(cards);
  const m = state.opening;
  const toCeiling = state.isFloorToCeiling;
  const { heights } = useEngine().rules.making;
  const topGap = state.topGapMm ?? heights.singleDoorTopGapMm;
  const bottom = m.runs[0]?.widthAtFloorMm;
  return (
    <section className="flex h-full flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3 sm:px-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All done</div>
        <h2 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">Your measurements</h2>
        <p className="mt-1 text-sm text-muted-foreground">Drawn from your numbers. Check it looks like your shower.</p>

        <OpeningDrawing opening={m} heightMm={state.heightMm} toCeiling={toCeiling} topGapMm={topGap} panels={state.panels} className="mx-auto mt-3 w-full max-w-[440px]" />

        <ul className="mt-2 space-y-1 text-sm">
          {openingFindings(m, toCeiling, topGap, state.heightMm).map((f) => (
            <li key={f} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>

        {problems.length > 0 && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {problems.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        )}

        <dl className="mt-4 divide-y border-y text-sm">
          {bottom && (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="font-semibold">Opening</dt>
              <dd className="tabular-nums">{bottom}mm at the floor</dd>
            </div>
          )}
          {readings.map((card) => {
            const v = card.field ? readField(state, card.field) : null;
            return (
              <div key={card.id} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="min-w-0">
                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums">{card.readingIndex}</span>
                  <span className="text-muted-foreground">{card.title}</span>
                </dt>
                <dd className="flex shrink-0 items-center gap-2 tabular-nums">
                  <span className={v === null ? 'text-red-700' : 'font-semibold'}>{v === null ? 'Missing' : `${v}mm`}</span>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Change ${card.title.toLowerCase()}`} onClick={() => onEdit(card.id)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
      <div className="shrink-0 border-t bg-background px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8">
        <Button type="button" className="h-12 w-full text-base" onClick={onConfirm} disabled={problems.length > 0}>
          <Check className="h-5 w-5" />
          These are right, carry on
        </Button>
      </div>
    </section>
  );
}
