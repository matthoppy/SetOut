/**
 * The measuring journey.
 *
 * One screen per task, generated from the shape and the tool in the
 * customer's hand. A walk-in screen gets six screens; a three-sided enclosure
 * to a sloping ceiling gets fourteen. The shell shows one at a time on every
 * device, and both the phone and the desktop read the same list — so there is
 * exactly one place that knows which check belongs to which screen, which is
 * what the hand-counted card arithmetic it replaces got wrong.
 *
 * Nothing here touches the engine. Screens read and write the fields that
 * measure.ts already defines; this module only decides what to ask, in what
 * order, and what to call things in the customer's own words.
 *
 * Pure, and deliberately free of path aliases so it runs under Node for the
 * tests the same way measure.ts does.
 */

import {
  derivePlanes,
  hasTransom,
  isSingleDoor,
  openingContext,
  runLabelsFor,
  runPanelIndices,
  type Plane,
} from './geometry';
import {
  ceilingSlope,
  CROSS_POINTS,
  crossMissing,
  floorMeasured,
  halvesTotalMm,
  LASER_OFFSET_DEFAULT_MM,
  measuredInHalves,
  toolFor,
  topWidthMm,
  walkInGapMm,
  wallLean,
  wallMeasured,
  type MeasureCheck,
  type OpeningMeasurements,
} from './measure';
import type { ConfiguratorJunction, ConfiguratorPanel } from './types';

/** The slice of the design the journey needs. */
export interface JourneyState {
  panels: ConfiguratorPanel[];
  junctions: ConfiguratorJunction[];
  leftWall: boolean;
  rightWall: boolean;
  heightMm: number;
  isFloorToCeiling: boolean;
  topGapMm?: number;
  aboveDoor?: 'open' | 'glass' | null;
  doorHeightMm?: number;
  opening: OpeningMeasurements;
}

export type ScreenKind =
  | 'method'
  | 'overview'
  | 'height'
  | 'transom'
  | 'cross-setup'
  | 'cross'
  | 'width'
  | 'width-top'
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'notches'
  | 'summary';

interface ScreenBase {
  id: string;
  kind: ScreenKind;
  /** The question, as the screen heading. */
  title: string;
  /** Two or three words for the progress rail. */
  short: string;
}

export interface SimpleScreen extends ScreenBase {
  kind: 'method' | 'overview' | 'height' | 'transom' | 'cross-setup' | 'notches' | 'summary';
}

export interface RunScreen extends ScreenBase {
  kind: 'width' | 'width-top' | 'floor' | 'ceiling';
  runIndex: number;
}

export interface WallScreen extends ScreenBase {
  kind: 'wall';
  wall: 'start' | 'end';
}

export type CrossGroup = 'left' | 'right' | 'floor' | 'ceiling';

export interface CrossScreen extends ScreenBase {
  kind: 'cross';
  group: CrossGroup;
  /** The two reading numbers taken on this screen, as on the diagram. */
  points: [number, number];
}

export type MeasureScreen = SimpleScreen | RunScreen | WallScreen | CrossScreen;

// ---------------------------------------------------------------------------
// Names in the customer's words
// ---------------------------------------------------------------------------

/** 'Left return' is the workshop's name; the customer calls it the left side. */
function friendlyRun(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'the opening') return 'the opening';
  return `the ${lower.replace('return', 'side')}`;
}

/** Each run as the customer would point at it: 'the front', 'the left side'. */
export function runNames(state: JourneyState): string[] {
  return runLabelsFor(state.panels, state.junctions).map(friendlyRun);
}

/**
 * What to call the two walls the glass meets, or null where an end is open.
 *
 * Worked out from the traced geometry rather than the panel order: on
 * "Corner, door and side" the first panel is the side, so the first wall is
 * the back wall, not the left one.
 */
export function wallNames(state: JourneyState): { start: string | null; end: string | null } {
  const runs = runPanelIndices(state.panels, state.junctions);
  const planes = derivePlanes(state.panels, state.junctions);
  const start = state.leftWall;
  const end = state.rightWall;

  if (!start && !end) return { start: null, end: null };
  // One wall needs no telling apart, however many runs there are.
  if (start !== end) return { start: start ? 'the wall' : null, end: end ? 'the wall' : null };
  if (runs.length <= 1) return { start: 'the left wall', end: 'the right wall' };

  const startPlane: Plane = planes[runs[0][0]] ?? 'front';
  const endPlane: Plane = planes[runs[runs.length - 1][0]] ?? 'front';
  const isReturn = (p: Plane) => p !== 'front';
  const bothReturns = isReturn(startPlane) && isReturn(endPlane);
  const lastPanel = state.panels[state.panels.length - 1];
  const firstPanel = state.panels[0];

  const startName = !start
    ? null
    : isReturn(startPlane)
      ? bothReturns
        ? 'the back wall, at the left end'
        : 'the back wall'
      : firstPanel?.kind === 'door'
        ? 'the left wall, beside the door'
        : 'the left wall';
  const endName = !end
    ? null
    : isReturn(endPlane)
      ? bothReturns
        ? 'the back wall, at the right end'
        : 'the back wall'
      : lastPanel?.kind === 'door'
        ? 'the right wall, beside the door'
        : 'the right wall';
  return { start: startName, end: endName };
}

/**
 * What is at each end of a run: a wall, a corner, or the open end. Used to
 * label the two readings on the floor and ceiling screens, and the halves of
 * a width.
 */
export function runEndNames(state: JourneyState, runIndex: number): { start: string; end: string } {
  const runs = runPanelIndices(state.panels, state.junctions);
  const walls = wallNames(state);
  const last = runs.length - 1;
  const wallWord = (name: string | null) =>
    name ? name.replace(/^the /, '').replace(/,.*$/, '') : 'open end';

  if (runs.length <= 1) {
    return {
      start: state.leftWall ? (state.rightWall ? 'left wall' : 'wall') : 'open end',
      end: state.rightWall ? (state.leftWall ? 'right wall' : 'wall') : 'open end',
    };
  }
  return {
    start: runIndex === 0 ? (state.leftWall ? wallWord(walls.start) : 'open end') : 'corner',
    end: runIndex === last ? (state.rightWall ? wallWord(walls.end) : 'open end') : 'corner',
  };
}

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

/**
 * Whether the ceiling needs measuring along each run: glass to the ceiling
 * (other than a single door, whose cross covers it) or a ceiling the customer
 * has said comes down over the shower.
 */
export function ceilingScreensWanted(state: JourneyState): boolean {
  if (isSingleDoor(state)) return false;
  return state.isFloorToCeiling || state.opening.aboveGlass === 'ceiling';
}

export function buildJourney(state: JourneyState): MeasureScreen[] {
  const m = state.opening;
  const tool = toolFor(m.method);
  const singleDoor = isSingleDoor(state);
  const runs = runPanelIndices(state.panels, state.junctions);
  const names = runNames(state);
  const walls = wallNames(state);
  const multi = runs.length > 1;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const screens: MeasureScreen[] = [];

  screens.push({ id: 'method', kind: 'method', title: 'How will you measure?', short: 'Method' });
  screens.push({ id: 'overview', kind: 'overview', title: 'Your shower, and what to measure', short: 'Your shower' });
  screens.push({ id: 'height', kind: 'height', title: 'How tall should the glass be?', short: 'Height' });

  if (hasTransom(state)) {
    screens.push({ id: 'transom', kind: 'transom', title: 'What goes above the door?', short: 'Above the door' });
  }

  if (singleDoor) {
    screens.push({
      id: 'cross-setup',
      kind: 'cross-setup',
      title: tool === 'laser' ? 'Set up the laser cross' : 'Draw a cross in the opening',
      short: 'The cross',
    });
    screens.push({ id: 'cross-left', kind: 'cross', group: 'left', points: [1, 2], title: 'Left wall: readings 1 and 2', short: 'Left wall' });
    screens.push({ id: 'cross-right', kind: 'cross', group: 'right', points: [3, 4], title: 'Right wall: readings 3 and 4', short: 'Right wall' });
    screens.push({ id: 'cross-floor', kind: 'cross', group: 'floor', points: [5, 6], title: 'Floor: readings 5 and 6', short: 'Floor' });
    if (state.isFloorToCeiling) {
      screens.push({ id: 'cross-ceiling', kind: 'cross', group: 'ceiling', points: [7, 8], title: 'Ceiling: readings 7 and 8', short: 'Ceiling' });
    }
  } else {
    runs.forEach((_, i) => {
      const openEnd = i === runs.length - 1 && !state.rightWall;
      const title = multi
        ? `How wide is ${names[i]}?`
        : openEnd
          ? 'How long should the glass be?'
          : 'How wide is the opening?';
      screens.push({
        id: `width-${i}`,
        kind: 'width',
        runIndex: i,
        title,
        short: multi ? `Width: ${names[i].replace(/^the /, '')}` : openEnd ? 'Length' : 'Width',
      });
    });

    // A tape has nothing to measure the top against unless both ends are
    // walls, which only a one-run alcove has. There the top width is the
    // customer's own early warning that a wall leans.
    if (tool === 'tape' && !multi && state.leftWall && state.rightWall) {
      screens.push({
        id: 'width-top-0',
        kind: 'width-top',
        runIndex: 0,
        title: 'How wide is it at the top?',
        short: 'Width at top',
      });
    }
  }

  // Walls. The laser cross already gives both for a single door.
  const wallShort = (name: string) =>
    name.includes('beside the door')
      ? 'Door wall'
      : name.includes('left end')
        ? 'Back wall, left'
        : name.includes('right end')
          ? 'Back wall, right'
          : cap(name.replace(/^the /, ''));
  if (!(singleDoor && tool === 'laser')) {
    if (walls.start) {
      screens.push({ id: 'wall-start', kind: 'wall', wall: 'start', title: `Is ${walls.start} straight up?`, short: wallShort(walls.start) });
    }
    if (walls.end) {
      screens.push({ id: 'wall-end', kind: 'wall', wall: 'end', title: `Is ${walls.end} straight up?`, short: wallShort(walls.end) });
    }
  }

  // Floor. Readings 5 and 6 of a laser cross are the floor readings.
  if (!(singleDoor && tool === 'laser')) {
    runs.forEach((_, i) => {
      screens.push({
        id: `floor-${i}`,
        kind: 'floor',
        runIndex: i,
        title: multi ? `Is the floor level along ${names[i]}?` : 'Is the floor level?',
        short: multi ? `Floor: ${names[i].replace(/^the /, '')}` : 'Floor',
      });
    });
  }

  if (ceilingScreensWanted(state)) {
    runs.forEach((_, i) => {
      screens.push({
        id: `ceiling-${i}`,
        kind: 'ceiling',
        runIndex: i,
        title: multi ? `How high is the ceiling along ${names[i]}?` : 'How high is the ceiling?',
        short: multi ? `Ceiling: ${names[i].replace(/^the /, '')}` : 'Ceiling',
      });
    });
  }

  if (state.leftWall || state.rightWall) {
    screens.push({ id: 'notches', kind: 'notches', title: 'Anything in the way at the bottom?', short: 'At the bottom' });
  }

  screens.push({ id: 'summary', kind: 'summary', title: 'Check your numbers', short: 'Check' });
  return screens;
}

export function measureScreenCount(state: JourneyState): number {
  return buildJourney(state).length;
}

// ---------------------------------------------------------------------------
// Which screen a check belongs to
// ---------------------------------------------------------------------------

/**
 * The screen on which a check becomes answerable.
 *
 * A check is only worth raising once the customer has seen the screen that
 * produces it: telling someone on the width screen that they have not said how
 * they checked the walls is noise about a question they have not been asked,
 * and noise is how a real contradiction gets scrolled past.
 */
export function screenIndexForCheck(
  check: Pick<MeasureCheck, 'code' | 'runIndex'>,
  screens: MeasureScreen[],
  state: JourneyState
): number {
  const { code, runIndex } = check;
  const at = (id: string) => screens.findIndex((s) => s.id === id);
  const first = (...ids: string[]) => {
    for (const id of ids) {
      const i = at(id);
      if (i >= 0) return i;
    }
    return -1;
  };
  const crossFor = (n: number) =>
    screens.findIndex((s) => s.kind === 'cross' && s.points[0] <= n && n <= s.points[1]);
  const last = screens.length - 1;
  const r = runIndex ?? 0;

  if (code === 'no-method') return at('method');
  if (code === 'shape-unconfirmed') return last;

  if (code.includes('cross-missing')) {
    const missing = state.opening.crossReadings
      ? crossMissing(state.opening.crossReadings, state.isFloorToCeiling)
      : [];
    const n = missing[0] ?? 1;
    const i = crossFor(n);
    return i >= 0 ? i : first('cross-setup');
  }

  if (code.includes('widthAtMiddleCheck') || code.includes('middle-bow')) {
    const i = first(`width-top-${r}`, `width-${r}`);
    return i >= 0 ? i : last;
  }
  if (code.includes('widthAtTopCheck') || code.includes('top-differs')) {
    const i = first(`width-top-${r}`, `width-${r}`);
    return i >= 0 ? i : last;
  }
  if (code.includes('cross-check-mismatch')) {
    const i = first('wall-end', 'wall-start', `width-top-${r}`, `width-${r}`);
    return i >= 0 ? i : last;
  }
  if (code.includes('widthAtFloor') || code.startsWith('walk-in')) {
    const i = first(`width-${r}`);
    if (i >= 0) return i;
    const c = crossFor(1);
    return c >= 0 ? c : last;
  }
  if (code.includes('floor-')) {
    const i = first(`floor-${r}`);
    if (i >= 0) return i;
    const c = crossFor(5);
    return c >= 0 ? c : last;
  }
  if (code.includes('ceiling-')) {
    const i = first(`ceiling-${r}`);
    if (i >= 0) return i;
    const c = crossFor(7);
    return c >= 0 ? c : at('height');
  }
  if (code.startsWith('startWall')) {
    const i = first('wall-start');
    if (i >= 0) return i;
    const c = crossFor(1);
    return c >= 0 ? c : last;
  }
  if (code.startsWith('endWall')) {
    const i = first('wall-end');
    if (i >= 0) return i;
    const c = crossFor(3);
    return c >= 0 ? c : last;
  }
  if (code === 'assumed-square') {
    const i = first('wall-start', 'wall-end', 'method');
    return i >= 0 ? i : last;
  }
  return last;
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

export interface SummaryRow {
  /** Where to send someone who taps Change. */
  screenId: string;
  label: string;
  value: string;
  /** 'missing' is a required number not yet given; 'optional' was offered and skipped. */
  status: 'done' | 'missing' | 'optional';
}

const mm = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v}mm`);

/** Every measurement, in the order it was asked for, for the last screen. */
export function journeySummary(state: JourneyState): SummaryRow[] {
  const m = state.opening;
  const tool = toolFor(m.method);
  const singleDoor = isSingleDoor(state);
  const names = runNames(state);
  const walls = wallNames(state);
  const ctx = openingContext(state);
  const multi = m.runs.length > 1;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const rows: SummaryRow[] = [];

  rows.push({
    screenId: 'method',
    label: 'Measured with',
    value:
      tool === 'laser'
        ? 'Laser level'
        : m.method === 'assumed-square'
          ? 'Tape measure, walls not checked'
          : tool === 'tape'
            ? 'Tape measure, walls checked with a level'
            : 'Not chosen yet',
    status: tool ? 'done' : 'missing',
  });

  if (state.isFloorToCeiling) {
    const gap = state.topGapMm ?? 30;
    rows.push({
      screenId: 'height',
      label: 'Glass height',
      value: singleDoor
        ? m.ceilingHeightMm
          ? `To the ceiling: ${m.ceilingHeightMm}mm at its lowest, door ${state.heightMm}mm with a ${gap}mm gap above`
          : `To the ceiling, with a ${gap}mm gap above the door`
        : `To the ceiling, ${state.heightMm}mm at the tallest point`,
      status: 'done',
    });
    if (hasTransom(state)) {
      rows.push({
        screenId: 'transom',
        label: 'Above the door',
        value: state.aboveDoor
          ? `${state.aboveDoor === 'glass' ? 'Glass panel' : 'Open gap'}, door ${state.doorHeightMm ?? 2000}mm tall`
          : 'Not chosen yet',
        status: state.aboveDoor ? 'done' : 'missing',
      });
    }
  } else {
    rows.push({ screenId: 'height', label: 'Glass height', value: `${state.heightMm}mm`, status: 'done' });
    rows.push({
      screenId: 'height',
      label: 'Above the glass',
      value:
        m.aboveGlass === 'ceiling'
          ? 'The ceiling comes down over the shower'
          : m.aboveGlass === 'clear'
            ? 'Nothing in the way'
            : 'Not checked',
      status: m.aboveGlass ? 'done' : 'optional',
    });
  }

  if (singleDoor) {
    const c = m.crossReadings;
    const needed = CROSS_POINTS.filter((p) => p.n <= 6 || state.isFloorToCeiling);
    for (const p of needed) {
      const v = c?.[p.key] ?? null;
      const screenId = p.n <= 2 ? 'cross-left' : p.n <= 4 ? 'cross-right' : p.n <= 6 ? 'cross-floor' : 'cross-ceiling';
      rows.push({
        screenId,
        label: `${p.n}. ${p.label}`,
        value: mm(v) ?? 'Not yet',
        status: v === null ? 'missing' : 'done',
      });
    }
    const run = m.runs[0];
    if (run) {
      rows.push({
        screenId: 'cross-left',
        label: 'Opening width',
        value: `${run.widthAtFloorMm}mm at the floor, ${topWidthMm(m, 0, ctx)}mm at the top`,
        status: 'done',
      });
    }
  } else {
    m.runs.forEach((run, i) => {
      const name = multi ? cap(names[i]) : 'Opening';
      const halves =
        measuredInHalves(run) && halvesTotalMm(run) !== null
          ? ` (${run.halfAMm} + ${run.halfBMm})`
          : '';
      rows.push({
        screenId: `width-${i}`,
        label: multi ? `${name}, along the floor` : 'Width along the floor',
        value: `${run.widthAtFloorMm}mm${halves}`,
        status: measuredInHalves(run) && halvesTotalMm(run) === null ? 'missing' : 'done',
      });
      if (tool === 'tape' && !multi && state.leftWall && state.rightWall) {
        const top = run.widthAtTopCheckMm ?? null;
        const mid = run.widthAtMiddleCheckMm ?? null;
        rows.push({
          screenId: 'width-top-0',
          label: 'Width at the top',
          value: top === null ? 'Not measured' : `${top}mm${mid !== null ? `, ${mid}mm at mid height` : ''}`,
          status: top === null ? 'optional' : 'done',
        });
      }
      if (!state.rightWall && m.runs.length === 1 && m.walkInOpeningMm) {
        const gap = walkInGapMm(m);
        rows.push({
          screenId: 'width-0',
          label: 'Walk-through gap',
          value: gap === null ? 'Not given' : `${gap}mm (tray ${m.walkInOpeningMm}mm wide)`,
          status: 'done',
        });
      }
    });
  }

  const describeWall = (wall: OpeningMeasurements['startWall']) => {
    const lean = wallLean(wall);
    if (!lean) return null;
    if (lean.leanMm === 0) return 'Straight up';
    return `${lean.leanMm}mm out, leaning ${lean.direction === 'in' ? 'into' : 'away from'} the shower at the top${lean.isBowed ? ', and bowed' : ''}`;
  };

  if (!(singleDoor && tool === 'laser')) {
    const unchecked = m.method === 'assumed-square';
    if (walls.start) {
      const d = describeWall(m.startWall);
      rows.push({
        screenId: 'wall-start',
        label: cap(walls.start),
        value: unchecked ? 'Not checked, cut square' : d ?? 'Not yet',
        status: unchecked ? 'optional' : wallMeasured(m.startWall) ? 'done' : 'missing',
      });
    }
    if (walls.end) {
      const d = describeWall(m.endWall);
      rows.push({
        screenId: 'wall-end',
        label: cap(walls.end),
        value: unchecked ? 'Not checked, cut square' : d ?? 'Not yet',
        status: unchecked ? 'optional' : wallMeasured(m.endWall) ? 'done' : 'missing',
      });
    }
    m.runs.forEach((run, i) => {
      const ends = runEndNames(state, i);
      const value = !floorMeasured(run)
        ? run.floorFallMm > 0 && run.floorLowEnd
          ? `${run.floorFallMm}mm lower at the ${run.floorLowEnd === 'start' ? ends.start : ends.end}`
          : 'Not yet'
        : run.floorFallMm === 0
          ? 'Level'
          : `${run.floorFallMm}mm lower at the ${run.floorLowEnd === 'start' ? ends.start : ends.end}`;
      rows.push({
        screenId: `floor-${i}`,
        label: multi ? `Floor along ${names[i]}` : 'Floor',
        value,
        status: floorMeasured(run) || (run.floorFallMm > 0 && !!run.floorLowEnd) ? 'done' : 'missing',
      });
    });
  } else if (m.runs[0]) {
    const run = m.runs[0];
    const left = describeWall(m.startWall);
    const right = describeWall(m.endWall);
    rows.push({ screenId: 'cross-left', label: 'Left wall', value: left ?? 'From readings 1 and 2', status: left ? 'done' : 'missing' });
    rows.push({ screenId: 'cross-right', label: 'Right wall', value: right ?? 'From readings 3 and 4', status: right ? 'done' : 'missing' });
    rows.push({
      screenId: 'cross-floor',
      label: 'Floor',
      value: floorMeasured(run)
        ? run.floorFallMm === 0
          ? 'Level'
          : `${run.floorFallMm}mm lower on the ${run.floorLowEnd === 'start' ? 'left' : 'right'}`
        : 'From readings 5 and 6',
      status: floorMeasured(run) ? 'done' : 'missing',
    });
  }

  if (ceilingScreensWanted(state)) {
    m.runs.forEach((run, i) => {
      const ends = runEndNames(state, i);
      const slope = ceilingSlope(run);
      rows.push({
        screenId: `ceiling-${i}`,
        label: multi ? `Ceiling along ${names[i]}` : 'Ceiling',
        value: !slope
          ? 'Not yet'
          : slope.dropMm === 0
            ? `${slope.highMm}mm, level`
            : `${slope.highMm}mm falling to ${slope.lowMm}mm at the ${slope.lowEnd === 'start' ? ends.start : ends.end}`,
        status: slope ? 'done' : 'missing',
      });
    });
  }

  const notched = state.panels.filter((p) => p.notches?.bottom_left || p.notches?.bottom_right);
  if (state.leftWall || state.rightWall) {
    rows.push({
      screenId: 'notches',
      label: 'At the bottom',
      value: notched.length
        ? notched
            .map((p) => `${p.notches!.width_mm} × ${p.notches!.height_mm}mm cut-out`)
            .join(', ')
        : 'Nothing in the way',
      status: 'done',
    });
  }

  if (tool === 'laser' && !singleDoor) {
    rows.push({
      screenId: 'wall-start',
      label: 'Laser set off each wall',
      value: `${m.laserOffsetMm ?? LASER_OFFSET_DEFAULT_MM}mm`,
      status: 'done',
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Moving on
// ---------------------------------------------------------------------------

/**
 * Whether Next is allowed off a given screen.
 *
 * Moving between screens is free: someone in a bathroom goes back and forth
 * as they realise a number needs checking again, and a wizard that fights
 * that gets abandoned. Two things are held: the method, because every screen
 * after it is written for the tool in their hand, and leaving the step, which
 * is gated on the checks because a contradiction walked past here becomes a
 * panel that does not fit.
 */
export function canLeaveScreen(state: JourneyState, index: number, checks: MeasureCheck[]): boolean {
  const screens = buildJourney(state);
  const screen = screens[Math.min(index, screens.length - 1)];
  if (!screen) return false;
  if (screen.kind === 'method') return state.opening.method !== null;
  if (screen.kind === 'summary') return !checks.some((c) => c.level === 'blocking');
  return true;
}
