/**
 * The measuring cards.
 *
 * The measuring step is a deck of cards, one task each: a short instruction
 * to read, or one number to type. The deck is dealt from the shape of the
 * shower and the tool in the customer's hand, so a single door measured with
 * a laser gets the eight readings to the cross and nothing else, and a
 * walk-in screen measured with a tape gets its own, shorter sequence.
 *
 * A reading card names the field it writes through readField/writeField,
 * which call the same functions measure.ts has always used, so every rule and
 * cross-check stays where it was.
 */

import { isSingleDoor, runPanelIndices } from './geometry';
import { scaleRunPanels } from './layout';
import {
  applyCrossReadings,
  ceilingGlassHeightMm,
  createCrossReadings,
  CROSS_POINTS,
  toolFor,
  type CrossKey,
} from './measure';
import type { Ruleset } from './ruleset';
import type { ConfiguratorState } from './types';

/** What the picture on a card shows. Each kind has a drawing in the designer. */
export type CardVisual =
  | { kind: 'marks' }
  | { kind: 'laser-setup'; toCeiling: boolean }
  | { kind: 'cross-reading'; point: number; toCeiling: boolean }
  | { kind: 'height' };

/** Where a reading card's number goes. */
export type CardField = { kind: 'cross'; key: CrossKey } | { kind: 'height' };

export interface MeasureCardDef {
  id: string;
  kind: 'instruction' | 'reading' | 'review';
  /** What they are measuring, as the heading. */
  title: string;
  /** Where to take it, in one or two short sentences. */
  instruction: string;
  visual: CardVisual | null;
  field?: CardField;
  /** The words beside the box, for example "Left wall to the line, at the floor". */
  inputLabel?: string;
  /** 1-based position among the reading cards, for "Reading 3 of 8". */
  readingIndex?: number;
  minMm?: number;
  maxMm?: number;
}

export function buildCards(state: ConfiguratorState): MeasureCardDef[] {
  const tool = toolFor(state.opening.method);
  if (isSingleDoor(state) && tool === 'laser') return singleDoorLaser(state);
  // The single-door laser deck is signed off (10 Nov 2026) and is the pattern
  // for the other shapes and the tape sequences; until they are written,
  // every shape gets the single-door deck.
  return singleDoorLaser(state);
}

export function readingCards(cards: MeasureCardDef[]): MeasureCardDef[] {
  return cards.filter((c) => c.kind === 'reading');
}

// ---------------------------------------------------------------------------
// Single door between two walls, measured with a laser
// ---------------------------------------------------------------------------

function singleDoorLaser(state: ConfiguratorState): MeasureCardDef[] {
  const toCeiling = state.isFloorToCeiling;
  // Readings 2 and 4 are taken at the ceiling when the door goes to the
  // ceiling, even though the glass stops an air gap short of it. The corner of
  // wall and ceiling is a firm place to hook the tape, the plumb barely changes
  // over the gap, and the customer is already at the ceiling for 7 and 8.
  const top = toCeiling ? 'along the ceiling' : 'held level with your mark on the wall';
  const cards: MeasureCardDef[] = [
    {
      id: 'marks',
      kind: 'instruction',
      title: 'Mark where the glass goes',
      instruction:
        'Stick a short piece of masking tape on the floor against each wall and draw the glass line on it: the middle of a plinth, or 10mm in from the edge of a tray.',
      visual: { kind: 'marks' },
    },
    {
      id: 'laser-setup',
      kind: 'instruction',
      title: 'Set up the laser',
      instruction:
        'Put the laser on a small tripod in front of the shower, back from the glass line, with its up-and-down line through the middle of your marks. Switch both lines on.',
      visual: { kind: 'laser-setup', toCeiling },
    },
  ];

  if (!toCeiling) {
    cards.push({
      id: 'height',
      kind: 'reading',
      title: 'How tall is the glass?',
      instruction: 'Mark the top of the glass on a piece of tape on the wall. Hook the tape measure on the floor and read up to your mark.',
      visual: { kind: 'height' },
      field: { kind: 'height' },
      inputLabel: 'Floor to your mark',
      minMm: 500,
      maxMm: 3000,
    });
  }

  const words: Record<number, { title: string; instruction: string; label: string }> = {
    1: {
      title: 'Left wall, at the bottom',
      instruction: 'Hook the tape on the left wall at your mark, along the floor, and read where the laser lights the blade.',
      label: 'Left wall to the laser, at the floor',
    },
    2: {
      title: 'Left wall, at the top',
      instruction: `Hook the tape on the left wall ${top}, and read where the laser lights the blade.`,
      label: 'Left wall to the laser, at the top',
    },
    3: {
      title: 'Right wall, at the bottom',
      instruction: 'Hook the tape on the right wall at your mark, along the floor, and read where the laser lights the blade.',
      label: 'Right wall to the laser, at the floor',
    },
    4: {
      title: 'Right wall, at the top',
      instruction: `Hook the tape on the right wall ${top}, and read where the laser lights the blade.`,
      label: 'Right wall to the laser, at the top',
    },
    5: {
      title: 'Floor, on the left',
      instruction: 'Hook the tape on the floor next to the left wall, at your mark, and read up at the level line.',
      label: 'Floor up to the level line, left',
    },
    6: {
      title: 'Floor, on the right',
      instruction: 'Hook the tape on the floor next to the right wall, at your mark, and read up at the level line.',
      label: 'Floor up to the level line, right',
    },
    7: {
      title: 'Ceiling, on the left',
      instruction: 'Hold the tape against the ceiling next to the left wall and read down at the level line.',
      label: 'Level line up to the ceiling, left',
    },
    8: {
      title: 'Ceiling, on the right',
      instruction: 'Hold the tape against the ceiling next to the right wall and read down at the level line.',
      label: 'Level line up to the ceiling, right',
    },
  };

  for (const p of CROSS_POINTS.filter((x) => x.n <= 6 || toCeiling)) {
    const w = words[p.n];
    cards.push({
      id: `cross-${p.n}`,
      kind: 'reading',
      title: w.title,
      instruction: w.instruction,
      visual: { kind: 'cross-reading', point: p.n, toCeiling },
      field: { kind: 'cross', key: p.key },
      inputLabel: w.label,
      minMm: 50,
      maxMm: 3500,
    });
  }

  cards.push({ id: 'review', kind: 'review', title: 'Your measurements', instruction: '', visual: null });

  // Number the reading cards.
  let n = 0;
  for (const c of cards) if (c.kind === 'reading') c.readingIndex = ++n;
  return cards;
}

// ---------------------------------------------------------------------------
// Reading and writing a card's number
// ---------------------------------------------------------------------------

export function readField(state: ConfiguratorState, field: CardField): number | null {
  if (field.kind === 'height') return state.heightMm;
  return state.opening.crossReadings?.[field.key] ?? null;
}

/**
 * The design with one reading changed. A cross reading goes through
 * applyCrossReadings so the width, the walls, the floor and the ceiling
 * height all follow, exactly as the previous screens did.
 */
export function writeField(
  rules: Ruleset,
  state: ConfiguratorState,
  field: CardField,
  value: number | null
): ConfiguratorState {
  if (field.kind === 'height') {
    return value === null ? state : { ...state, heightMm: value };
  }
  const m = state.opening;
  const cross = m.crossReadings ?? createCrossReadings();
  const next = applyCrossReadings(m, { ...cross, [field.key]: value });
  const width = next.runs[0].widthAtFloorMm;
  const runIndices = runPanelIndices(state.panels, state.junctions);
  const topGap = state.topGapMm ?? rules.making.heights.singleDoorTopGapMm;
  return {
    ...state,
    opening: next,
    panels: width !== m.runs[0].widthAtFloorMm ? scaleRunPanels(state.panels, runIndices[0] ?? [], width) : state.panels,
    // Door height follows the ceiling, less the air gap.
    ...(state.isFloorToCeiling && next.ceilingHeightMm ? { heightMm: next.ceilingHeightMm - topGap } : {}),
  };
}

/**
 * What changes in a design when the glass is taken up to the ceiling, or
 * brought back to a set height.
 *
 * Going to the ceiling, the height follows whatever has already been
 * measured: a single door stops an air gap short of the ceiling, and other
 * glass is cut to it. Either way the measurements want looking at again,
 * because the readings that are needed have changed.
 */
export function ceilingChoice(
  rules: Ruleset,
  state: ConfiguratorState,
  toCeiling: boolean
): Partial<ConfiguratorState> {
  const m = state.opening;
  const opening = { ...m, shapeConfirmed: false };
  if (!toCeiling) return { isFloorToCeiling: false, opening };
  const topGap = state.topGapMm ?? rules.making.heights.singleDoorTopGapMm;
  const heightMm = isSingleDoor(state)
    ? m.ceilingHeightMm
      ? m.ceilingHeightMm - topGap
      : null
    : ceilingGlassHeightMm(m);
  return { isFloorToCeiling: true, ...(heightMm ? { heightMm } : {}), opening };
}
