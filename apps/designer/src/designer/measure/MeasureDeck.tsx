/**
 * The measuring deck: one card at a time, then the opening drawn from the
 * numbers and one button to say they are right.
 *
 * The cards come from the engine, dealt from the shape of the shower and the
 * tool in the customer's hand. Each reading is written straight into the
 * design as it is typed, through the same functions the checks read, so a
 * locked phone loses nothing.
 */

import {
  buildCards,
  checkMeasurements,
  openingContext,
  readField,
  readingCards,
  writeField,
  type ConfiguratorState,
} from '@setout/engine';
import { useEngine } from '../engine';
import { MeasureCard } from './MeasureCard';
import { MeasureReview } from './MeasureReview';
import { CardPicture } from './visuals';

export interface MeasureDeckProps {
  state: ConfiguratorState;
  setState: (next: ConfiguratorState) => void;
  /** Which card is showing. Kept by the shell so it survives a reload. */
  index: number;
  setIndex: (index: number) => void;
  /** Back from the first card. */
  onExit: () => void;
  /** The customer has said the numbers are right. */
  onDone: () => void;
  /**
   * Whether the designer has the whole screen to itself. In a frame that
   * grows with its content there is no screen height to fill, so the card
   * takes a fixed one.
   */
  fillsViewport: boolean;
}

export function MeasureDeck({ state, setState, index, setIndex, onExit, onDone, fillsViewport }: MeasureDeckProps) {
  const { rules } = useEngine();
  const cards = buildCards(state);
  const readings = readingCards(cards);
  const at = Math.min(Math.max(index, 0), cards.length - 1);
  const card = cards[at];

  // The readings already typed, by their number, so the picture can show them.
  const done = cards
    .filter((c) => c.field?.kind === 'cross' && readField(state, c.field) !== null)
    .map((c) => (c.visual?.kind === 'cross-reading' ? c.visual.point : 0))
    .filter((n) => n > 0);

  const frame = fillsViewport ? 'h-[100dvh]' : 'h-[640px]';

  if (card.kind === 'review') {
    const problems = checkMeasurements(state.opening, openingContext(state))
      .filter((c) => c.level === 'blocking' && c.code !== 'shape-unconfirmed')
      .map((c) => c.message);
    return (
      <div className={`mx-auto w-full max-w-xl ${frame}`}>
        <MeasureReview
          state={state}
          cards={cards}
          problems={problems}
          onEdit={(cardId) => setIndex(Math.max(0, cards.findIndex((c) => c.id === cardId)))}
          onConfirm={onDone}
        />
      </div>
    );
  }

  const value = card.field ? readField(state, card.field) : null;
  return (
    <div className={`mx-auto w-full max-w-xl ${frame}`}>
      <MeasureCard
        card={card}
        step={at + 1}
        stepCount={cards.length}
        readingCount={readings.length}
        value={value}
        onChange={(next) => {
          if (card.field) setState(writeField(rules, state, card.field, next));
        }}
        onNext={() => setIndex(at + 1)}
        onBack={() => (at === 0 ? onExit() : setIndex(at - 1))}
        canBack
        visual={
          card.visual ? <CardPicture visual={card.visual} value={value} done={done} glassMm={state.heightMm} /> : null
        }
        nextLabel={at === cards.length - 2 ? 'See my measurements' : undefined}
      />
    </div>
  );
}
