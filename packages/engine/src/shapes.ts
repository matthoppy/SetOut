/**
 * The shape each pane is cut to, following the opening as the customer
 * measured it.
 *
 * Matt's rules, 11 November 2026:
 *
 * - An edge against a wall follows the wall's lean, in or out. A wall that
 *   leans out makes the pane bigger: the rectangle it is cut from grows to
 *   take the lean.
 * - A fixed pane's bottom follows the floor. Its top follows the ceiling when
 *   the glass goes to the ceiling; otherwise it stays level, at the glass
 *   height above the highest point of the floor along its run, so the pane is
 *   taller where the floor is lower.
 * - A door's sides are always plumb. When the glass goes to the ceiling its
 *   top and bottom rake, parallel to the ceiling and the floor; otherwise the
 *   door is square and its gaps take the slope.
 * - Edges at a glass joint or a corner are plumb.
 * - Every difference is kept and shown, however small. A glass processor may
 *   treat under 3mm as square; that is theirs to decide.
 *
 * And where a door stands in its opening: its deduction comes off its latch
 * side, except that a door hung in line from the panel beside it on
 * glass-to-glass hinges keeps the hinge's gap on that side (Matt, 11 November
 * 2026: 3mm). The cut size is the same either way.
 *
 * Worked in each run's own plane, as seen from outside: x along the run from
 * its start on the left, y up from the highest point of the floor along it.
 * The spec's deductions are taken off each edge here too. With every reading
 * square, every shape is exactly the spec's own rectangle.
 *
 * A wall's lean is its two readings' difference over the glass height. A
 * slope is a straight line between its two readings, as the spec says it is
 * cut. Every edge is a straight line, so every pane is a four-sided shape.
 */

import { hasTransom, runLabelsFor, runPanelIndices } from './geometry';
import { leanScale, signedLeanMm, type RunMeasurement, type WallMeasurement } from './measure';
import type { FixedRules } from './ruleset';
import type { ConfiguratorSpec } from './spec';
import type { ConfiguratorState } from './types';

export interface ShapePoint {
  x: number;
  y: number;
}

export interface PaneShape {
  id: string;
  /** The rectangle the pane is cut from, around its shape. */
  widthMm: number;
  heightMm: number;
  /** Its corners, in whole mm from the rectangle's bottom-left corner, y up. */
  corners: { bottomLeft: ShapePoint; bottomRight: ShapePoint; topRight: ShapePoint; topLeft: ShapePoint };
  /** True when any corner is off the rectangle. */
  shaped: boolean;
  /**
   * Where the spec's own bottom edge falls, up from the rectangle's bottom.
   * The spec measures cut-outs from it; this is how they are moved onto the
   * shape without moving them at all.
   */
  specBottomMm: number;
}

/** A side edge, x = p + q·y, and a flat one, y = m + n·x. */
interface Side {
  p: number;
  q: number;
}
interface Flat {
  m: number;
  n: number;
}

function meet(side: Side, flat: Flat): ShapePoint {
  const x = (side.p + side.q * flat.m) / (1 - side.q * flat.n);
  return { x, y: flat.m + flat.n * x };
}

const isNumber = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** The floor along a run: y at its start, and how it changes along it. */
function floorOf(run: RunMeasurement | undefined, widthMm: number): Flat {
  const fall = run?.floorFallMm ?? 0;
  if (!fall || !run?.floorLowEnd || widthMm <= 0) return { m: 0, n: 0 };
  return run.floorLowEnd === 'start' ? { m: -fall, n: fall / widthMm } : { m: 0, n: -fall / widthMm };
}

/** A run as its panes stand in it. */
interface Frame {
  indices: number[];
  width: number;
  floor: Flat;
  /** The ceiling, wherever both its ends were measured. */
  measuredCeiling: Flat | null;
  /** The ceiling the glass is cut to: the measured one, when the glass goes to it. */
  ceiling: Flat | null;
  startWall: Side | null;
  endWall: Side | null;
}

type Corners = PaneShape['corners'];

/** A pane where it stands in its run, before it is cut out. */
interface Placed {
  run: number;
  /** Its place in the run, from the left. */
  k: number;
  from: number;
  to: number;
  /** Unrounded, in the run's frame: x from the run's start, y up from the floor's highest point. */
  corners: Corners;
  /** The spec's own bottom edge, in the same frame. */
  specBottom: number;
}

/** What the shapes need from SetOut's fixed rules: the gap a glass-to-glass hinge leaves. */
export type ShapeRules = Pick<FixedRules, 'hinges'>;

/** Every pane where it stands, run by run, as seen from outside. */
function place(state: ConfiguratorState, spec: ConfiguratorSpec, fixed: ShapeRules): { frames: Frame[]; placed: (Placed | undefined)[] } {
  const frames: Frame[] = [];
  const placed: (Placed | undefined)[] = [];
  const runs = runPanelIndices(state.panels, state.junctions);
  const glassHeight = state.heightMm > 0 ? state.heightMm : 1;

  runs.forEach((indices, r) => {
    const run = state.opening.runs[r];
    const panels = indices.map((i) => spec.panels[i]).filter(Boolean);
    const runWidth = panels.reduce((sum, p) => sum + p.tightWidthMm, 0);
    const floor = floorOf(run, runWidth);
    const floorAt = (x: number) => floor.m + floor.n * x;

    // The ceiling, where it was measured at both ends.
    const measuredCeiling: Flat | null =
      isNumber(run?.ceilingStartMm) && isNumber(run?.ceilingEndMm) && runWidth > 0
        ? (() => {
            const start = floorAt(0) + (run.ceilingStartMm as number);
            const end = floorAt(runWidth) + (run.ceilingEndMm as number);
            return { m: start, n: (end - start) / runWidth };
          })()
        : null;
    const ceiling = state.isFloorToCeiling ? measuredCeiling : null;

    // The walls, at the two ends of the whole chain only.
    const startWall: Side | null =
      r === 0 && state.leftWall
        ? (() => {
            const lean = signedLeanMm(state.opening.startWall, leanScale(state.opening, state.heightMm));
            return { p: (-lean * floorAt(0)) / glassHeight, q: lean / glassHeight };
          })()
        : null;
    const endWall: Side | null =
      r === runs.length - 1 && state.rightWall
        ? (() => {
            const lean = signedLeanMm(state.opening.endWall, leanScale(state.opening, state.heightMm));
            return { p: runWidth + (lean * floorAt(runWidth)) / glassHeight, q: -lean / glassHeight };
          })()
        : null;
    frames.push({ indices, width: runWidth, floor, measuredCeiling, ceiling, startWall, endWall });

    let from = 0;
    panels.forEach((panel, k) => {
      const to = from + panel.tightWidthMm;
      const { left, right } = panel.deductions.horizontal;
      const { top, bottom } = panel.deductions.vertical;
      const door = panel.door;
      // A door's swing deduction comes off its latch edge, less the gap a
      // glass-to-glass hinge leaves when it hangs in line from the panel
      // beside it, which stays on its hinge edge.
      const latchLeft = door ? door.hingeSide === 'right' : false;
      const swing = door?.swingDeductionMm ?? 0;
      const hungFromGlass = door ? (latchLeft ? k < panels.length - 1 : k > 0) : false;
      const atHinge = hungFromGlass ? Math.min(Math.max(fixed.hinges.glassToGlassGapMm, 0), swing) : 0;
      const atLatch = swing - atHinge;

      const leftEdge: Side =
        !door && k === 0 && startWall
          ? { p: startWall.p + left, q: startWall.q }
          : { p: from + left + (door ? (latchLeft ? atLatch : atHinge) : 0), q: 0 };
      const rightEdge: Side =
        !door && k === panels.length - 1 && endWall
          ? { p: endWall.p - right, q: endWall.q }
          : { p: to - right - (door ? (latchLeft ? atHinge : atLatch) : 0), q: 0 };

      // The spec's own bottom and top, as straight lines across the run.
      const specBottom: Flat = { m: bottom, n: 0 };
      const specTop: Flat = { m: panel.tightHeightMm - top, n: 0 };
      let bottomEdge = specBottom;
      let topEdge = specTop;
      if (!door) {
        bottomEdge = { m: floor.m + bottom, n: floor.n };
        if (ceiling) topEdge = { m: ceiling.m - top, n: ceiling.n };
      } else if (ceiling) {
        // Parallel to the floor and the ceiling, never closer to either than
        // the spec has it.
        bottomEdge = { m: floor.m + bottom, n: floor.n };
        // The top keeps the spec's gap below the ceiling where the ceiling is
        // lowest over the door, and rises with it from there.
        const lowest = Math.min(ceiling.m + ceiling.n * from, ceiling.m + ceiling.n * to);
        topEdge = { m: ceiling.m - (lowest - specTop.m), n: ceiling.n };
      }

      placed[indices[k]] = {
        run: r,
        k,
        from,
        to,
        corners: {
          bottomLeft: meet(leftEdge, bottomEdge),
          bottomRight: meet(rightEdge, bottomEdge),
          topRight: meet(rightEdge, topEdge),
          topLeft: meet(leftEdge, topEdge),
        },
        specBottom: bottom,
      };
      from = to;
    });
  });
  return { frames, placed };
}

export function shapesOf(state: ConfiguratorState, spec: ConfiguratorSpec, fixed: ShapeRules): PaneShape[] {
  // [UNCONFIRMED] Sliding glass is cut square, to its maker's formula. See sliding.ts.
  if (spec.sliding) {
    return spec.panels.map((p) => ({ id: p.id, widthMm: p.cutWidthMm, heightMm: p.cutHeightMm, corners: square(p.cutWidthMm, p.cutHeightMm), shaped: false, specBottomMm: 0 }));
  }
  const { placed } = place(state, spec, fixed);
  return spec.panels.map((p, i) => {
    const at0 = placed[i];
    if (!at0) return { id: p.id, widthMm: p.cutWidthMm, heightMm: p.cutHeightMm, corners: square(p.cutWidthMm, p.cutHeightMm), shaped: false, specBottomMm: 0 };
    const corners = at0.corners;
    const all = Object.values(corners);
    const minX = Math.min(...all.map((c) => c.x));
    const minY = Math.min(...all.map((c) => c.y));
    const at = (c: ShapePoint): ShapePoint => ({ x: Math.round(c.x - minX), y: Math.round(c.y - minY) });
    const rel = {
      bottomLeft: at(corners.bottomLeft),
      bottomRight: at(corners.bottomRight),
      topRight: at(corners.topRight),
      topLeft: at(corners.topLeft),
    };
    const widthMm = Math.max(rel.bottomRight.x, rel.topRight.x) - Math.min(rel.bottomLeft.x, rel.topLeft.x);
    const heightMm = Math.max(rel.topLeft.y, rel.topRight.y) - Math.min(rel.bottomLeft.y, rel.bottomRight.y);
    const shaped =
      rel.bottomLeft.x !== 0 ||
      rel.bottomLeft.y !== 0 ||
      rel.topLeft.x !== 0 ||
      rel.topLeft.y !== heightMm ||
      rel.bottomRight.x !== widthMm ||
      rel.bottomRight.y !== 0 ||
      rel.topRight.x !== widthMm ||
      rel.topRight.y !== heightMm;
    return { id: p.id, widthMm, heightMm, corners: rel, shaped, specBottomMm: Math.round(at0.specBottom - minY) };
  });
}

// ---------------------------------------------------------------------------
// Setting out
// ---------------------------------------------------------------------------

/** What a side of a pane meets: a wall, the next pane of glass, a corner, or nothing. */
export type SideMeets = 'wall' | 'glass' | 'corner' | 'open';

export interface SideGap {
  meets: SideMeets;
  /**
   * Set where a sliding door laps the fixed panel beside it: how far. The two
   * gaps below are then minus this, the panes crossing instead of meeting.
   */
  overlapMm?: number;
  /**
   * Straight across from the pane's bottom and top corners on this side to
   * the wall or the next pane, in whole mm. Null at a corner, where the glass
   * meets glass round the turn, and at an open end.
   */
  bottomMm: number | null;
  topMm: number | null;
}

/** A pane as the fitter sets it out: where it stands and the gap all round it. */
export interface PaneSetOut {
  id: string;
  /** The straight run it stands in, in chain order. */
  run: number;
  /** The part of the run's width it was given, from the run's start. */
  fromMm: number;
  toMm: number;
  /**
   * Its corners where it stands, to a tenth of a mm: x along the run from its
   * start, y up from the highest point of the floor along the run.
   */
  corners: Corners;
  /** Down from each bottom corner to the floor, in whole mm. */
  floorGap: { left: number; right: number };
  /** Up from each top corner to the ceiling, where the glass goes to a measured ceiling. */
  ceilingGap: { left: number; right: number } | null;
  left: SideGap;
  right: SideGap;
}

/** Where a run ends: at a wall, with its line, or at a corner or an open end. */
export type RunBoundary =
  | {
      meets: 'wall';
      /** The wall's face, in the run's frame: x = xMm + perMm × y. */
      xMm: number;
      perMm: number;
      /** Its lean over the glass height, as measured: plus leans in, minus leans out. */
      leanMm: number;
    }
  | { meets: 'corner' | 'open' };

/** A straight run of the opening, in its own frame, as seen from outside. */
export interface RunSetOut {
  /** What the customer calls it: "The opening", "Front", "Left return". */
  label: string;
  /** Its panes, by index into the spec's panels, from the left. */
  panes: number[];
  widthMm: number;
  /** The floor at the run's two ends, up from its highest point: 0 or below. */
  floor: { startMm: number; endMm: number };
  /** The ceiling at the two ends, in the same frame, where both were measured. */
  ceiling: { startMm: number; endMm: number } | null;
  start: RunBoundary;
  end: RunBoundary;
}

export interface SetOut {
  runs: RunSetOut[];
  /** One per pane, in the spec's order. */
  panes: PaneSetOut[];
}

const whole = (v: number) => Math.round(v) || 0;
const tenthOf = (v: number) => Math.round(v * 10) / 10 || 0;
const tenth = (p: ShapePoint): ShapePoint => ({ x: tenthOf(p.x), y: tenthOf(p.y) });
const wallX = (wall: Side, y: number) => wall.p + wall.q * y;

/**
 * Each pane where it stands, with the gap from each corner to the floor, the
 * ceiling, the walls and the next pane: what the fitter needs to set the
 * glass out. Worked from the same lines the panes are cut to, so a gap here
 * and a size on the glass order can never disagree.
 */
export function setOutOf(state: ConfiguratorState, spec: ConfiguratorSpec, fixed: ShapeRules): SetOut {
  const { frames, placed } = place(state, spec, fixed);
  const labels = runLabelsFor(state.panels, state.junctions);
  const transom = hasTransom(state);

  const runs: RunSetOut[] = frames.map((f, r) => {
    const end = (wall: Side | null, measured: WallMeasurement, chainEnd: boolean): RunBoundary =>
      wall ? { meets: 'wall', xMm: wall.p, perMm: wall.q, leanMm: signedLeanMm(measured, leanScale(state.opening, state.heightMm)) } : { meets: chainEnd ? 'open' : 'corner' };
    return {
      label: labels[r] ?? `Run ${r + 1}`,
      panes: f.indices,
      widthMm: f.width,
      floor: { startMm: tenthOf(f.floor.m), endMm: tenthOf(f.floor.m + f.floor.n * f.width) },
      ceiling: f.measuredCeiling
        ? { startMm: tenthOf(f.measuredCeiling.m), endMm: tenthOf(f.measuredCeiling.m + f.measuredCeiling.n * f.width) }
        : null,
      start: end(f.startWall, state.opening.startWall, r === 0),
      end: end(f.endWall, state.opening.endWall, r === frames.length - 1),
    };
  });

  if (spec.sliding) return { runs, panes: slidingPanes(spec, frames) };

  const panes = spec.panels.map((panel, i): PaneSetOut => {
    const p = placed[i];
    if (!p) {
      const none: SideGap = { meets: 'open', bottomMm: null, topMm: null };
      return { id: panel.id, run: 0, fromMm: 0, toMm: panel.tightWidthMm, corners: square(panel.cutWidthMm, panel.cutHeightMm), floorGap: { left: 0, right: 0 }, ceilingGap: null, left: none, right: none };
    }
    const f = frames[p.run];
    const c = p.corners;
    const floorAt = (x: number) => f.floor.m + f.floor.n * x;
    const ceilingAt = (x: number) => (f.ceiling ? f.ceiling.m + f.ceiling.n * x : 0);
    const before = p.k > 0 ? placed[f.indices[p.k - 1]] : undefined;
    const after = p.k < f.indices.length - 1 ? placed[f.indices[p.k + 1]] : undefined;
    const firstRun = p.run === 0;
    const lastRun = p.run === frames.length - 1;

    const left: SideGap = before
      ? { meets: 'glass', bottomMm: whole(c.bottomLeft.x - before.corners.bottomRight.x), topMm: whole(c.topLeft.x - before.corners.topRight.x) }
      : f.startWall
        ? { meets: 'wall', bottomMm: whole(c.bottomLeft.x - wallX(f.startWall, c.bottomLeft.y)), topMm: whole(c.topLeft.x - wallX(f.startWall, c.topLeft.y)) }
        : { meets: firstRun ? 'open' : 'corner', bottomMm: null, topMm: null };
    const right: SideGap = after
      ? { meets: 'glass', bottomMm: whole(after.corners.bottomLeft.x - c.bottomRight.x), topMm: whole(after.corners.topLeft.x - c.topRight.x) }
      : f.endWall
        ? { meets: 'wall', bottomMm: whole(wallX(f.endWall, c.bottomRight.y) - c.bottomRight.x), topMm: whole(wallX(f.endWall, c.topRight.y) - c.topRight.x) }
        : { meets: lastRun ? 'open' : 'corner', bottomMm: null, topMm: null };

    // A door under a transom stops at its own height, not at the ceiling.
    const toCeiling = f.ceiling && !(panel.door && transom);
    return {
      id: panel.id,
      run: p.run,
      fromMm: p.from,
      toMm: p.to,
      corners: { bottomLeft: tenth(c.bottomLeft), bottomRight: tenth(c.bottomRight), topRight: tenth(c.topRight), topLeft: tenth(c.topLeft) },
      floorGap: { left: whole(c.bottomLeft.y - floorAt(c.bottomLeft.x)), right: whole(c.bottomRight.y - floorAt(c.bottomRight.x)) },
      ceilingGap: toCeiling ? { left: whole(ceilingAt(c.topLeft.x) - c.topLeft.y), right: whole(ceilingAt(c.topRight.x) - c.topRight.y) } : null,
      left,
      right,
    };
  });

  return { runs, panes };
}

function square(w: number, h: number): PaneShape['corners'] {
  return { bottomLeft: { x: 0, y: 0 }, bottomRight: { x: w, y: 0 }, topRight: { x: w, y: h }, topLeft: { x: 0, y: h } };
}

/**
 * A sliding shower's panes where they stand: square, at the places its spec
 * gives them, the door lapping the fixed panel. Gaps are still measured to
 * the floor and walls as they were read.
 */
function slidingPanes(spec: ConfiguratorSpec, frames: Frame[]): PaneSetOut[] {
  const none: SideGap = { meets: 'open', bottomMm: null, topMm: null };
  return spec.panels.map((panel, i): PaneSetOut => {
    const r = frames.findIndex((f) => f.indices.includes(i));
    const at = panel.sliding;
    const f = frames[r];
    if (!at || !f) {
      return { id: panel.id, run: Math.max(r, 0), fromMm: 0, toMm: panel.tightWidthMm, corners: square(panel.cutWidthMm, panel.cutHeightMm), floorGap: { left: 0, right: 0 }, ceilingGap: null, left: none, right: none };
    }
    const bottom = panel.deductions.vertical.bottom;
    const top = bottom + panel.cutHeightMm;
    const corners: Corners = {
      bottomLeft: { x: at.fromMm, y: bottom },
      bottomRight: { x: at.toMm, y: bottom },
      topRight: { x: at.toMm, y: top },
      topLeft: { x: at.fromMm, y: top },
    };
    const floorAt = (x: number) => f.floor.m + f.floor.n * x;
    const other = f.indices.map((n) => spec.panels[n]).find((p) => p !== panel && p.sliding)?.sliding;
    const firstRun = r === 0;
    const lastRun = r === frames.length - 1;
    // What is beside it: the pane it laps, a wall, or the corner.
    const beside = (edge: 'left' | 'right'): SideGap => {
      const x = edge === 'left' ? at.fromMm : at.toMm;
      if (other && (edge === 'left' ? other.fromMm < x : other.toMm > x)) {
        const lap = edge === 'left' ? other.toMm - x : x - other.fromMm;
        return { meets: 'glass', bottomMm: whole(-lap), topMm: whole(-lap), overlapMm: whole(lap) };
      }
      const wall = edge === 'left' ? f.startWall : f.endWall;
      if (wall) {
        const gap = (y: number) => whole(edge === 'left' ? x - wallX(wall, y) : wallX(wall, y) - x);
        return { meets: 'wall', bottomMm: gap(bottom), topMm: gap(top) };
      }
      return { meets: (edge === 'left' ? firstRun : lastRun) ? 'open' : 'corner', bottomMm: null, topMm: null };
    };
    return {
      id: panel.id,
      run: r,
      fromMm: at.fromMm,
      toMm: at.toMm,
      corners,
      floorGap: { left: whole(bottom - floorAt(at.fromMm)), right: whole(bottom - floorAt(at.toMm)) },
      ceilingGap: null,
      left: beside('left'),
      right: beside('right'),
    };
  });
}
