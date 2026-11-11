/**
 * The survey, done by the customer.
 *
 * Nobody visits before cutting. The numbers typed into the designer are the
 * numbers the glass is made to, and toughened glass
 * cannot be trimmed afterwards — so a measurement that is 5mm out is a new
 * panel, not an adjustment.
 *
 * Two ideas run through this module, and both exist because the person
 * holding the tape is standing in their own bathroom and has never done this
 * before:
 *
 * 1. Never ask them to *judge* anything. "Is that wall plumb, and which way
 *    does it lean?" is a question people answer badly and confidently. Two
 *    tape readings against a vertical reference — the gap at the bottom and
 *    the gap at the top — give the same answer arithmetically, and the sign
 *    of the difference supplies the direction for free.
 *
 * 2. Derive whatever can be derived. The width at the top is the width at
 *    the bottom minus however far the walls lean in, so there is no reason to
 *    send someone up a ladder for a number we already know. It is offered as
 *    an optional check, not asked for as a measurement.
 *
 * ## Runs
 *
 * An enclosure is measured as one straight *run* per wall it follows: an
 * inline screen is one run, an L-shaped corner is two, a three-sided
 * enclosure is three. Each run gets its own widths and its own floor fall,
 * because a corner shower turns into a different room halfway along.
 *
 * Only the two ends of the whole chain meet walls. Every other end is a
 * glass-to-glass corner, and glass sets its own vertical there — so a middle
 * run's top width should equal its floor width.
 */

/**
 * [OURS] How far off the wall the laser line is set before taking readings.
 * The bottom reading should come back as this number; the top reading is what
 * tells us the lean. Installers can change it.
 */
export const LASER_OFFSET_DEFAULT_MM = 50;

/**
 * [OURS] A walk-in gap narrower than this still works, but is awkward to walk
 * through. A suggestion, never a reason to stop someone.
 */
export const WALK_IN_RECOMMENDED_MM = 650;

/** Which way the top of a wall leans, from the point of view of the shower. */
export type WallLeanDirection = 'in' | 'out';

/** Which end of a run the floor is lower at, walking along it. */
export type FloorLowEnd = 'start' | 'end';

/** How the customer established the lean. Changes how far we trust it. */
export type MeasureMethod = 'laser' | 'packers' | 'level' | 'assumed-square';

/**
 * A wall, measured as two gaps from a vertical reference — a laser line, a
 * plumb line, or the edge of a long level held true.
 *
 * Recorded as readings rather than as a lean because a reading is a thing the
 * customer can see on a tape. The lean, and which way it goes, fall out of
 * the arithmetic: nobody has to decide whether "into the shower" describes
 * what they are looking at.
 *
 * Null means not measured, which is different from zero and must not be
 * silently treated as plumb.
 */
export interface WallMeasurement {
  gapBottomMm: number | null;
  /**
   * Optional. A wall that leans is straight; a wall that bows is not, and the
   * middle reading is the only thing that tells them apart. A bow cannot be
   * followed by a single tapered cut, so it is worth knowing before cutting.
   */
  gapMiddleMm: number | null;
  gapTopMm: number | null;
}

export interface WallLean {
  /** Positive narrows the opening at the top. */
  signedMm: number;
  leanMm: number;
  direction: WallLeanDirection | null;
  /** How far the middle strays from a straight line between the two ends. */
  bowMm: number | null;
  isBowed: boolean;
}

/** Past this a wall is bowed rather than leaning, and needs a human to look. */
export const BOW_THRESHOLD_MM = 5;

/** Work out the lean, its direction and any bow. Null until both ends are in. */
export function wallLean(wall: WallMeasurement): WallLean | null {
  const { gapBottomMm: bottom, gapTopMm: top, gapMiddleMm: middle } = wall;
  if (bottom === null || top === null) return null;

  // A bigger gap at the top means the wall falls away from the reference up
  // there, so it leans out; a smaller one means it leans in and eats into the
  // opening. That is the sign the width arithmetic wants.
  const signedMm = Math.round(bottom - top);
  const bowMm =
    middle === null ? null : Math.round((middle - (top + bottom) / 2) * 10) / 10;

  return {
    signedMm,
    leanMm: Math.abs(signedMm),
    direction: signedMm === 0 ? null : signedMm > 0 ? 'in' : 'out',
    bowMm,
    isBowed: bowMm !== null && Math.abs(bowMm) > BOW_THRESHOLD_MM,
  };
}

export function createWallMeasurement(): WallMeasurement {
  return { gapBottomMm: null, gapMiddleMm: null, gapTopMm: null };
}

/** True once the customer has given us enough to work with. */
export function wallMeasured(wall: WallMeasurement): boolean {
  return wall.gapBottomMm !== null && wall.gapTopMm !== null;
}

export interface RunMeasurement {
  /** Wall (or corner) to wall (or corner), measured along the floor. */
  widthAtFloorMm: number;
  /**
   * The same width taken in two halves, to a laser line or a taped mark in
   * the middle. Two short tape pulls are more accurate than one long one, and
   * the customer never has to do the adding up: when both halves are in,
   * widthAtFloorMm is their sum. Optional so designs saved before this field
   * existed still load.
   */
  halfAMm?: number | null;
  halfBMm?: number | null;
  /**
   * Optional. The top width is derived from the floor width and the wall
   * leans, so this is only here for someone who measured it anyway and wants
   * it checked. When it is set, it has to agree.
   */
  widthAtTopCheckMm: number | null;
  /** Difference in floor height along this run. 0 = level. */
  floorFallMm: number;
  floorLowEnd: FloorLowEnd | null;
  /**
   * The floor at each end of the run, as two readings against a level
   * reference: down from a laser line, or the gap under a level resting on the
   * high end (where one reading is 0). The fall and which end is lower are
   * worked out from them, so nobody has to judge which way the tray slopes.
   * Optional so designs that carried the fall directly still load.
   */
  floorStartMm?: number | null;
  floorEndMm?: number | null;
  /**
   * Floor to ceiling at each end of the run, where the glass will stand. Asked
   * when the glass goes to the ceiling, or when the customer says the ceiling
   * comes down over the shower. Two readings give the slope and its direction;
   * the top edge is cut as one straight line between them, never stepped.
   */
  ceilingStartMm?: number | null;
  ceilingEndMm?: number | null;
  /** Optional. The width at mid height, for a tape user checking for a bow. */
  widthAtMiddleCheckMm?: number | null;
}

export interface OpeningMeasurements {
  /** One per straight run, in chain order. */
  runs: RunMeasurement[];
  /** The wall at the start of the first run. */
  startWall: WallMeasurement;
  /** The wall at the end of the last run. */
  endWall: WallMeasurement;
  method: MeasureMethod | null;
  /**
   * Single door between two walls: the eight raw readings to a centre cross.
   * Kept as read, because everything else is worked out from them.
   */
  crossReadings?: CrossReadings | null;
  /** Floor to ceiling, lowest side, from the cross readings. */
  ceilingHeightMm?: number | null;
  /** Where the laser was set off each wall. Optional for older saved designs. */
  laserOffsetMm?: number;
  /**
   * Walk-in screens only: the whole width of the tray or opening, wall to the
   * open end. With the glass length it gives the walk-through gap.
   */
  walkInOpeningMm?: number | null;
  /**
   * For glass that stops short of the ceiling: is anything in the way above
   * where it finishes? 'ceiling' means the ceiling comes down over the shower
   * and has been measured at each end. Null until asked.
   */
  aboveGlass?: 'clear' | 'ceiling' | null;
  /** Set once the customer has confirmed the drawn-back shape looks right. */
  shapeConfirmed: boolean;
}

/** What the shape of the enclosure tells us about the measurements. */
export interface OpeningContext {
  /** Does the first run terminate against a wall? */
  hasStartWall: boolean;
  /** Does the last run terminate against a wall? */
  hasEndWall: boolean;
  glassHeightMm: number;
  /** The glass goes up to the ceiling, so ceiling readings are needed. */
  toCeiling?: boolean;
  /**
   * What to call each run. Supplied by the caller because the right name
   * comes from the traced geometry, not from the order the panels happen to
   * be listed in.
   */
  labels?: string[];
  /**
   * The narrowest each run could plausibly be. A run of fixed glass alone can
   * be a short return panel; a run with a door in it cannot be that short.
   * Left out, every run is held to MIN_PLAUSIBLE_MM.
   */
  minWidthsMm?: number[];
}

function createRun(widthMm: number): RunMeasurement {
  return {
    widthAtFloorMm: widthMm,
    halfAMm: null,
    halfBMm: null,
    widthAtTopCheckMm: null,
    widthAtMiddleCheckMm: null,
    floorFallMm: 0,
    floorLowEnd: null,
    floorStartMm: null,
    floorEndMm: null,
    ceilingStartMm: null,
    ceilingEndMm: null,
  };
}

export function createOpeningMeasurements(runWidthsMm: number[] = [1000]): OpeningMeasurements {
  return {
    runs: runWidthsMm.map(createRun),
    startWall: createWallMeasurement(),
    endWall: createWallMeasurement(),
    method: null,
    laserOffsetMm: LASER_OFFSET_DEFAULT_MM,
    walkInOpeningMm: null,
    aboveGlass: null,
    shapeConfirmed: false,
  };
}

// ---------------------------------------------------------------------------
// Single door: eight readings to a centre cross
// ---------------------------------------------------------------------------

/**
 * A single door between two walls is measured to a cross in the middle of
 * the opening: a laser with both lines on, or a cross drawn on masking tape.
 *
 * Four readings go across to the up-and-down line (each wall, bottom and
 * top) and four go up and down to the level line (floor and ceiling, each
 * side). Opposite readings add up to the opening; readings on the same
 * surface, compared, give its rake. A tape cross is not plumb or level, so
 * with tape the sums still hold but the rakes come from a level and packers.
 * Readings 7 and 8 are only needed when the glass goes to the ceiling.
 */
export interface CrossReadings {
  leftBottomMm: number | null;
  leftTopMm: number | null;
  rightBottomMm: number | null;
  rightTopMm: number | null;
  floorLeftMm: number | null;
  floorRightMm: number | null;
  ceilingLeftMm: number | null;
  ceilingRightMm: number | null;
}

export type CrossKey = keyof CrossReadings;

/** The eight points, numbered in the order they are taken. */
export const CROSS_POINTS: { key: CrossKey; n: number; label: string }[] = [
  { key: 'leftBottomMm', n: 1, label: 'Left wall, at the bottom' },
  { key: 'leftTopMm', n: 2, label: 'Left wall, at the top' },
  { key: 'rightBottomMm', n: 3, label: 'Right wall, at the bottom' },
  { key: 'rightTopMm', n: 4, label: 'Right wall, at the top' },
  { key: 'floorLeftMm', n: 5, label: 'Floor, on the left' },
  { key: 'floorRightMm', n: 6, label: 'Floor, on the right' },
  { key: 'ceilingLeftMm', n: 7, label: 'Ceiling, on the left' },
  { key: 'ceilingRightMm', n: 8, label: 'Ceiling, on the right' },
];

export function createCrossReadings(): CrossReadings {
  return {
    leftBottomMm: null,
    leftTopMm: null,
    rightBottomMm: null,
    rightTopMm: null,
    floorLeftMm: null,
    floorRightMm: null,
    ceilingLeftMm: null,
    ceilingRightMm: null,
  };
}

const sum = (a: number | null, b: number | null) =>
  a === null || b === null ? null : Math.round(a + b);

/** Floor to ceiling on the lower side, or null until both sides are in. */
export function crossCeilingHeightMm(c: CrossReadings): number | null {
  const left = sum(c.floorLeftMm, c.ceilingLeftMm);
  const right = sum(c.floorRightMm, c.ceilingRightMm);
  if (left === null || right === null) return null;
  return Math.min(left, right);
}

/** Which of the points still needed are missing, by number. */
export function crossMissing(c: CrossReadings, toCeiling: boolean): number[] {
  const startedCeiling = c.ceilingLeftMm !== null || c.ceilingRightMm !== null;
  return CROSS_POINTS.filter(
    (p) => (p.n <= 6 || toCeiling || startedCeiling) && c[p.key] === null
  ).map((p) => p.n);
}

function crossStarted(c: CrossReadings | null | undefined): c is CrossReadings {
  return !!c && CROSS_POINTS.some((p) => c[p.key] !== null);
}

/**
 * Turn the eight readings into the measurements every other part of the
 * designer already uses, so both methods feed the same engine.
 *
 * Laser: walls and floor come straight from the readings, because the laser
 * lines are true. Tape: only the sums are used, and the top width goes in as
 * a cross-check against the walls the customer checks with a level.
 */
export function applyCrossReadings(m: OpeningMeasurements, c: CrossReadings): OpeningMeasurements {
  const laser = m.method === 'laser';
  const run = m.runs[0];
  const floorWidth = sum(c.leftBottomMm, c.rightBottomMm);
  const topWidth = sum(c.leftTopMm, c.rightTopMm);

  const next: OpeningMeasurements = {
    ...m,
    crossReadings: c,
    ceilingHeightMm: crossCeilingHeightMm(c),
    shapeConfirmed: false,
    runs: [
      {
        ...run,
        widthAtFloorMm: floorWidth ?? run.widthAtFloorMm,
        halfAMm: null,
        halfBMm: null,
        widthAtTopCheckMm: laser ? null : topWidth,
      },
      ...m.runs.slice(1),
    ],
  };

  // Floor to ceiling at each end is a vertical sum, which holds whether the
  // cross was a laser or a pen line on tape. It feeds the same ceiling slope
  // the other shapes get from two tape readings.
  next.runs[0] = {
    ...next.runs[0],
    ceilingStartMm: sum(c.floorLeftMm, c.ceilingLeftMm),
    ceilingEndMm: sum(c.floorRightMm, c.ceilingRightMm),
  };

  if (laser) {
    next.startWall = { gapBottomMm: c.leftBottomMm, gapMiddleMm: null, gapTopMm: c.leftTopMm };
    next.endWall = { gapBottomMm: c.rightBottomMm, gapMiddleMm: null, gapTopMm: c.rightTopMm };
    if (c.floorLeftMm !== null && c.floorRightMm !== null) {
      // Readings 5 and 6 are the floor readings every other shape takes
      // directly: down from a level line at each end.
      next.runs[0] = applyFloorReadings(next.runs[0], c.floorLeftMm, c.floorRightMm);
    }
  }
  return next;
}

/**
 * The walk-through gap beside a walk-in screen: the whole opening less the
 * glass. Null until the customer has given the whole opening.
 */
export function walkInGapMm(m: OpeningMeasurements): number | null {
  const opening = m.walkInOpeningMm ?? null;
  if (opening === null || m.runs.length !== 1) return null;
  return Math.round(opening - m.runs[0].widthAtFloorMm);
}

/**
 * Fill in anything a saved design predates, so a design put down last week
 * loads into today's model without every reader having to guard for it.
 */
export function hydrateOpening(
  saved: Partial<OpeningMeasurements> | null | undefined,
  runWidthsMm: number[]
): OpeningMeasurements {
  const fresh = createOpeningMeasurements(runWidthsMm);
  if (!saved) return fresh;
  return {
    ...fresh,
    ...saved,
    runs: fresh.runs.map((run, i) => ({ ...run, ...(saved.runs?.[i] ?? {}) })),
    startWall: { ...fresh.startWall, ...(saved.startWall ?? {}) },
    endWall: { ...fresh.endWall, ...(saved.endWall ?? {}) },
  };
}

/**
 * Carry the customer's set-up answers across a change of shape. Picking a
 * different template resets the measurements, but not whether they own a
 * laser.
 */
export function keepSetup(
  from: OpeningMeasurements,
  to: OpeningMeasurements
): OpeningMeasurements {
  return { ...to, method: from.method, laserOffsetMm: from.laserOffsetMm ?? LASER_OFFSET_DEFAULT_MM };
}

/**
 * Keep the runs in step with the shape.
 *
 * Changing the template, adding a panel or turning a junction into a corner
 * all change how many runs there are. Measurements already taken for a run
 * are kept by position — the alternative is silently discarding what the
 * customer walked to the bathroom to collect.
 */
export function syncRuns(
  m: OpeningMeasurements,
  runWidthsMm: number[]
): OpeningMeasurements {
  if (runWidthsMm.length === m.runs.length) return m;
  return {
    ...m,
    runs: runWidthsMm.map((widthMm, i) => m.runs[i] ?? createRun(widthMm)),
    // The shape has changed under them, so the confirmation no longer refers
    // to what they are now looking at.
    shapeConfirmed: false,
  };
}

/**
 * The width from its two halves, or null until both are in.
 *
 * Zero is a real reading here (a line set right against one end), so only a
 * missing half counts as missing.
 */
export function halvesTotalMm(run: RunMeasurement): number | null {
  const a = run.halfAMm ?? null;
  const b = run.halfBMm ?? null;
  if (a === null || b === null) return null;
  return Math.round(a + b);
}

/** True when the customer has started the two-halves method on this run. */
export function measuredInHalves(run: RunMeasurement): boolean {
  return (run.halfAMm ?? null) !== null || (run.halfBMm ?? null) !== null;
}

/** Names a customer would use for each run, given how many there are. */
export function runLabels(count: number): string[] {
  if (count <= 1) return ['The opening'];
  if (count === 2) return ['Front', 'Return'];
  if (count === 3) return ['Left return', 'Front', 'Right return'];
  return Array.from({ length: count }, (_, i) => `Run ${i + 1}`);
}

/**
 * A wall's lean as a signed number, positive when it eats into the opening.
 *
 * A wall leaning *in* at the top makes the opening narrower at the top, so it
 * subtracts from the top width. Leaning *out* widens it. Getting this sign
 * wrong puts a panel out by twice the lean rather than by nothing, which is
 * why direction is a required answer rather than an optional refinement.
 */
export function signedLeanMm(wall: WallMeasurement): number {
  return wallLean(wall)?.signedMm ?? 0;
}

/** Which walls, if any, bound a given run. Corners are not walls. */
export function wallsForRun(
  m: OpeningMeasurements,
  runIndex: number,
  ctx: OpeningContext
): WallMeasurement[] {
  const walls: WallMeasurement[] = [];
  if (runIndex === 0 && ctx.hasStartWall) walls.push(m.startWall);
  if (runIndex === m.runs.length - 1 && ctx.hasEndWall) walls.push(m.endWall);
  return walls;
}

/**
 * The width at the top of the glass.
 *
 * Derived, not measured: it is the floor width less however far each bounding
 * wall leans into the opening. A run between two corners has no wall to lean,
 * so it comes out the same at both ends.
 */
export function topWidthMm(
  m: OpeningMeasurements,
  runIndex: number,
  ctx: OpeningContext
): number {
  const run = m.runs[runIndex];
  if (!run) return 0;
  return Math.round(
    run.widthAtFloorMm -
      wallsForRun(m, runIndex, ctx).reduce((sum, w) => sum + signedLeanMm(w), 0)
  );
}

export type CheckLevel = 'blocking' | 'confirm' | 'hint';

export interface MeasureCheck {
  code: string;
  level: CheckLevel;
  /** Addressed to the customer, in their words, saying what to do about it. */
  message: string;
  /** Which run the check is about, where it is about one. */
  runIndex?: number;
  /** A corrected value they can accept with one tap. */
  suggestionMm?: number;
}

/** Anything outside this is a typo or the wrong units, not a bathroom. */
export const MIN_PLAUSIBLE_MM = 400;
const MAX_PLAUSIBLE_MM = 3000;

/**
 * A run with no door in it can be a short return panel, which is commonly
 * 200 to 400mm. Holding it to the floor for an opening refused a 300mm return
 * as "300 looks like centimetres", which stopped a real shower being sent.
 */
export const MIN_PLAUSIBLE_RETURN_MM = 100;

/** Ceilings run taller than openings run wide; a Victorian room clears 3000. */
const MIN_CEILING_MM = 1500;
const MAX_CEILING_MM = 4000;

/** A gap to a laser line or a level. Bigger than this and something is wrong. */
const MAX_GAP_MM = 300;

/**
 * How far an optional top-width check may disagree with the derived figure.
 *
 * 3mm is roughly the best a careful amateur does with a tape over a metre,
 * and it is also small enough that a panel cut to it still fits. Beyond that
 * the readings are telling us something real.
 */
const CROSS_CHECK_TOLERANCE_MM = 3;

/**
 * An out-of-plumb wall past this is unusual enough to be worth a second look.
 * Real bathrooms do manage it, so this asks rather than blocks.
 */
const LARGE_LEAN_MM = 20;

/** How far a laser bottom reading may stray from where the laser was set. */
const LASER_REFERENCE_TOLERANCE_MM = 10;

/**
 * Catch the slip where someone types the right number in the wrong unit.
 *
 * 90 for 900 and 0.9 for 900 are the two that actually reach workshops, and
 * neither is caught by "is it a positive number". Offering the corrected
 * figure to accept with one tap beats telling someone they are wrong.
 */
function unitSlip(
  value: number,
  name: string,
  minMm: number = MIN_PLAUSIBLE_MM,
  maxMm: number = MAX_PLAUSIBLE_MM
): MeasureCheck | null {
  if (value >= minMm) return null;

  const fromMetres = Math.round(value * 1000);
  const fromCm = Math.round(value * 10);

  if (value > 0 && value < 10 && fromMetres <= maxMm && fromMetres >= minMm) {
    return {
      code: 'unit-metres',
      level: 'blocking',
      message: `${value} looks like metres. Did you mean ${fromMetres}mm for the ${name}?`,
      suggestionMm: fromMetres,
    };
  }
  if (fromCm >= minMm && fromCm <= maxMm) {
    return {
      code: 'unit-centimetres',
      level: 'blocking',
      message: `${value} looks like centimetres. Did you mean ${fromCm}mm for the ${name}?`,
      suggestionMm: fromCm,
    };
  }
  return null;
}

export function checkMeasurements(
  m: OpeningMeasurements,
  ctx: OpeningContext
): MeasureCheck[] {
  const checks: MeasureCheck[] = [];
  const labels = ctx.labels ?? runLabels(m.runs.length);
  const named = (i: number) => (m.runs.length > 1 ? `${labels[i].toLowerCase()} ` : '');

  // --- The eight readings, if this door is measured to a cross. ---
  if (crossStarted(m.crossReadings)) {
    const missing = crossMissing(m.crossReadings, ctx.toCeiling ?? false);
    if (missing.length) {
      checks.push({
        code: 'run0-widthAtFloor-cross-missing',
        level: 'blocking',
        runIndex: 0,
        message: `We still need reading${missing.length > 1 ? 's' : ''} ${missing.join(', ')} on the cross.`,
      });
      return checks;
    }
  }

  // --- Floor widths, before anything is derived from them. ---
  m.runs.forEach((run, i) => {
    const name = `${named(i)}width at the floor`;
    const value = run.widthAtFloorMm;

    // Half a two-halves reading is not a width. Without this the template's
    // default width would quietly stand in for the half they never measured.
    if (measuredInHalves(run) && halvesTotalMm(run) === null) {
      checks.push({
        code: `run${i}-widthAtFloor-half-missing`,
        level: 'blocking',
        message: `We still need the other half of the ${name}. Measure from the line to the other end too, and we will add the two together.`,
        runIndex: i,
      });
      return;
    }

    if (!value) {
      checks.push({
        code: `run${i}-widthAtFloor-missing`,
        level: 'blocking',
        message: `We still need the ${name}.`,
        runIndex: i,
      });
      return;
    }

    const min = ctx.minWidthsMm?.[i] ?? MIN_PLAUSIBLE_MM;
    const slip = unitSlip(value, name, min);
    if (slip) {
      checks.push({ ...slip, code: `run${i}-widthAtFloor-${slip.code}`, runIndex: i });
      return;
    }

    if (value < min || value > MAX_PLAUSIBLE_MM) {
      checks.push({
        code: `run${i}-widthAtFloor-implausible`,
        level: 'blocking',
        message: `${value}mm for the ${name} looks wrong — we need millimetres, so a 1.4 metre opening is 1400. Please check and re-measure.`,
        runIndex: i,
      });
    }
  });

  // Nothing below this point means anything if the widths are nonsense.
  if (checks.some((c) => c.level === 'blocking')) return checks;

  // --- The walls, as two readings each. ---
  const walls: [string, WallMeasurement, string][] = [];
  if (ctx.hasStartWall) walls.push(['startWall', m.startWall, 'first wall']);
  if (ctx.hasEndWall) walls.push(['endWall', m.endWall, 'far wall']);

  const checkedWalls = m.method !== null && m.method !== 'assumed-square';
  // Readings to a centre cross are half the opening, not a small gap.
  const toCross = crossStarted(m.crossReadings);

  for (const [key, wall, name] of walls) {
    for (const [field, value, where] of [
      ['gapBottomMm', wall.gapBottomMm, 'bottom'],
      ['gapMiddleMm', wall.gapMiddleMm, 'middle'],
      ['gapTopMm', wall.gapTopMm, 'top'],
    ] as const) {
      if (value === null) continue;
      if (value < 0) {
        checks.push({
          code: `${key}-${field}-negative`,
          level: 'blocking',
          message: `The gap at the ${where} of the ${name} cannot be less than zero.`,
        });
      } else if (value > MAX_GAP_MM && !toCross) {
        checks.push({
          code: `${key}-${field}-too-big`,
          level: 'confirm',
          message: `${value}mm is a big gap at the ${where} of the ${name}. Check you measured from the line or the level to the wall, and not something else.`,
        });
      }
    }

    if (checkedWalls && !wallMeasured(wall)) {
      checks.push({
        code: `${key}-not-measured`,
        level: 'blocking',
        message: `We need the gap at the bottom and at the top of the ${name}. If it is dead plumb, both readings will be the same — enter them anyway so we know it was checked.`,
      });
      continue;
    }

    // With a laser the bottom reading is the distance it was set off the wall,
    // so a big difference means a reading was taken from something else.
    const offset = m.laserOffsetMm ?? LASER_OFFSET_DEFAULT_MM;
    if (
      m.method === 'laser' &&
      !toCross &&
      wall.gapBottomMm !== null &&
      Math.abs(wall.gapBottomMm - offset) > LASER_REFERENCE_TOLERANCE_MM
    ) {
      checks.push({
        code: `${key}-laser-reference`,
        level: 'confirm',
        message: `You set the laser ${offset}mm off the ${name}, but the reading at the bottom is ${wall.gapBottomMm}mm. Those should be close. Check where the laser is, or change the distance you set it at.`,
      });
    }

    const lean = wallLean(wall);
    if (!lean) continue;

    if (lean.leanMm > LARGE_LEAN_MM) {
      checks.push({
        code: `${key}-large-lean`,
        level: 'confirm',
        message: `Those readings make the ${name} ${lean.leanMm}mm out of plumb over ${ctx.glassHeightMm}mm, leaning ${lean.direction}. It does happen — but please double-check them, because we will cut the glass to follow it.`,
      });
    }

    if (lean.isBowed) {
      checks.push({
        code: `${key}-bowed`,
        level: 'confirm',
        message: `The middle reading on the ${name} is ${Math.abs(lean.bowMm ?? 0)}mm off a straight line between the top and the bottom, so the wall bows rather than leans. Glass is cut straight and cannot follow a curve — please check the reading, and send us a photo of that wall so we can see what we are dealing with.`,
      });
    }
  }

  // --- The optional top-width check. ---
  m.runs.forEach((run, i) => {
    if (run.widthAtTopCheckMm === null) return;

    const slip = unitSlip(run.widthAtTopCheckMm, `${named(i)}width at the top`);
    if (slip) {
      checks.push({ ...slip, code: `run${i}-widthAtTopCheck-${slip.code}`, runIndex: i });
      return;
    }

    const derived = topWidthMm(m, i, ctx);
    const discrepancy = Math.round(run.widthAtTopCheckMm - derived);
    const where = m.runs.length > 1 ? ` on the ${labels[i].toLowerCase()}` : '';
    const bounding = wallsForRun(m, i, ctx);

    // Until the walls are measured the derived top is just the floor width,
    // so a difference here is information rather than a contradiction: it
    // says a wall leans. A tape user measures the top before the walls, and
    // this is what tells them the wall checks are worth doing. Someone who
    // cannot check the walls is told what the difference means instead.
    if (bounding.length > 0 && bounding.some((w) => !wallMeasured(w))) {
      const diff = Math.round(run.widthAtTopCheckMm - run.widthAtFloorMm);
      if (Math.abs(diff) <= CROSS_CHECK_TOLERANCE_MM) return;
      const sense = diff < 0 ? 'narrower' : 'wider';
      checks.push(
        m.method === 'assumed-square'
          ? {
              code: `run${i}-top-differs-unchecked`,
              level: 'confirm',
              runIndex: i,
              message:
                `The opening${where} is ${Math.abs(diff)}mm ${sense} at the top than at the floor, ` +
                `so at least one wall leans — but you have not checked which. We would cut the glass ` +
                `square and the gap would show at one end. If you can borrow a level, it is worth doing.`,
            }
          : {
              code: `run${i}-top-differs`,
              level: 'hint',
              runIndex: i,
              message:
                `The opening${where} is ${Math.abs(diff)}mm ${sense} at the top than at the floor, ` +
                `so at least one wall leans. The wall checks find which one, and by how much.`,
            }
      );
      return;
    }

    if (Math.abs(discrepancy) <= CROSS_CHECK_TOLERANCE_MM) return;

    checks.push({
      code: `run${i}-cross-check-mismatch`,
      level: 'blocking',
      runIndex: i,
      message: bounding.length
        ? `Your readings do not agree with each other${where}. From the floor width and the wall ` +
          `readings, the top should measure ${derived}mm — but you measured ${run.widthAtTopCheckMm}mm, ` +
          `about ${Math.abs(discrepancy)}mm out. Either the width at the top or one of the wall ` +
          `readings is wrong. This is exactly the kind of mistake that ends up as a panel that ` +
          `does not fit.`
        : `The measurements${where} do not agree. Both ends of this run meet glass rather than a ` +
          `wall, so it should be the same width top and bottom — but you have given ` +
          `${run.widthAtFloorMm}mm and ${run.widthAtTopCheckMm}mm. Please re-measure both.`,
    });
  });

  // --- Did they actually check, or assume? ---
  if (!m.method) {
    checks.push({
      code: 'no-method',
      level: 'blocking',
      message: 'Please tell us how you checked the walls and floor.',
    });
  }

  if (m.method === 'assumed-square') {
    checks.push({
      code: 'assumed-square',
      level: 'confirm',
      message:
        'You have not checked whether the walls are plumb, so we will cut the glass square. ' +
        'Most bathrooms are out by a few millimetres somewhere, and where they are, the gap ' +
        'will be wider at one end than the other. If you can borrow a level, it is worth ten ' +
        'minutes now.',
    });
  }

  // --- Width at mid height, if a tape user took it. ---
  m.runs.forEach((run, i) => {
    const mid = run.widthAtMiddleCheckMm ?? null;
    if (mid === null) return;
    const name = `${named(i)}width at mid height`;
    const slip = unitSlip(mid, name);
    if (slip) {
      checks.push({ ...slip, code: `run${i}-widthAtMiddleCheck-${slip.code}`, runIndex: i });
      return;
    }
    // Straight walls put the middle halfway between the floor and the top,
    // whether the top was measured or worked out.
    const top = run.widthAtTopCheckMm ?? topWidthMm(m, i, ctx);
    const expected = Math.round((run.widthAtFloorMm + top) / 2);
    const off = Math.round(mid - expected);
    if (Math.abs(off) <= BOW_THRESHOLD_MM) return;
    const where = m.runs.length > 1 ? ` on the ${labels[i].toLowerCase()}` : '';
    checks.push({
      code: `run${i}-middle-bow`,
      level: 'confirm',
      runIndex: i,
      message:
        `At mid height you measured ${mid}mm${where}, but with straight walls it would be about ` +
        `${expected}mm there (between ${run.widthAtFloorMm}mm at the floor and ${top}mm at the top). ` +
        `That points to a wall that bows. Glass is cut straight and cannot follow a curve, so please ` +
        `check the reading and send us a photo of the walls.`,
    });
  });

  // --- Floor, per run. ---
  m.runs.forEach((run, i) => {
    const where = m.runs.length > 1 ? ` along the ${labels[i].toLowerCase()}` : '';
    if (floorStarted(run) && !floorMeasured(run)) {
      checks.push({
        code: `run${i}-floor-half-missing`,
        level: 'blocking',
        runIndex: i,
        message: `We have the floor reading at one end${where} but not the other. Take it at both ends and we work out the fall and which way it goes.`,
      });
      return;
    }
    if (run.floorFallMm > 0 && !run.floorLowEnd) {
      checks.push({
        code: `run${i}-floor-no-direction`,
        level: 'blocking',
        runIndex: i,
        message: `You have told us the floor${where} is ${run.floorFallMm}mm out of level, but not which end is lower.`,
      });
    }
    if (run.floorFallMm > LARGE_LEAN_MM) {
      checks.push({
        code: `run${i}-floor-large-fall`,
        level: 'confirm',
        runIndex: i,
        message: `A ${run.floorFallMm}mm fall${where} is a lot. Please double-check it — if it is right, the bottom of the glass will be cut on the slope to match.`,
      });
    }
  });

  // --- Ceiling, per run: two heights, one straight line between them. ---
  const toCeiling = ctx.toCeiling ?? false;
  const ceilingAsked = toCeiling || m.aboveGlass === 'ceiling';
  m.runs.forEach((run, i) => {
    const where = m.runs.length > 1 ? ` along the ${labels[i].toLowerCase()}` : '';
    if (!ceilingStarted(run)) {
      // Glass to the ceiling is cut to the ceiling, so the ceiling has to have
      // been measured. A single door gets it from readings 7 and 8 instead.
      if (toCeiling && !crossStarted(m.crossReadings)) {
        checks.push({
          code: `run${i}-ceiling-missing`,
          level: 'blocking',
          runIndex: i,
          message: `The glass goes to the ceiling, so we need the floor-to-ceiling height at each end${where}.`,
        });
      }
      return;
    }
    if (!ceilingMeasured(run)) {
      checks.push({
        code: `run${i}-ceiling-half-missing`,
        level: 'blocking',
        runIndex: i,
        message: `We have the ceiling height at one end${where} but not the other. Measure both ends — together they tell us whether the ceiling slopes.`,
      });
      return;
    }
    for (const [end, value] of [
      ['start', run.ceilingStartMm as number],
      ['end', run.ceilingEndMm as number],
    ] as const) {
      const name = `ceiling height at the ${end} end${where}`;
      const slip = unitSlip(value, name, MIN_CEILING_MM, MAX_CEILING_MM);
      if (slip) {
        checks.push({ ...slip, code: `run${i}-ceiling-${end}-${slip.code}`, runIndex: i });
        return;
      }
      if (value < MIN_CEILING_MM || value > MAX_CEILING_MM) {
        checks.push({
          code: `run${i}-ceiling-${end}-implausible`,
          level: 'blocking',
          runIndex: i,
          message: `${value}mm for the ${name} looks wrong — we need millimetres, so a 2.4 metre ceiling is 2400. Please check and re-measure.`,
        });
        return;
      }
    }
    const slope = ceilingSlope(run);
    if (!slope) return;
    if (slope.dropMm > LARGE_LEAN_MM) {
      checks.push({
        code: `run${i}-ceiling-large-slope`,
        level: 'confirm',
        runIndex: i,
        message: `The ceiling${where} is ${slope.dropMm}mm lower at the ${slope.lowEnd} end (${slope.highMm}mm down to ${slope.lowMm}mm). It happens, especially under a roof — please double-check both readings, because the top of the glass will be cut on that slope to match.`,
      });
    }
    if (!toCeiling && ceilingAsked && slope.lowMm <= ctx.glassHeightMm) {
      const at = slope.lowEnd ? `At the ${slope.lowEnd} end the ceiling is` : 'The ceiling is';
      checks.push({
        code: `run${i}-ceiling-below-glass`,
        level: 'confirm',
        runIndex: i,
        message: `${at} ${slope.lowMm}mm, which is not above the ${ctx.glassHeightMm}mm glass. Either choose a lower glass height, or take the glass to the ceiling and we cut the top to follow it.`,
      });
    }
  });

  // --- Walk-in gap. Asked about, never blocked on, unless it is impossible. ---
  const gap = walkInGapMm(m);
  if (gap !== null && gap <= 0) {
    checks.push({
      code: 'walk-in-no-gap',
      level: 'confirm',
      message: `The glass is ${m.runs[0].widthAtFloorMm}mm long but the whole opening is ${m.walkInOpeningMm}mm, which leaves no gap to walk through. Please check both numbers.`,
    });
  } else if (gap !== null && gap < WALK_IN_RECOMMENDED_MM) {
    checks.push({
      code: 'walk-in-narrow',
      level: 'hint',
      message: `That leaves a ${gap}mm gap to walk through. About ${WALK_IN_RECOMMENDED_MM}mm is easier, but you can go narrower if it suits your room.`,
    });
  }

  // --- The last gate. ---
  if (!m.shapeConfirmed && !checks.some((c) => c.level === 'blocking')) {
    checks.push({
      code: 'shape-unconfirmed',
      level: 'blocking',
      message: 'Please have a look at the drawing of your opening and confirm it matches.',
    });
  }

  return checks;
}

/** True when nothing is stopping the customer from carrying on. */
export function measurementsUsable(checks: MeasureCheck[]): boolean {
  return !checks.some((c) => c.level === 'blocking');
}

/**
 * A plain-English summary of how true the opening is, for the review screen
 * and the enquiry email.
 */
export function describeOpening(m: OpeningMeasurements, ctx: OpeningContext): string {
  const parts: string[] = [];
  const labels = ctx.labels ?? runLabels(m.runs.length);

  for (const [wall, name, present] of [
    [m.startWall, 'first wall', ctx.hasStartWall],
    [m.endWall, 'far wall', ctx.hasEndWall],
  ] as const) {
    if (!present) continue;
    const lean = wallLean(wall);
    if (!lean) continue;
    if (lean.leanMm > 0) {
      parts.push(
        `${name} ${lean.leanMm}mm out of plumb, leaning ${lean.direction} ` +
          `(gap ${wall.gapBottomMm}mm at the bottom, ${wall.gapTopMm}mm at the top)`
      );
    }
    if (lean.isBowed) parts.push(`${name} bows ${Math.abs(lean.bowMm ?? 0)}mm at mid height`);
  }

  m.runs.forEach((run, i) => {
    const where = m.runs.length > 1 ? ` along the ${labels[i].toLowerCase()}` : '';
    if (run.floorFallMm && run.floorLowEnd) {
      const readings = floorMeasured(run)
        ? ` (readings ${run.floorStartMm} and ${run.floorEndMm})`
        : '';
      parts.push(`floor${where} ${run.floorFallMm}mm lower at the ${run.floorLowEnd}${readings}`);
    }
    // The single door's ceiling is reported from its cross below.
    const slope = i === 0 && crossStarted(m.crossReadings) ? null : ceilingSlope(run);
    if (slope && slope.dropMm > 0) {
      parts.push(
        `ceiling${where} ${slope.highMm}mm at the ${slope.lowEnd === 'start' ? 'end' : 'start'} ` +
          `falling to ${slope.lowMm}mm at the ${slope.lowEnd} (${slope.dropMm}mm slope, top edge cut straight between them)`
      );
    }
  });

  const gap = walkInGapMm(m);
  if (gap !== null) parts.push(`walk-in gap ${gap}mm (whole opening ${m.walkInOpeningMm}mm)`);

  const c = m.crossReadings;
  if (c && m.ceilingHeightMm) {
    parts.push(
      `ceiling ${sum(c.floorLeftMm, c.ceilingLeftMm)}mm on the left and ${sum(c.floorRightMm, c.ceilingRightMm)}mm on the right`
    );
  }

  if (parts.length === 0) return 'Square and level throughout.';
  return parts.join('; ');
}

/**
 * The widths, run by run, for the email. The floor figure is measured; the
 * top is worked out from it and the wall readings, and is labelled as such so
 * nobody takes it for a second reading.
 */
export function describeWidths(
  m: OpeningMeasurements,
  ctx: OpeningContext,
  labels = ctx.labels ?? runLabels(m.runs.length)
): string {
  return m.runs
    .map((run, i) => {
      const top = topWidthMm(m, i, ctx);
      const checked =
        run.widthAtTopCheckMm !== null ? `, customer also measured ${run.widthAtTopCheckMm}mm` : '';
      const c = i === 0 && crossStarted(m.crossReadings) ? m.crossReadings : null;
      const halves = c
        ? ` (to a centre cross: ${c.leftBottomMm} + ${c.rightBottomMm} at the bottom, ${c.leftTopMm} + ${c.rightTopMm} at the top)`
        : halvesTotalMm(run) !== null
          ? ` (in two halves: ${run.halfAMm} + ${run.halfBMm})`
          : '';
      return `${labels[i]}: ${run.widthAtFloorMm}mm measured at the floor${halves}, ${top}mm derived at the top${checked}`;
    })
    .join('; ');
}

/**
 * How the lean was established, written out for the workshop.
 *
 * Worth carrying into the email: a lean found with a laser is a different
 * quality of information from one someone eyeballed, and the person cutting
 * the glass should know which they are working from.
 */
export const METHOD_LABELS: Record<MeasureMethod, string> = {
  laser: 'Laser plumb line',
  packers: 'Spirit level and glazing packers',
  level: 'Spirit level',
  'assumed-square': 'Not checked — cut square',
};

// ---------------------------------------------------------------------------
// Floor and ceiling as two readings each
// ---------------------------------------------------------------------------

/**
 * Fall and low end from two floor readings, or null until both are in.
 *
 * The larger reading is the lower end: further down from a level laser line,
 * or a bigger gap under a level resting on the high end. Zero is a real
 * reading (the end the level touches), so only a missing reading is missing.
 */
export function floorFromReadings(
  start: number | null | undefined,
  end: number | null | undefined
): { fallMm: number; lowEnd: FloorLowEnd | null } | null {
  const a = start ?? null;
  const b = end ?? null;
  if (a === null || b === null) return null;
  const diff = Math.round(a - b);
  return { fallMm: Math.abs(diff), lowEnd: diff === 0 ? null : diff > 0 ? 'start' : 'end' };
}

/** The run with new floor readings, and the fall worked out from them. */
export function applyFloorReadings(
  run: RunMeasurement,
  start: number | null,
  end: number | null
): RunMeasurement {
  const derived = floorFromReadings(start, end);
  return {
    ...run,
    floorStartMm: start,
    floorEndMm: end,
    floorFallMm: derived?.fallMm ?? 0,
    floorLowEnd: derived?.lowEnd ?? null,
  };
}

export function floorStarted(run: RunMeasurement): boolean {
  return (run.floorStartMm ?? null) !== null || (run.floorEndMm ?? null) !== null;
}

export function floorMeasured(run: RunMeasurement): boolean {
  return (run.floorStartMm ?? null) !== null && (run.floorEndMm ?? null) !== null;
}

export interface CeilingSlope {
  /** How much lower the low end is. 0 = level. */
  dropMm: number;
  lowEnd: FloorLowEnd | null;
  highMm: number;
  lowMm: number;
}

/** The ceiling along a run from its two end heights, or null until both are in. */
export function ceilingSlope(run: RunMeasurement): CeilingSlope | null {
  const a = run.ceilingStartMm ?? null;
  const b = run.ceilingEndMm ?? null;
  if (a === null || b === null) return null;
  const diff = Math.round(a - b);
  return {
    dropMm: Math.abs(diff),
    lowEnd: diff === 0 ? null : diff > 0 ? 'end' : 'start',
    highMm: Math.max(a, b),
    lowMm: Math.min(a, b),
  };
}

export function ceilingStarted(run: RunMeasurement): boolean {
  return (run.ceilingStartMm ?? null) !== null || (run.ceilingEndMm ?? null) !== null;
}

export function ceilingMeasured(run: RunMeasurement): boolean {
  return (run.ceilingStartMm ?? null) !== null && (run.ceilingEndMm ?? null) !== null;
}

/**
 * The glass height for an enclosure that goes to the ceiling: the tallest
 * reading anywhere, because the cut size is the bounding rectangle and the
 * lower end becomes a raked top edge. Null until a ceiling has been measured.
 * (A single door is different — it stops short of the lowest point by its air
 * gap; see crossCeilingHeightMm.)
 */
export function ceilingGlassHeightMm(m: OpeningMeasurements): number | null {
  const heights = m.runs
    .flatMap((run) => [run.ceilingStartMm ?? null, run.ceilingEndMm ?? null])
    .filter((h): h is number => h !== null);
  return heights.length ? Math.max(...heights) : null;
}

/** The lowest point of the ceiling over the glass line, for checking a fixed height clears it. */
export function ceilingLowestMm(m: OpeningMeasurements): number | null {
  const heights = m.runs
    .flatMap((run) => [run.ceilingStartMm ?? null, run.ceilingEndMm ?? null])
    .filter((h): h is number => h !== null);
  return heights.length ? Math.min(...heights) : null;
}

/** The tool behind a method: the laser route or the tape route. */
export type MeasureTool = 'laser' | 'tape';

export function toolFor(method: MeasureMethod | null | undefined): MeasureTool | null {
  if (!method) return null;
  return method === 'laser' ? 'laser' : 'tape';
}
