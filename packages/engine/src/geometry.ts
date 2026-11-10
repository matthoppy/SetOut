/**
 * Chain geometry.
 *
 * Walks the panel run in plan (top-down) and produces a segment per panel in
 * millimetre space, plus the bounding box. Views scale that into pixels; the
 * spec uses it to work out which panels are returns.
 *
 * Extracted from the Square v1 plan view, with two changes:
 *   - it no longer requires a door to be present (fixed-panel-only runs are
 *     a real product, and the old code returned early before its hooks ran)
 *   - it is pure, so both the plan view and the spec builder share one source
 *     of truth for where a panel actually sits.
 */

import type { ConfiguratorJunction, ConfiguratorPanel } from './types';
import type { OpeningContext } from './measure';

export interface Segment {
  id: string;
  /** Index into the panels array. */
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Unit direction of travel along the panel. */
  dx: number;
  dy: number;
}

export interface ChainTrace {
  segments: Segment[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Index the walk was anchored on — the door where there is one. */
  anchorIndex: number;
}

/** Rotate a heading 90° anticlockwise. */
function turnLeft(dx: number, dy: number): [number, number] {
  return [-dy, dx];
}

/** Rotate a heading 90° clockwise. */
function turnRight(dx: number, dy: number): [number, number] {
  return [dy, -dx];
}

/**
 * Trace the run in plan space, anchoring on the door so the door always sits
 * on the x-axis facing the viewer. With no door we anchor on the first panel.
 */
export function traceChain(
  panels: ConfiguratorPanel[],
  junctions: ConfiguratorJunction[]
): ChainTrace {
  const segments: Segment[] = [];

  if (panels.length === 0) {
    return { segments, minX: 0, maxX: 0, minY: 0, maxY: 0, anchorIndex: 0 };
  }

  const doorIndex = panels.findIndex((p) => p.kind === 'door');
  const anchorIndex = doorIndex === -1 ? 0 : doorIndex;
  const anchor = panels[anchorIndex];

  segments[anchorIndex] = {
    id: anchor.id,
    index: anchorIndex,
    x1: 0,
    y1: 0,
    x2: anchor.width_mm,
    y2: 0,
    dx: 1,
    dy: 0,
  };

  // Walk left from the anchor's left edge, travelling in -x to begin with.
  let curX = 0;
  let curY = 0;
  let dx = -1;
  let dy = 0;
  for (let i = anchorIndex - 1; i >= 0; i--) {
    // junctions[i] joins panel i to panel i + 1.
    if (junctions[i]?.angle_deg === 90) {
      [dx, dy] = turnLeft(dx, dy);
    }
    const p = panels[i];
    const nextX = curX + dx * p.width_mm;
    const nextY = curY + dy * p.width_mm;
    segments[i] = { id: p.id, index: i, x1: curX, y1: curY, x2: nextX, y2: nextY, dx, dy };
    curX = nextX;
    curY = nextY;
  }

  // Walk right from the anchor's right edge, travelling in +x to begin with.
  curX = anchor.width_mm;
  curY = 0;
  dx = 1;
  dy = 0;
  for (let i = anchorIndex + 1; i < panels.length; i++) {
    if (junctions[i - 1]?.angle_deg === 90) {
      [dx, dy] = turnRight(dx, dy);
    }
    const p = panels[i];
    const nextX = curX + dx * p.width_mm;
    const nextY = curY + dy * p.width_mm;
    segments[i] = { id: p.id, index: i, x1: curX, y1: curY, x2: nextX, y2: nextY, dx, dy };
    curX = nextX;
    curY = nextY;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }

  return { segments, minX, maxX, minY, maxY, anchorIndex };
}

export type Plane = 'front' | 'return_left' | 'return_right' | 'back';

/**
 * Classify each panel by the plane it sits in.
 *
 * Square v1 hardcoded every panel to 'front', which quietly disabled the
 * support-bar rule (it only fires on wide *return* panels) and the corner
 * long/short deduction. Deriving it from the trace fixes both.
 */
export function derivePlanes(
  panels: ConfiguratorPanel[],
  junctions: ConfiguratorJunction[]
): Plane[] {
  const { segments, anchorIndex } = traceChain(panels, junctions);

  return panels.map((_, i) => {
    const seg = segments[i];
    if (!seg) return 'front';

    // Travelling along y means the panel turns away from the anchor's face.
    if (Math.abs(seg.dy) > Math.abs(seg.dx)) {
      return i < anchorIndex ? 'return_left' : 'return_right';
    }

    // Travelling along x. Reversed direction means the run has wrapped round
    // and is now facing back at the anchor.
    const goingAway = i < anchorIndex ? seg.dx < 0 : seg.dx > 0;
    return goingAway ? 'front' : 'back';
  });
}

/**
 * Name each straight run the way the customer sees it.
 *
 * Deliberately derived from the traced geometry rather than from chain order.
 * Templates do not all start at the same end — "Corner, door and side" lists
 * the side panel first, so its run 0 is the *return*, not the front. Labelling
 * by position would have sent someone to measure the wrong wall.
 */
export function runLabelsFor(
  panels: ConfiguratorPanel[],
  junctions: ConfiguratorJunction[]
): string[] {
  const runs = runPanelIndices(panels, junctions);
  if (runs.length <= 1) return ['The opening'];

  const planes = derivePlanes(panels, junctions);
  const named: Record<Plane, string> = {
    front: 'Front',
    return_left: 'Left return',
    return_right: 'Right return',
    back: 'Back',
  };

  // A run is one straight segment, so every panel in it shares a plane; take
  // the first. Where two runs somehow land on the same name, number them so
  // the customer can still tell which is which.
  const labels = runs.map((indices) => named[planes[indices[0]] ?? 'front']);
  return labels.map((label, i) =>
    labels.filter((l) => l === label).length > 1
      ? `${label} ${labels.slice(0, i + 1).filter((l) => l === label).length}`
      : label
  );
}

/**
 * One door, wall to wall, nothing else: the layout that gets the cross method.
 *
 * Lives here rather than in spec.ts so the measuring journey can ask without
 * pulling in the fabrication library (and its path aliases, which the unit
 * tests cannot resolve).
 */
export function isSingleDoor(state: {
  panels: ConfiguratorPanel[];
  leftWall: boolean;
  rightWall: boolean;
}): boolean {
  return (
    state.panels.length === 1 &&
    state.panels[0].kind === 'door' &&
    state.leftWall &&
    state.rightWall
  );
}

/** A door with other glass, going to the ceiling: it gets a transom above it. */
export function hasTransom(state: {
  panels: ConfiguratorPanel[];
  leftWall: boolean;
  rightWall: boolean;
  isFloorToCeiling: boolean;
}): boolean {
  return (
    state.isFloorToCeiling && !isSingleDoor(state) && state.panels.some((p) => p.kind === 'door')
  );
}

/** What the shape tells the measurement checks. */
export function openingContext(state: {
  panels: ConfiguratorPanel[];
  junctions: ConfiguratorJunction[];
  leftWall: boolean;
  rightWall: boolean;
  heightMm: number;
  isFloorToCeiling?: boolean;
}): OpeningContext {
  return {
    toCeiling: state.isFloorToCeiling ?? false,
    // Only the two ends of the whole chain can meet a wall; everything
    // between them is a glass-to-glass corner.
    hasStartWall: state.leftWall,
    hasEndWall: state.rightWall,
    glassHeightMm: state.heightMm,
    labels: runLabelsFor(state.panels, state.junctions),
  };
}

/** Straight-line width of the run, ignoring corners. */
/**
 * Split the chain into straight runs at every 90° corner.
 *
 * A customer measures one wall-to-wall (or wall-to-corner) distance per
 * straight run, so this is the unit the Measure step works in: an inline
 * shower is one run, an L-shaped corner is two, a three-sided enclosure is
 * three. Returns the panel indices making up each run.
 */
export function runPanelIndices(
  panels: ConfiguratorPanel[],
  junctions: ConfiguratorJunction[]
): number[][] {
  if (panels.length === 0) return [];
  const runs: number[][] = [[]];
  panels.forEach((_, i) => {
    runs[runs.length - 1].push(i);
    // A junction after this panel that turns a corner starts a new run.
    if (i < junctions.length && junctions[i].angle_deg !== 180) runs.push([]);
  });
  // A trailing corner with no panel after it leaves an empty run behind.
  return runs.filter((r) => r.length > 0);
}

/** Tight width of each straight run, in chain order. */
export function runWidthsMm(
  panels: ConfiguratorPanel[],
  junctions: ConfiguratorJunction[]
): number[] {
  return runPanelIndices(panels, junctions).map((indices) =>
    indices.reduce((sum, i) => sum + panels[i].width_mm, 0)
  );
}

export function totalRunWidthMm(panels: ConfiguratorPanel[]): number {
  return panels.reduce((sum, p) => sum + p.width_mm, 0);
}

export interface Point {
  x: number;
  y: number;
}

export interface RunEnd extends Point {
  /** Unit vector pointing away from the run, out towards the wall. */
  dx: number;
  dy: number;
}

/**
 * Where junction `i` — the joint between panel i and panel i + 1 — actually is.
 *
 * The walk runs outward from the anchor in both directions, so a left-side
 * panel's x1/y1 is its edge *nearest* the anchor while a right-side panel's
 * x2/y2 is. Getting this backwards puts corner markers on the far end of the
 * wrong panel.
 */
export function junctionPoint(trace: ChainTrace, i: number): Point | null {
  const seg = trace.segments[i];
  if (!seg) return null;
  return i < trace.anchorIndex ? { x: seg.x1, y: seg.y1 } : { x: seg.x2, y: seg.y2 };
}

/** The two open ends of the run, where it meets a wall. */
export function runEnds(trace: ChainTrace, panelCount: number): {
  left: RunEnd | null;
  right: RunEnd | null;
} {
  const first = trace.segments[0];
  const last = trace.segments[panelCount - 1];

  // Panel 0 is only traced outward-from-anchor when it sits left of it. When
  // panel 0 *is* the anchor, its left edge is x1 and "outward" is backwards
  // along the panel.
  const left: RunEnd | null = !first
    ? null
    : trace.anchorIndex > 0
      ? { x: first.x2, y: first.y2, dx: first.dx, dy: first.dy }
      : { x: first.x1, y: first.y1, dx: -first.dx, dy: -first.dy };

  const right: RunEnd | null = !last
    ? null
    : { x: last.x2, y: last.y2, dx: last.dx, dy: last.dy };

  return { left, right };
}
