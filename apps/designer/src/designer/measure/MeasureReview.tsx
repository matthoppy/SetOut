/**
 * The last screen of the measuring deck: the opening drawn from the numbers,
 * every number listed with a way back to change it, and one button to say
 * they are right. This screen may scroll; the cards before it never do.
 */

import { Check, Pencil, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConfiguratorState } from '@setout/engine';
import { readField, readingCards, unreadCards, type DeckOptions, type MeasureCardDef } from '@setout/engine';
import { useEngine } from '../engine';
import { MeasuredDrawings } from './MeasuredDrawings';
import { openingFindings } from './OpeningDrawing';
import { enclosureFindings } from './drawing/findings';

export function MeasureReview({
  state,
  cards,
  options,
  onEdit,
  onConfirm,
  problems = [],
}: {
  state: ConfiguratorState;
  cards: MeasureCardDef[];
  options: DeckOptions;
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
  // A single door is measured to a cross and has its own drawing. Every other
  // layout is drawn a run at a time, under a plan when the glass turns a corner.
  const toCross = cards.some((c) => c.field?.kind === 'cross');
  const complete = unreadCards(state, cards).length === 0;
  const findings = toCross ? openingFindings(m, toCeiling, topGap, state.heightMm) : complete ? enclosureFindings(state, options) : [];
  return (
    <section className="flex h-full flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3 sm:px-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All done</div>
        <h2 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">Your measurements</h2>
        <p className="mt-1 text-sm text-muted-foreground">Drawn from your numbers. Check it looks like your shower.</p>

        <MeasuredDrawings state={state} cards={cards} options={options} className="mx-auto mt-3 w-full max-w-[400px]" />

        <ul className="mt-2 space-y-1 text-sm">
          {findings.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--measure-accent))]" aria-hidden="true" />
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
          {toCross && m.runs[0] && (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="font-semibold">Opening</dt>
              <dd className="tabular-nums">{m.runs[0].widthAtFloorMm}mm at the floor</dd>
            </div>
          )}
          {readings.map((card) => {
            const v = card.field ? readField(state, card.field) : null;
            // The same circled number the reading has on its card and on the drawing.
            const point = card.mark ?? null;
            // A reading that may be skipped is not missing when it is left out.
            const skipped = v === null && !!card.optional;
            return (
              <div key={card.id} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="min-w-0">
                  {point === null ? (
                    <Ruler className="mr-2 inline h-5 w-5 p-0.5 align-[-5px] text-[hsl(var(--measure-accent))]" aria-hidden="true" />
                  ) : (
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[hsl(var(--measure-accent))] text-[11px] font-bold tabular-nums text-[hsl(var(--measure-accent))]">{point}</span>
                  )}
                  <span className="text-muted-foreground">{card.title}</span>
                </dt>
                <dd className="flex shrink-0 items-center gap-2 tabular-nums">
                  <span className={v !== null ? 'font-semibold' : skipped ? 'text-muted-foreground' : 'text-red-700 dark:text-red-300'}>{v !== null ? `${v}mm` : skipped ? 'Left out' : 'Missing'}</span>
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
