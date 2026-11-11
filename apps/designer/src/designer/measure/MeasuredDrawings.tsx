/**
 * What was measured, drawn: the opening for a single door, or a plan from
 * above and each run face on for every other layout.
 *
 * It is shown on the last measuring card for the customer to agree, and it is
 * sent with the design, so the company sees every reading that was taken and
 * not only the sizes worked out from them.
 */

import { runNames, runViews, unreadCards, type ConfiguratorState, type DeckOptions, type MeasureCardDef } from '@setout/engine';
import { useEngine } from '../engine';
import { OpeningDrawing } from './OpeningDrawing';
import { ExaggerationNote } from './drawing/parts';
import { PlanDrawing } from './drawing/PlanDrawing';
import { RunDrawing } from './drawing/RunDrawing';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Null until every reading the deck asks for is in: nothing is drawn from a guess. */
export function MeasuredDrawings({ state, cards, options, className }: { state: ConfiguratorState; cards: MeasureCardDef[]; options: DeckOptions; className?: string }) {
  const { heights } = useEngine().rules.making;
  // A single door is measured to a cross and has its own drawing.
  if (cards.some((c) => c.field?.kind === 'cross')) {
    return (
      <OpeningDrawing
        opening={state.opening}
        heightMm={state.heightMm}
        toCeiling={state.isFloorToCeiling}
        topGapMm={state.topGapMm ?? heights.singleDoorTopGapMm}
        panels={state.panels}
        className={className}
      />
    );
  }
  if (unreadCards(state, cards).length > 0) return null;
  const views = runViews(state, options);
  const names = runNames(state);
  return (
    <figure className={className}>
      {views.length > 1 && <PlanDrawing state={state} options={options} className="block w-full" />}
      {views.map((view) => (
        <div key={view.run} className={views.length > 1 ? 'mt-3 border-t pt-2' : undefined}>
          {views.length > 1 && (
            <div className="text-sm font-semibold" data-drawing-title="">
              {cap(names[view.run] ?? '')}, from outside
            </div>
          )}
          <RunDrawing state={state} cards={cards} view={view} className="block w-full" />
        </div>
      ))}
      <ExaggerationNote />
    </figure>
  );
}
