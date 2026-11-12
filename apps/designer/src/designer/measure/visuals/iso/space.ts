/**
 * The room the measuring pictures are drawn in: the shower on its tray in the
 * corner of a bathroom, seen from above and to one side, as an architect's
 * isometric drawing is.
 *
 * Distances are millimetres in the room: x along the front of the shower
 * from left to right as you face it, y from the front glass line back to the
 * back wall, z up from the bathroom floor. The picture is not to scale.
 * Every shower of a shape is drawn the same size, so a card shows where to
 * measure, never what the answer should be, and the picture does not move
 * while a number is typed.
 */

import type { RunView } from '@setout/engine';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A point on the page. */
export interface P {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const v = (x: number, y: number, z = 0): V3 => ({ x, y, z });
export const add = (p: V3, q: V3, k = 1): V3 => v(p.x + q.x * k, p.y + q.y * k, p.z + q.z * k);
export const sub = (p: V3, q: V3): V3 => v(p.x - q.x, p.y - q.y, p.z - q.z);
export const along = (p: V3, q: V3, t: number): V3 => v(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t);
export const lift = (p: V3, z: number): V3 => v(p.x, p.y, z);
export const size = (p: V3) => Math.hypot(p.x, p.y, p.z);
export const dir = (p: V3, q: V3): V3 => {
  const d = sub(q, p);
  const n = size(d) || 1;
  return v(d.x / n, d.y / n, d.z / n);
};

/** The sizes the room is drawn at, in millimetres. */
export const MM = {
  /** The tray stands this far off the bathroom floor. Its top is the floor the glass stands on. */
  tray: 45,
  /**
   * The tray runs on this far past a glass line. Drawn wider than life, so
   * the masking tape and the tape measure lie on it outside the glass.
   */
  lip: 100,
  glass: 2000,
  /** Glass is drawn a little thicker than it is, so its edge catches the light. */
  glassThick: 14,
  wall: 2240,
  ceiling: 2440,
  wallThick: 110,
  /** The bathroom floor drawn around the tray. */
  apron: 860,
  /** Where the laser's lines come out when it stands on the floor, and on its tripod. */
  floorBeam: 160,
  tripodBeam: 1000,
  /** A tape's blade, drawn wider than life so it reads. */
  blade: 46,
  /** The tape lies just outside the glass line, clear of the laser standing on a corner. */
  tapeOut: 74,
  /** The laser's up-and-down line stood off a wall. */
  wallGap: 50,
  /** Masking tape on the floor. */
  maskLong: 230,
  maskWide: 78,
} as const;

/** One pane of glass in a run, from its end nearer the run's start to the other. */
export interface Pane {
  a: V3;
  b: V3;
  kind: 'fixed' | 'door';
  /** The end a door hangs from. */
  hinge: 'a' | 'b' | null;
}

/** A run of glass on its glass line, from its left end to its right as seen from outside the shower. */
export interface Run {
  view: RunView;
  a: V3;
  b: V3;
  /** Which way is outside the shower, square to the glass. */
  out: V3;
  panes: Pane[];
}

export interface Plan {
  /** 1: the room is seen from the front left. -1: from the front right. */
  mirror: 1 | -1;
  /** The tray on the floor, as the glass lines' extent with the lip around it. */
  tray: { x0: number; x1: number; y0: number; y1: number };
  /** The side walls there are. The back wall is always there. */
  walls: { left: boolean; right: boolean };
  /** A side wall between the eye and the shower, drawn so the shower shows through it. */
  near: 'left' | 'right' | null;
  runs: Run[];
  /** Where the back wall stands, and how far the room is drawn either side of the tray. */
  back: number;
  room: { x0: number; x1: number };
  toCeiling: boolean;
  /** The door slides along a rail rather than swinging on hinges. */
  sliding: boolean;
}

/** What a run is made of, in order, for drawing its panes. */
export interface RunPanes {
  kinds: ('fixed' | 'door')[];
  /** For each door, the side it hangs from as seen from outside. */
  hinges: ('left' | 'right' | null)[];
}

/**
 * Whether a shower can be drawn on the tray: a front, with at most one side
 * turning back from each end of it. Anything else keeps the face-on pictures.
 */
export function trayable(views: RunView[]): boolean {
  const faces = views.map((w) => w.faces);
  if (faces.filter((f) => f === 'front').length !== 1) return false;
  if (faces.some((f) => f === 'back')) return false;
  if (faces.filter((f) => f === 'left').length > 1 || faces.filter((f) => f === 'right').length > 1) return false;
  const i = faces.indexOf('front');
  return faces.slice(0, i).every((f) => f === 'left') && faces.slice(i + 1).every((f) => f === 'right');
}

/** How long a front is drawn, by how many panes it has. */
const frontLength = (panes: number) => (panes <= 1 ? 1000 : panes === 2 ? 1300 : 1500);
const DEPTH = 950;
/** A walk-in's open way in, beside the glass. */
const WAY_IN = 700;
/** How far the room is drawn past the tray at a side with no wall. */
const SIDE = 470;

/** Splits a run into its panes, a door drawn a little wider than a fixed panel. */
function panesOf(a: V3, b: V3, made: RunPanes | undefined): Pane[] {
  const kinds = made && made.kinds.length > 0 ? made.kinds : ['fixed' as const];
  const weights = kinds.map((k) => (k === 'door' ? 1.3 : 1));
  const total = weights.reduce((s, w) => s + w, 0);
  let t = 0;
  return kinds.map((kind, i) => {
    const t0 = t;
    t += weights[i] / total;
    const hinge = kind === 'door' ? (made?.hinges[i] === 'left' ? 'a' : 'b') : null;
    return { a: along(a, b, t0), b: along(a, b, t), kind, hinge };
  });
}

/** Where everything stands, for a shower trayable says can be drawn. */
export function planFor(views: RunView[], made: RunPanes[], options: { toCeiling: boolean; sliding: boolean }): Plan {
  const front = views.find((w) => w.faces === 'front')!;
  const frontIndex = views.indexOf(front);
  const leftSide = views.some((w) => w.faces === 'left');
  const rightSide = views.some((w) => w.faces === 'right');
  const walls = { left: front.left === 'wall' && !leftSide, right: front.right === 'wall' && !rightSide };

  const glassFront = frontLength(made[frontIndex]?.kinds.length ?? 1);
  // A front with an open end and nothing turning back from it is a walk-in:
  // the tray runs on past the glass to make the way in.
  const openLeft = front.left === 'open' && !leftSide;
  const openRight = front.right === 'open' && !rightSide;
  const W = glassFront + (openLeft ? WAY_IN : 0) + (openRight ? WAY_IN : 0);
  const D = DEPTH;

  const runs = views.map((view, i): Run => {
    let a: V3;
    let b: V3;
    let out: V3;
    if (view.faces === 'left') {
      // From the back wall to the front left corner. An open end stops short.
      a = v(0, view.left === 'open' ? D * 0.5 : D);
      b = v(0, 0);
      out = v(-1, 0);
    } else if (view.faces === 'right') {
      a = v(W, 0);
      b = v(W, view.right === 'open' ? D * 0.5 : D);
      out = v(1, 0);
    } else {
      a = v(openLeft ? WAY_IN : 0, 0);
      b = v(openRight ? W - WAY_IN : W, 0);
      out = v(0, -1);
    }
    return { view, a, b, out, panes: panesOf(a, b, made[i]) };
  });

  // Look from the side without a wall, so the wall that matters faces us.
  const mirror: 1 | -1 = walls.left && !walls.right ? -1 : 1;
  const near = walls.left && walls.right ? 'left' : null;
  return {
    mirror,
    tray: { x0: -MM.lip, x1: W + MM.lip, y0: -MM.lip, y1: D },
    walls,
    near,
    runs,
    back: D,
    room: { x0: walls.left ? 0 : -SIDE, x1: walls.right ? W : W + SIDE },
    toCeiling: options.toCeiling,
    sliding: options.sliding,
  };
}

/** The tallest thing in the room: the ceiling where the glass reaches it, else the walls. */
export const roomTop = (plan: Plan) => (plan.toCeiling ? MM.ceiling : MM.wall);
/** The top of the glass. */
export const glassTop = (plan: Plan) => (plan.toCeiling ? MM.ceiling : MM.glass);

// ---------------------------------------------------------------------------
// The eye
// ---------------------------------------------------------------------------

/** The angle the front is turned from the page, and how far above the room the eye is. */
const TURN = (33 * Math.PI) / 180;
const RISE = (33 * Math.PI) / 180;

export interface Camera {
  /** A point in the room, on the page. */
  at: (p: V3) => P;
  /** How far a point is from the eye, for drawing far things first. */
  depth: (p: V3) => number;
  /** Whether a face with this outward normal is turned to the eye. */
  facing: (normal: V3) => boolean;
  /** How much light a face gets, 0 to 1, from its outward normal. */
  light: (normal: V3) => number;
}

export function cameraFor(plan: Plan): Camera {
  const [ca, sa, sp, cp] = [Math.cos(TURN), Math.sin(TURN), Math.sin(RISE), Math.cos(RISE)];
  const W = plan.tray.x1 - MM.lip;
  // Measured along the front from the end nearest the eye.
  const xr = (x: number) => (plan.mirror === 1 ? x : W - x);
  const at = (p: V3): P => {
    const x = xr(p.x);
    return { x: plan.mirror * (x * ca - p.y * sa), y: -(x * sa + p.y * ca) * sp - p.z * cp };
  };
  const depth = (p: V3) => xr(p.x) * sa + p.y * ca - p.z * 0.001;
  // The eye looks along +x' +y, down: a face is seen when its normal points back at it.
  const toEye = (n: V3) => -(plan.mirror * n.x) * sa - n.y * ca + n.z * 0.9;
  // Light from above, over the eye's left shoulder.
  const lamp = { x: -0.55, y: -0.35, z: 0.76 };
  const light = (n: V3) => {
    const nx = plan.mirror * n.x;
    const lit = nx * lamp.x + n.y * lamp.y + n.z * lamp.z;
    return Math.max(0, Math.min(1, 0.5 + lit * 0.5));
  };
  return { at, depth, facing: (n) => toEye(n) > 0, light };
}

// ---------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------

export const boxOf = (ps: P[]): Box => {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

export const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, w: b.w + by * 2, h: b.h + by * 2 });

export const union = (a: Box, b: Box): Box => boxOf([
  { x: a.x, y: a.y },
  { x: a.x + a.w, y: a.y + a.h },
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y + b.h },
]);

/** Everything in the room, on the page. */
export function sceneBox(plan: Plan, cam: Camera): Box {
  const { x0, x1 } = plan.room;
  const top = roomTop(plan);
  const front = -MM.apron;
  const ps = [
    v(x0, front),
    v(x1, front),
    v(x1, plan.back + MM.wallThick, top),
    v(x0, plan.back + MM.wallThick, top),
    v(x0, plan.back, top),
    v(x1, plan.back, top),
    v(x0, front * 0.4, plan.walls.left ? top : 0),
    v(x1, front * 0.4, plan.walls.right ? top : 0),
  ].map(cam.at);
  return boxOf(ps);
}

/**
 * The part of the page to show in a space of a given shape: around what the
 * card is about, at the same angle as every other card, never closer than
 * `maxScale` screen pixels to the millimetre and never wider than the room.
 * With nothing in particular to show, the whole room.
 */
export function frameFor(scene: Box, focus: Box | null, space: { w: number; h: number }, maxScale: number): Box {
  const aspect = space.w / Math.max(1, space.h);
  const fit = (b: Box): Box => {
    // Widen or heighten b to the space's shape, about its middle.
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const w = Math.max(b.w, b.h * aspect);
    const h = w / aspect;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };
  const room = focus ? union(scene, focus) : scene;
  const whole = fit(room);
  if (!focus) return whole;
  let crop = fit(focus);
  const least = space.w / maxScale;
  if (crop.w < least) crop = fit({ x: crop.x + crop.w / 2 - least / 2, y: crop.y + crop.h / 2 - least / aspect / 2, w: least, h: least / aspect });
  if (crop.w >= whole.w) return whole;
  // Slide it back over the room where it hangs off the edge.
  const slide = (start: number, extent: number, lo: number, room: number) => (extent >= room ? lo + room / 2 - extent / 2 : Math.min(Math.max(start, lo), lo + room - extent));
  return { x: slide(crop.x, crop.w, room.x, room.w), y: slide(crop.y, crop.h, room.y, room.h), w: crop.w, h: crop.h };
}
