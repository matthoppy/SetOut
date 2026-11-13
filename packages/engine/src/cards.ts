/**
 * The measuring cards.
 *
 * The measuring step is a deck of cards, one task each: a short instruction
 * to read, or one number to type. The deck is dealt from the shape of the
 * shower and the tool in the customer's hand.
 *
 * There are two kinds of deck. A single door between two walls is measured
 * to a cross in the middle of the opening: eight readings from one place, the
 * laser's lines going four ways. Only that shape is measured to the middle
 * (Matt, 12 November 2026). Every other shape is measured a run at a time:
 * how wide the run is, in one pull of the tape, what the floor does under it,
 * the ceiling where the glass reaches it, and each wall the glass ends on.
 *
 * In both, the first measurement is along the bottom and the height of the
 * glass comes after it (Matt, 12 November 2026).
 *
 * A reading card names the field it writes through readField/writeField,
 * which call the same functions measure.ts has always used, so every rule and
 * cross-check stays where it was.
 */

import { derivePlanes, isSingleDoor, runPanelIndices } from './geometry';
import { runEndNames, runNames, wallNames } from './journey';
import { scaleRunPanels } from './layout';
import {
  applyCrossReadings,
  applyFloorReadings,
  ceilingGlassHeightMm,
  createCrossReadings,
  CROSS_POINTS,
  fallsFromReadings,
  LASER_OFFSET_DEFAULT_MM,
  MIN_PLAUSIBLE_MM,
  MIN_PLAUSIBLE_RETURN_MM,
  toolFor,
  type CrossKey,
  type OpeningMeasurements,
  type RunMeasurement,
} from './measure';
import type { Ruleset } from './ruleset';
import type { ConfiguratorState } from './types';

/** What is at one side of a run: a wall, a corner where the glass turns, or the open end. */
export type EndKind = 'wall' | 'corner' | 'open';

/**
 * A run as its picture needs it. Every run is drawn face on from outside the
 * shower, which puts the end it starts at on the left.
 */
export interface RunView {
  /** Which run this is, counting from 0, and how many the shower has. */
  run: number;
  of: number;
  left: EndKind;
  right: EndKind;
  /** Whether there is a door in this run. */
  door: boolean;
  /** Which side of the shower the run is, seen from above with the front nearest. */
  faces: 'front' | 'left' | 'right' | 'back';
  /** What the glass stands on. */
  surface: 'floor' | 'bath';
}

/** What the picture on a card shows. Each kind has a drawing in the designer. */
export type CardVisual =
  | { kind: 'marks' }
  | { kind: 'laser-setup'; toCeiling: boolean }
  | { kind: 'cross-reading'; point: number; toCeiling: boolean }
  | { kind: 'height' }
  /** Where the tape marks go, seen from above. */
  | { kind: 'plan-marks' }
  /** The laser on its tripod with both lines on, before it is stood anywhere in particular. */
  | { kind: 'laser-on' }
  /**
   * A run along the floor: in one pull, or one of its halves to the laser.
   * `laser` says the end of the run the laser stands at, over a corner mark,
   * where the pull is read.
   */
  | { kind: 'run-width'; view: RunView; part: 'whole' | 'a' | 'b'; laser?: 'left' | 'right' }
  /** The whole tray beside a walk-in screen, wall to its far edge. */
  | { kind: 'tray-width'; view: RunView }
  /** The floor up to the level line, at one side of a run. */
  | { kind: 'run-floor'; view: RunView; side: 'left' | 'right' }
  /** Floor to ceiling, at one side of a run. */
  | { kind: 'run-ceiling'; view: RunView; side: 'left' | 'right' }
  /** A wall to the laser's upright line, standing a little off it. */
  | { kind: 'wall-gap'; view: RunView; side: 'left' | 'right'; at: 'bottom' | 'top'; toCeiling: boolean }
  /** A run between two walls, measured across again at the top. */
  | { kind: 'run-top'; view: RunView }
  /** A long level held upright against a wall on the glass line, and the gap behind it at the bottom or the top. */
  | { kind: 'level-wall'; view: RunView; side: 'left' | 'right'; at: 'bottom' | 'top' }
  /** A long level laid along a run's glass line, and the gap under it at one end. */
  | { kind: 'level-floor'; view: RunView; side: 'left' | 'right' }
  /** The spirit level itself, measured from end to end. */
  | { kind: 'level-length' };

/** Where a reading card's number goes. */
export type CardField =
  | { kind: 'cross'; key: CrossKey }
  | { kind: 'height' }
  /** A run, in one pull of the tape. */
  | { kind: 'width'; run: number }
  /** A run in two halves: A from where it starts to the line, B from where it ends. */
  | { kind: 'half'; run: number; half: 'a' | 'b' }
  /** The whole tray beside a walk-in screen. */
  | { kind: 'tray' }
  /** A run between two walls, across at the top, measured with a tape. */
  | { kind: 'top'; run: number }
  /** How long the spirit level is. */
  | { kind: 'level' }
  /** A wall at the start or the end of the glass, to an upright line. */
  | { kind: 'wall'; wall: 'start' | 'end'; at: 'bottom' | 'top' }
  | { kind: 'floor'; run: number; end: 'start' | 'end' }
  | { kind: 'ceiling'; run: number; end: 'start' | 'end' };

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
  /**
   * The circled number this reading carries on its picture, in the list and
   * on the drawing at the end. The eight readings to a cross keep their own
   * numbers; elsewhere it is the order the readings are taken in.
   */
  mark?: number;
  /** A reading that helps but can be left out. The card can be passed with its box empty. */
  optional?: boolean;
  minMm?: number;
  maxMm?: number;
}

export interface DeckOptions {
  /** The glass stands on the rim of a bath, not on a tray or the floor. */
  overBath?: boolean;
  /**
   * Deal the decks for measuring with a tape and a level. Off until Matt has
   * signed them off: the designer is told by its company's config, and only
   * staging turns them on.
   */
  tape?: boolean;
}

/**
 * Whether the engine has a deck for this shower and the tool in hand. With a
 * tape, where the tape decks are switched on.
 */
export function hasDeck(state: ConfiguratorState, options: DeckOptions = {}): boolean {
  const tool = toolFor(state.opening.method);
  if (tool === 'laser') return true;
  return tool === 'tape' && !!options.tape && state.opening.method !== 'assumed-square';
}

/** The deck for this shower. Only meaningful when hasDeck says there is one. */
export function buildCards(state: ConfiguratorState, options: DeckOptions = {}): MeasureCardDef[] {
  // Measured with a tape, every shape has the tape deck, a single door
  // included: without a laser it is measured as a panel and door is (Matt,
  // 13 November 2026).
  if (hasDeck(state, options) && toolFor(state.opening.method) === 'tape') return enclosureTape(state, options);
  // The single-door laser deck is signed off (10 Nov 2026) and is the pattern
  // for the other shapes and the tape sequences.
  if (isSingleDoor(state)) return singleDoorLaser(state);
  return enclosureLaser(state, options);
}

export function readingCards(cards: MeasureCardDef[]): MeasureCardDef[] {
  return cards.filter((c) => c.kind === 'reading');
}

/** The readings a deck asks for that have not been typed, leaving out the ones that may be skipped. */
export function unreadCards(state: ConfiguratorState, cards: MeasureCardDef[]): MeasureCardDef[] {
  return readingCards(cards).filter((c) => !c.optional && c.field && readField(state, c.field) === null);
}

/** Number the reading cards, in place, in the order they are taken. */
function numbered(cards: MeasureCardDef[], markEvery: boolean): MeasureCardDef[] {
  let n = 0;
  for (const card of cards) {
    if (card.kind !== 'reading') continue;
    card.readingIndex = ++n;
    if (markEvery) card.mark = n;
  }
  return cards;
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
      mark: p.n,
      minMm: 50,
      maxMm: 3500,
    });
    // The bottom first, then the height: the customer is at the left wall,
    // and reading 2 is taken level with the mark this card asks them to make.
    if (p.n === 1 && !toCeiling) {
      cards.push({
        id: 'height',
        kind: 'reading',
        title: 'How tall is the glass?',
        instruction: 'Mark the top of the glass on a piece of tape on the left wall. Hook the tape measure on the floor and read up to your mark.',
        visual: { kind: 'height' },
        field: { kind: 'height' },
        inputLabel: 'Floor to your mark',
        minMm: 500,
        maxMm: 3000,
      });
    }
  }

  cards.push({ id: 'review', kind: 'review', title: 'Your measurements', instruction: '', visual: null });
  return numbered(cards, false);
}

// ---------------------------------------------------------------------------
// Every other shape, measured with a laser, a run at a time
// ---------------------------------------------------------------------------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What is at each side of each run, for its picture. */
export function runViews(state: ConfiguratorState, options: DeckOptions = {}): RunView[] {
  const runs = runPanelIndices(state.panels, state.junctions);
  const planes = derivePlanes(state.panels, state.junctions);
  const last = runs.length - 1;
  const sides = { front: 'front', return_left: 'left', return_right: 'right', back: 'back' } as const;
  return runs.map((indices, i) => ({
    run: i,
    of: runs.length,
    left: i === 0 ? (state.leftWall ? 'wall' : 'open') : 'corner',
    right: i === last ? (state.rightWall ? 'wall' : 'open') : 'corner',
    door: indices.some((p) => state.panels[p].kind === 'door'),
    faces: sides[planes[indices[0]] ?? 'front'],
    surface: options.overBath ? 'bath' : 'floor',
  }));
}

/**
 * What every deck for a shape of runs shares, whichever tool is in hand: the
 * runs and walls by name, the words for each place a tape goes, the marks,
 * the height, floor to ceiling where the glass reaches it, and the whole
 * tray beside a walk-in.
 */
function shapeDeck(state: ConfiguratorState, options: DeckOptions) {
  const toCeiling = state.isFloorToCeiling;
  const views = runViews(state, options);
  const multi = views.length > 1;
  const names = runNames(state);
  const walls = wallNames(state);
  const floor = options.overBath ? 'bath rim' : 'floor';
  const glass = options.overBath ? 'screen' : 'glass';
  const corners = views.some((v) => v.left === 'corner');
  const openEnd = views[views.length - 1].right === 'open';

  // An end of a run as the place the tape goes, and as two or three words.
  // For a corner, `wall` is 'left' or 'right' where the run has two of them.
  const corner = (wall: string) => (wall === 'left' || wall === 'right' ? `${wall} corner` : 'corner');
  const place = (kind: EndKind, wall: string) =>
    kind === 'corner' ? `the ${corner(wall)} mark` : kind === 'open' ? `the mark where the ${glass} stops` : `the ${wall}`;
  const brief = (kind: EndKind, wall: string) => (kind === 'corner' ? corner(wall) : kind === 'open' ? 'open end' : wall);
  // A tape hooks on a wall. On a mark it can only be held.
  const from = (kind: EndKind, wall: string) =>
    kind === 'wall' ? `Hook the tape on the ${wall} at your mark` : `Hold the end of the tape on ${place(kind, wall)}`;
  // Where a reading straight up is taken from.
  const foot = (kind: EndKind, wall: string) =>
    kind === 'wall' ? `next to the ${wall}, at your mark` : `at ${place(kind, wall)}`;

  const where =
    options.overBath
      ? 'on the bath rim against the wall and where you want the screen to stop. Draw a line across each where the glass will stand.'
      : `on the floor ${
          corners
            ? openEnd
              ? 'against the wall, at each corner and where the glass stops'
              : 'against each wall and at each corner'
            : openEnd
              ? 'against the wall and where you want the glass to stop'
              : 'against each wall'
        }. Draw the glass line on each: the middle of a plinth, or 10mm in from the edge of a tray.${
          corners ? ' At a corner draw both lines, so they cross.' : ''
        }`;

  const marks: MeasureCardDef = {
    id: 'marks',
    kind: 'instruction',
    title: 'Mark where the glass goes',
    instruction: `Stick a short piece of masking tape ${where}`,
    // Seen from above only when the glass turns a corner.
    visual: multi ? { kind: 'plan-marks' } : { kind: 'marks' },
  };

  // Asked once the first run has been measured along the bottom.
  const height: MeasureCardDef | null = toCeiling
    ? null
    : {
        id: 'height',
        kind: 'reading',
        title: `How tall is the ${glass}?`,
        instruction: `Mark the top of the ${glass} on a piece of tape on the wall. Hook the tape measure on the ${floor} and read up to your mark.`,
        visual: { kind: 'height' },
        field: { kind: 'height' },
        inputLabel: `${cap(floor)} to your mark`,
        minMm: 500,
        maxMm: 3000,
      };

  // 'the back wall, at the left end' reads badly in front of 'at the bottom',
  // so a heading uses the wall's short name, and says which side only when
  // both ends of the glass meet a wall of the same name.
  const shortWall = (full: string | null) => (full ?? 'the wall').replace(/,.*$/, '').replace(/^the /, '');
  const sameWall = !!walls.start && !!walls.end && shortWall(walls.start) === shortWall(walls.end);
  /** A wall the glass ends on: its whole name, its side, and its name in a heading. */
  const wallOf = (which: 'start' | 'end') => {
    const full = (which === 'start' ? walls.start : walls.end) ?? 'the wall';
    const side = which === 'start' ? 'left' : 'right';
    return { full, side, name: cap(shortWall(full)) + (sameWall ? ` on the ${side}` : '') } as const;
  };

  // Each run's two ends, as the tape and the words need them. A run between
  // two corners has to say which corner. 'wall' then stands for the words that
  // tell them apart.
  const endsOf = views.map((view, i) => {
    const named = runEndNames(state, i);
    const between = view.left === 'corner' && view.right === 'corner';
    return {
      left: { kind: view.left, wall: between ? 'left' : named.start },
      right: { kind: view.right, wall: between ? 'right' : named.end },
    };
  });
  const headingOf = (i: number) => (text: string) => (multi ? `${cap(names[i])}: ${text}` : cap(text));

  /** Floor to ceiling at each end of a run, where the glass is cut to it. */
  const ceilingCards = (i: number, view: RunView): MeasureCardDef[] =>
    !toCeiling
      ? []
      : (['start', 'end'] as const).map((end) => {
          const side = end === 'start' ? 'left' : 'right';
          const at = endsOf[i][side];
          return {
            id: `ceiling-${i}-${end}`,
            kind: 'reading',
            title: headingOf(i)(`ceiling at the ${brief(at.kind, at.wall)}`),
            instruction: `Hook the tape on the ${floor} ${foot(at.kind, at.wall)}, and measure straight up to the ceiling.`,
            visual: { kind: 'run-ceiling', view, side },
            field: { kind: 'ceiling', run: i, end },
            inputLabel: `${cap(floor)} to ceiling, at the ${brief(at.kind, at.wall)}`,
            minMm: 1500,
            maxMm: 4000,
          };
        });

  /** A walk-in screen: the whole tray gives the gap they walk through. */
  const trayCard = (view: RunView): MeasureCardDef | null =>
    !multi && openEnd && !options.overBath
      ? {
          id: 'tray',
          kind: 'reading',
          optional: true,
          title: 'How wide is the whole tray?',
          instruction:
            'Hook the tape on the wall and measure to the far edge of the tray, or of the opening if there is no tray. It tells you how wide the gap you walk through will be. Leave it empty if you would rather not.',
          visual: { kind: 'tray-width', view },
          field: { kind: 'tray' },
          inputLabel: 'Wall to the far edge',
          minMm: MIN_PLAUSIBLE_MM,
          maxMm: 4000,
        }
      : null;

  /** A run in one pull of the tape, from the end that has a wall to hook on. */
  const pullCard = (i: number, view: RunView): MeasureCardDef => {
    const { left, right } = endsOf[i];
    const [near, far] = right.kind === 'wall' && left.kind !== 'wall' ? [right, left] : [left, right];
    const opening = left.kind === 'wall' && right.kind === 'wall';
    return {
      id: `width-${i}`,
      kind: 'reading',
      title: multi ? `How wide is ${names[i]}?` : opening && !options.overBath ? 'How wide is the opening?' : `How long is the ${glass}?`,
      instruction: `${from(near.kind, near.wall)}, and measure along the ${floor} to ${place(far.kind, far.wall)}.`,
      visual: { kind: 'run-width', view, part: 'whole' },
      field: { kind: 'width', run: i },
      inputLabel: `${cap(brief(near.kind, near.wall))} to ${place(far.kind, far.wall).replace(/^the mark where .*$/, 'your mark')}, along the ${floor}`,
      minMm: view.door ? MIN_PLAUSIBLE_MM : MIN_PLAUSIBLE_RETURN_MM,
      maxMm: 3000,
    };
  };

  return { toCeiling, views, multi, names, floor, glass, corners, place, brief, from, foot, marks, height, wallOf, endsOf, headingOf, ceilingCards, trayCard, pullCard };
}

/**
 * The steps agreed for every shape but the single door (Notion, Customer
 * measuring flow and Measuring Calculator decisions): each run along the
 * floor in one pull of the tape, whether or not there is a door in it (Matt,
 * 12 November 2026: only a single door is measured to a laser in the middle);
 * the height once the first run has been measured; the floor under each run
 * as two readings up to the level line; floor to ceiling at each end where
 * the glass reaches it; and each wall the glass ends on as two readings to
 * the laser's upright line, stood 50mm off it.
 *
 * They are dealt one reading to a card, and in the order the customer meets
 * them walking along the glass, so the laser is moved as little as possible.
 */
function enclosureLaser(state: ConfiguratorState, options: DeckOptions): MeasureCardDef[] {
  const deck = shapeDeck(state, options);
  const { toCeiling, views, multi, names, floor, glass, corners, place, brief, from, foot, endsOf, headingOf } = deck;
  const offset = LASER_OFFSET_DEFAULT_MM;

  const cards: MeasureCardDef[] = [
    deck.marks,
    {
      id: 'laser-on',
      kind: 'instruction',
      title: 'Set up the laser',
      // Where the glass turns a corner the laser starts on the floor over the corner mark.
      instruction: corners
        ? 'Stand the laser on the floor over the corner mark and switch its lines on, so they run along both glass lines to the walls. Each card says where it stands after that. Let the lines settle before you read.'
        : 'Put the laser on a small tripod and switch both lines on. You will move it as you go, and each card says where it stands. Let the lines settle before you read.',
      visual: { kind: 'laser-on' },
    },
  ];

  const wallCards = (which: 'start' | 'end', view: RunView): MeasureCardDef[] => {
    const { full, side, name } = deck.wallOf(which);
    const top = toCeiling ? 'at the ceiling' : `at the height the ${glass} will reach`;
    return [
      {
        id: `wall-${which}-bottom`,
        kind: 'reading',
        title: `${name}, at the bottom`,
        instruction: `Move the laser so its up-and-down line is ${offset}mm off ${full}. Hold the tape against the wall at the ${floor}, on your mark, and read where the laser lights the blade. It should read about ${offset}.`,
        visual: { kind: 'wall-gap', view, side, at: 'bottom', toCeiling },
        field: { kind: 'wall', wall: which, at: 'bottom' },
        inputLabel: `${name} to the laser, at the ${floor}`,
        minMm: 5,
        maxMm: 300,
      },
      {
        id: `wall-${which}-top`,
        kind: 'reading',
        title: `${name}, at the top`,
        instruction: `Leave the laser where it is. Hold the tape against the same wall ${top}, and read where the laser lights the blade.`,
        visual: { kind: 'wall-gap', view, side, at: 'top', toCeiling },
        field: { kind: 'wall', wall: which, at: 'top' },
        inputLabel: `${name} to the laser, at the top`,
        minMm: 5,
        maxMm: 300,
      },
    ];
  };

  // The floor under a run, as two readings up to the level line at its two
  // ends. A run's fall is worked out from its own two readings alone, so the
  // laser must stay put between them, and may move between runs.
  const sidesOf = (i: number) => {
    const { left, right } = endsOf[i];
    const along = multi ? names[i] : options.overBath ? 'the bath rim' : 'the glass line';
    return [
      ['start', 'left', left, `Turn the laser so its level line runs along ${along}. `],
      ['end', 'right', right, ''],
    ] as const;
  };
  const floorCards = (i: number, view: RunView): MeasureCardDef[] =>
    sidesOf(i).map(([end, side, at, lead]) => ({
      id: `floor-${i}-${end}`,
      kind: 'reading',
      title: headingOf(i)(`${floor} at the ${brief(at.kind, at.wall)}`),
      instruction: `${lead}Hook the tape on the ${floor} ${foot(at.kind, at.wall)}, and read up at the level line.`,
      visual: { kind: 'run-floor', view, side },
      field: { kind: 'floor', run: i, end },
      inputLabel: `${cap(floor)} up to the level line, at the ${brief(at.kind, at.wall)}`,
      minMm: 50,
      maxMm: 2500,
    }));

  // How wide each run is, along the bottom, all taken first.
  //
  // Where the glass turns a corner the laser stands over the corner mark with
  // its lines along both glass lines, and each run that meets that corner is
  // measured from its other end and read at the laser (Matt, 12 November
  // 2026: "you always take the tape measurement reading from the laser"). So
  // the laser stands at one corner for every run it can, and moves once at
  // most. A run with no corner is one pull of the tape, door or not: only a
  // single door between two walls is measured to a laser in the middle.
  let laserAt: number | null = null; // the corner the laser stands over, by the run it starts
  views.forEach((view, i) => {
    const run = names[i];
    const { left, right } = endsOf[i];
    const minWidth = view.door ? MIN_PLAUSIBLE_MM : MIN_PLAUSIBLE_RETURN_MM;
    const corners = [view.left === 'corner' ? i : null, view.right === 'corner' ? i + 1 : null].filter((c): c is number => c !== null);

    if (corners.length === 0) {
      cards.push(deck.pullCard(i, view));
    } else {
      const corner = laserAt !== null && corners.includes(laserAt) ? laserAt : corners[0];
      const side = corner === i ? 'left' : 'right';
      const [at, other] = side === 'left' ? [left, right] : [right, left];
      const lead =
        laserAt === corner
          ? 'Leave the laser where it is. '
          : laserAt === null
            ? `Stand the laser over ${place('corner', at.wall)}, with its lines along both glass lines. `
            : 'Move the laser over the other corner mark, with its lines along both glass lines. ';
      laserAt = corner;
      cards.push({
        id: `width-${i}`,
        kind: 'reading',
        title: multi ? `How wide is ${run}?` : `How long is the ${glass}?`,
        instruction: `${lead}${from(other.kind, other.wall)}, along the ${floor}, and read where the laser lights the blade.`,
        visual: { kind: 'run-width', view, part: 'whole', laser: side },
        field: { kind: 'width', run: i },
        inputLabel: `${cap(brief(other.kind, other.wall))} to the laser, along the ${floor}`,
        minMm: minWidth,
        maxMm: 3000,
      });
      // The floor under it while the laser is still over the corner (Matt,
      // 12 November 2026: the bottom readings can be taken from that spot as
      // well, as long as nothing more has to be measured). Nothing more does:
      // the same two readings, taken sooner, from one place.
      cards.push(...floorCards(i, view));
    }

    const tray = deck.trayCard(view);
    if (tray) cards.push(tray);
  });

  // The bottom first, then the height (Matt, 12 November 2026).
  if (deck.height) cards.push(deck.height);

  // Then each run in turn: the floor under it (where it was not taken with
  // the width), the ceiling where the glass reaches it, and the wall it ends on.
  views.forEach((view, i) => {
    if (!corners) cards.push(...floorCards(i, view));
    cards.push(...deck.ceilingCards(i, view));

    // The walls the glass ends on, while the laser is at that end of it.
    if (i === 0 && view.left === 'wall') cards.push(...wallCards('start', view));
    if (i === views.length - 1 && view.right === 'wall') cards.push(...wallCards('end', view));
  });

  cards.push({ id: 'review', kind: 'review', title: 'Your measurements', instruction: '', visual: null });
  return numbered(cards, true);
}

/**
 * The same shapes measured with a tape and a long spirit level, and glazing
 * packers if there are some, taking the readings the older tape screens
 * take: each run in one pull of the tape, to the corner marks where the
 * glass turns; the height; for a run between two walls, the width again at
 * the top, the customer's own early warning that a wall leans; the floor
 * under each run as the gap under a level laid along its glass line; floor
 * to ceiling where the glass reaches it; and each wall the glass ends on as
 * the gap behind a level held upright against it. The end of a level that
 * touches reads 0, so a gap reads as a laser reading would: bigger where the
 * floor is lower, or the wall further off.
 *
 * Dealt only where switched on. Signed off by Matt on 13 November 2026,
 * when he also decided that a single door without a laser is measured as a
 * panel and door is, so it has this deck too.
 */
function enclosureTape(state: ConfiguratorState, options: DeckOptions): MeasureCardDef[] {
  const deck = shapeDeck(state, options);
  const { toCeiling, views, multi, names, floor, brief, endsOf, headingOf } = deck;
  const cards: MeasureCardDef[] = [deck.marks];

  views.forEach((view, i) => {
    cards.push(deck.pullCard(i, view));
    const tray = deck.trayCard(view);
    if (tray) cards.push(tray);
  });

  // The bottom first, then the height (Matt, 12 November 2026).
  if (deck.height) cards.push(deck.height);

  // Between two walls, the same width again at the top, where the glass will
  // reach. A corner has nothing to measure the top to.
  const only = views[0];
  if (!multi && only.left === 'wall' && only.right === 'wall') {
    cards.push({
      id: 'width-top-0',
      kind: 'reading',
      title: 'How wide is it at the top?',
      instruction: `Hook the tape on the left wall ${toCeiling ? 'just under the ceiling' : 'level with your mark at the top'}, and measure across to the right wall. Keep the tape level: one that droops reads long.`,
      visual: { kind: 'run-top', view: only },
      field: { kind: 'top', run: 0 },
      inputLabel: 'Left wall to the right wall, at the top',
      minMm: MIN_PLAUSIBLE_MM,
      maxMm: 3000,
    });
  }

  // How long the level is, so what it shows is scaled up to the glass and
  // to each run (Matt, 13 November 2026). Asked before it is first used.
  cards.push({
    id: 'level-length',
    kind: 'reading',
    title: 'How long is your level?',
    instruction: 'Measure your spirit level from end to end. The longer it is the better, but any long level will do: we scale what it shows up to the whole glass.',
    visual: { kind: 'level-length' },
    field: { kind: 'level' },
    inputLabel: 'Your level, end to end',
    minMm: 300,
    maxMm: 2500,
  });

  // The floor under a run: a level laid along its glass line, its lower end
  // lifted until the bubble is in the middle, and the gap under each end.
  const floorCards = (i: number, view: RunView): MeasureCardDef[] =>
    (['start', 'end'] as const).map((end) => {
      const side = end === 'start' ? 'left' : 'right';
      const at = endsOf[i][side];
      const along = multi ? names[i] : options.overBath ? 'the bath rim' : 'the glass line';
      return {
        id: `floor-${i}-${end}`,
        kind: 'reading',
        title: headingOf(i)(`${floor} at the ${brief(at.kind, at.wall)}`),
        instruction:
          end === 'start'
            ? `Lay a long level along ${along} and lift its low end until the bubble is in the middle. Measure the gap under it at the ${brief(at.kind, at.wall)}, or fill it with packers and add up their thicknesses. Where it touches, it is 0.`
            : `Keep the level where it is, and measure the gap under it at the ${brief(at.kind, at.wall)}. Where it touches, it is 0.`,
        visual: { kind: 'level-floor', view, side },
        field: { kind: 'floor', run: i, end },
        inputLabel: `Gap under the level, at the ${brief(at.kind, at.wall)}`,
        minMm: 0,
        maxMm: 100,
      };
    });

  // A wall the glass ends on: a level held upright against it on the glass
  // line, and the gap behind it at the bottom and at the top.
  const wallCards = (which: 'start' | 'end', view: RunView): MeasureCardDef[] => {
    const { full, side, name } = deck.wallOf(which);
    return [
      {
        id: `wall-${which}-bottom`,
        kind: 'reading',
        title: `${name}, at the bottom`,
        instruction: `Stand a long level upright on your mark, against ${full}, the bubble in the middle. Measure the gap behind it at the bottom, or fill it with packers and add up their thicknesses. Where it touches, it is 0.`,
        visual: { kind: 'level-wall', view, side, at: 'bottom' },
        field: { kind: 'wall', wall: which, at: 'bottom' },
        inputLabel: `${name}: gap behind the level, at the bottom`,
        minMm: 0,
        maxMm: 100,
      },
      {
        id: `wall-${which}-top`,
        kind: 'reading',
        title: `${name}, at the top`,
        instruction: 'Keep the level where it is, and measure the gap behind it at its top end. Where it touches, it is 0.',
        visual: { kind: 'level-wall', view, side, at: 'top' },
        field: { kind: 'wall', wall: which, at: 'top' },
        inputLabel: `${name}: gap behind the level, at the top`,
        minMm: 0,
        maxMm: 100,
      },
    ];
  };

  // Then each run in turn, along the glass: the floor under it, the ceiling
  // where the glass reaches it, and the wall it ends on.
  views.forEach((view, i) => {
    cards.push(...floorCards(i, view));
    cards.push(...deck.ceilingCards(i, view));
    if (i === 0 && view.left === 'wall') cards.push(...wallCards('start', view));
    if (i === views.length - 1 && view.right === 'wall') cards.push(...wallCards('end', view));
  });

  cards.push({ id: 'review', kind: 'review', title: 'Your measurements', instruction: '', visual: null });
  return numbered(cards, true);
}

// ---------------------------------------------------------------------------
// Reading and writing a card's number
// ---------------------------------------------------------------------------

export function readField(state: ConfiguratorState, field: CardField): number | null {
  const m = state.opening;
  switch (field.kind) {
    case 'height':
      return state.heightMm;
    case 'cross':
      return m.crossReadings?.[field.key] ?? null;
    case 'width':
      return m.runs[field.run]?.wholeMm ?? null;
    case 'half': {
      const run = m.runs[field.run];
      return (field.half === 'a' ? run?.halfAMm : run?.halfBMm) ?? null;
    }
    case 'tray':
      return m.walkInOpeningMm ?? null;
    case 'top':
      return m.runs[field.run]?.widthAtTopCheckMm ?? null;
    case 'level':
      return m.levelLengthMm ?? null;
    case 'wall': {
      const wall = field.wall === 'start' ? m.startWall : m.endWall;
      return field.at === 'bottom' ? wall.gapBottomMm : wall.gapTopMm;
    }
    case 'floor': {
      const run = m.runs[field.run];
      return (field.end === 'start' ? run?.floorStartMm : run?.floorEndMm) ?? null;
    }
    case 'ceiling': {
      const run = m.runs[field.run];
      return (field.end === 'start' ? run?.ceilingStartMm : run?.ceilingEndMm) ?? null;
    }
  }
}

/**
 * The design with one reading changed, and everything that follows from it.
 *
 * A width resizes the panels of its run, so the drawing shows what was
 * measured. A reading to the cross goes through applyCrossReadings so the
 * width, the walls, the floor and the ceiling height all follow. Floor
 * readings become a fall and its direction. Ceiling readings set the height
 * of glass that goes to the ceiling. Any change means the measurements have
 * not been agreed yet. Clearing a box takes that reading away and leaves
 * what was worked out from it standing until another is typed.
 */
export function writeField(
  rules: Ruleset,
  state: ConfiguratorState,
  field: CardField,
  value: number | null
): ConfiguratorState {
  const next = writeReading(rules, state, field, value);
  // A fall read off a level is scaled to its run, so it is worked out again
  // whenever the floor, the run or the level's length changes.
  return field.kind === 'floor' || field.kind === 'width' || field.kind === 'level' ? { ...next, opening: fallsFromReadings(next.opening) } : next;
}

function writeReading(
  rules: Ruleset,
  state: ConfiguratorState,
  field: CardField,
  value: number | null
): ConfiguratorState {
  const m = state.opening;
  const runIndices = runPanelIndices(state.panels, state.junctions);
  const withRun = (i: number, change: (run: RunMeasurement) => RunMeasurement): OpeningMeasurements => ({
    ...m,
    runs: m.runs.map((run, j) => (j === i ? change(run) : run)),
    shapeConfirmed: false,
  });
  // A run's panels fill the width measured for it.
  const resized = (i: number, opening: OpeningMeasurements): ConfiguratorState => {
    const width = opening.runs[i].widthAtFloorMm;
    return {
      ...state,
      opening,
      panels: width !== m.runs[i].widthAtFloorMm ? scaleRunPanels(state.panels, runIndices[i] ?? [], width) : state.panels,
    };
  };

  switch (field.kind) {
    case 'height':
      return value === null ? state : { ...state, heightMm: value };

    case 'cross': {
      const cross = m.crossReadings ?? createCrossReadings();
      const next = applyCrossReadings(m, { ...cross, [field.key]: value });
      const topGap = state.topGapMm ?? rules.making.heights.singleDoorTopGapMm;
      return {
        ...resized(0, next),
        // Door height follows the ceiling, less the air gap.
        ...(state.isFloorToCeiling && next.ceilingHeightMm ? { heightMm: next.ceilingHeightMm - topGap } : {}),
      };
    }

    case 'width':
      return resized(
        field.run,
        withRun(field.run, (run) => ({
          ...run,
          wholeMm: value,
          halfAMm: null,
          halfBMm: null,
          widthAtFloorMm: value ?? run.widthAtFloorMm,
        }))
      );

    case 'half':
      return resized(
        field.run,
        withRun(field.run, (run) => {
          const a = field.half === 'a' ? value : (run.halfAMm ?? null);
          const b = field.half === 'b' ? value : (run.halfBMm ?? null);
          // Nobody is asked to add up. The width is the two halves together.
          const total = a !== null && b !== null ? Math.round(a + b) : null;
          return { ...run, wholeMm: null, halfAMm: a, halfBMm: b, widthAtFloorMm: total ?? run.widthAtFloorMm };
        })
      );

    case 'tray':
      return { ...state, opening: { ...m, walkInOpeningMm: value, shapeConfirmed: false } };

    case 'top':
      return {
        ...state,
        opening: { ...m, runs: m.runs.map((r, i) => (i === field.run ? { ...r, widthAtTopCheckMm: value } : r)), shapeConfirmed: false },
      };

    case 'level':
      return { ...state, opening: { ...m, levelLengthMm: value, shapeConfirmed: false } };

    case 'wall': {
      const key = field.wall === 'start' ? 'startWall' : 'endWall';
      const reading = field.at === 'bottom' ? 'gapBottomMm' : 'gapTopMm';
      return { ...state, opening: { ...m, [key]: { ...m[key], [reading]: value }, shapeConfirmed: false } };
    }

    case 'floor':
      return {
        ...state,
        opening: withRun(field.run, (run) =>
          applyFloorReadings(
            run,
            field.end === 'start' ? value : (run.floorStartMm ?? null),
            field.end === 'end' ? value : (run.floorEndMm ?? null)
          )
        ),
      };

    case 'ceiling': {
      const opening = withRun(field.run, (run) => ({
        ...run,
        [field.end === 'start' ? 'ceilingStartMm' : 'ceilingEndMm']: value,
      }));
      // A single door measured with a tape stops the air gap short of the
      // lower of its two readings, as one measured to the cross does.
      if (isSingleDoor(state)) {
        const run = opening.runs[field.run];
        const lowest = run && run.ceilingStartMm != null && run.ceilingEndMm != null ? Math.min(run.ceilingStartMm, run.ceilingEndMm) : null;
        const topGap = state.topGapMm ?? rules.making.heights.singleDoorTopGapMm;
        return {
          ...state,
          opening: { ...opening, ceilingHeightMm: lowest },
          ...(state.isFloorToCeiling && lowest ? { heightMm: lowest - topGap } : {}),
        };
      }
      // An enclosure to the ceiling is cut to the tallest reading, and the
      // lower end becomes a raked top edge.
      const tallest = ceilingGlassHeightMm(opening);
      return {
        ...state,
        opening,
        ...(state.isFloorToCeiling && !isSingleDoor(state) && tallest ? { heightMm: tallest } : {}),
      };
    }
  }
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
