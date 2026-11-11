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
 * Worked in each run's own plane, as seen from outside: x along the run from
 * its start on the left, y up from the highest point of the floor along it.
 * The spec's deductions are taken off each edge here too. With every reading
 * square, every shape is exactly the spec's own rectangle.
 *
 * A wall's lean is its two readings' difference over the glass height. A
 * slope is a straight line between its two readings, as the spec says it is
 * cut. Every edge is a straight line, so every pane is a four-sided shape.
 */

import { runPanelIndices } from './geometry';
import { signedLeanMm, type RunMeasurement } from './measure';
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

export function shapesOf(state: ConfiguratorState, spec: ConfiguratorSpec): PaneShape[] {
  const shapes: PaneShape[] = [];
  const runs = runPanelIndices(state.panels, state.junctions);
  const glassHeight = state.heightMm > 0 ? state.heightMm : 1;

  runs.forEach((indices, r) => {
    const run = state.opening.runs[r];
    const panels = indices.map((i) => spec.panels[i]).filter(Boolean);
    const runWidth = panels.reduce((sum, p) => sum + p.tightWidthMm, 0);
    const floor = floorOf(run, runWidth);
    const floorAt = (x: number) => floor.m + floor.n * x;

    // The ceiling, when the glass goes to it and it was measured at both ends.
    const ceiling: Flat | null =
      state.isFloorToCeiling && isNumber(run?.ceilingStartMm) && isNumber(run?.ceilingEndMm) && runWidth > 0
        ? (() => {
            const start = floorAt(0) + (run.ceilingStartMm as number);
            const end = floorAt(runWidth) + (run.ceilingEndMm as number);
            return { m: start, n: (end - start) / runWidth };
          })()
        : null;

    // The walls, at the two ends of the whole chain only.
    const startWall: Side | null =
      r === 0 && state.leftWall
        ? (() => {
            const lean = signedLeanMm(state.opening.startWall);
            return { p: (-lean * floorAt(0)) / glassHeight, q: lean / glassHeight };
          })()
        : null;
    const endWall: Side | null =
      r === runs.length - 1 && state.rightWall
        ? (() => {
            const lean = signedLeanMm(state.opening.endWall);
            return { p: runWidth + (lean * floorAt(runWidth)) / glassHeight, q: -lean / glassHeight };
          })()
        : null;

    let from = 0;
    panels.forEach((panel, k) => {
      const to = from + panel.tightWidthMm;
      const { left, right } = panel.deductions.horizontal;
      const { top, bottom } = panel.deductions.vertical;
      const door = panel.door;
      // A door's swing deduction comes off its latch edge.
      const latchLeft = door ? door.hingeSide === 'right' : false;
      const swing = door?.swingDeductionMm ?? 0;

      const leftEdge: Side =
        !door && k === 0 && startWall ? { p: startWall.p + left, q: startWall.q } : { p: from + left + (latchLeft ? swing : 0), q: 0 };
      const rightEdge: Side =
        !door && k === panels.length - 1 && endWall
          ? { p: endWall.p - right, q: endWall.q }
          : { p: to - right - (door && !latchLeft ? swing : 0), q: 0 };

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

      const corners = {
        bottomLeft: meet(leftEdge, bottomEdge),
        bottomRight: meet(rightEdge, bottomEdge),
        topRight: meet(rightEdge, topEdge),
        topLeft: meet(leftEdge, topEdge),
      };
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
      shapes[indices[k]] = { id: panel.id, widthMm, heightMm, corners: rel, shaped, specBottomMm: Math.round(bottom - minY) };
      from = to;
    });
  });
  return spec.panels.map((p, i) => shapes[i] ?? { id: p.id, widthMm: p.cutWidthMm, heightMm: p.cutHeightMm, corners: square(p.cutWidthMm, p.cutHeightMm), shaped: false, specBottomMm: 0 });
}

function square(w: number, h: number): PaneShape['corners'] {
  return { bottomLeft: { x: 0, y: 0 }, bottomRight: { x: w, y: 0 }, topRight: { x: w, y: h }, topLeft: { x: 0, y: h } };
}
