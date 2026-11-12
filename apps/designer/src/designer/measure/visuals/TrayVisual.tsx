/**
 * The shower area seen from the front and a little above, as a glazier sees
 * it when setting out: the tray on the floor, the walls behind it, the glass
 * lines along its edges, and the laser standing where the card says, its
 * lines along the floor and up the walls, with the tape where the reading is
 * taken. Matt, 12 November 2026, with a photo of a laser set up in the corner
 * of a tray: the face-on drawing "doesn't look good, it needs to show the
 * tray".
 *
 * Only the reading being taken carries its circled number: with the whole
 * shower in view, the readings already taken would crowd its ends. The
 * drawing at the end shows every one.
 *
 * Every layout measured a run at a time is drawn this way, except a screen
 * over a bath, which stands on the bath rim, and a shape built by hand that
 * is not a front with a side at either end. A single door keeps the face-on
 * pictures that were signed off with its deck.
 *
 * The drawing is not to scale. Every layout sits on the same tray, so a card
 * says where to measure, never what the answer should be.
 */

import type { RunView } from '@setout/engine';
import type { RunPicture } from './RunVisual';
import { ACCENT, BG, FONT, FOREGROUND, Frame, INK, LASER, MARK, MASK, MASK_EDGE, PointMark, TAPE, TAPE_DARK, WALL, WALL_EDGE } from './Scene';

/** A point in the room: x along the front, y into the shower, z up, in drawing units. */
interface V3 {
  x: number;
  y: number;
  z: number;
}
interface P {
  x: number;
  y: number;
}

/** The tray along the front, its depth, and the walls as far as they are drawn. */
const W = 196;
const D = 112;
const H = 128;
/** The top of the glass, the laser's level line, and a wall's 50mm drawn big enough to see. */
const GLASS_Z = 96;
const LEVEL_Z = 56;
const OFF = 40;
/** The tape lies on the floor just outside the glass line. */
const OUT = 7;
/** How depth recedes on the page. */
const KX = 0.46;
const KY = 0.5;

interface TrayRun {
  view: RunView;
  /** Its glass line, from its left end to its right end as seen from outside the shower. */
  a: V3;
  b: V3;
  /** Which way is outside the shower, square to the glass. */
  out: V3;
}

export interface TrayPlan {
  /** -1: depth recedes up to the left, the room seen from the front left. 1: up to the right. */
  s: 1 | -1;
  ox: number;
  oy: number;
  runs: TrayRun[];
  walls: { left: boolean; right: boolean };
}

const v = (x: number, y: number, z = 0): V3 => ({ x, y, z });
const add = (p: V3, q: V3, k = 1): V3 => v(p.x + q.x * k, p.y + q.y * k, p.z + q.z * k);
const along = (p: V3, q: V3, t: number): V3 => v(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t);
const unit = (p: V3, q: V3): V3 => {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return v((q.x - p.x) / len, (q.y - p.y) / len, 0);
};
const lift = (p: V3, z: number): V3 => v(p.x, p.y, z);

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

/** Where everything stands, for a shower trayable says can be drawn. */
export function planFor(views: RunView[]): TrayPlan {
  const front = views.find((w) => w.faces === 'front')!;
  const leftSide = views.some((w) => w.faces === 'left');
  const rightSide = views.some((w) => w.faces === 'right');
  const walls = { left: front.left === 'wall' && !leftSide, right: front.right === 'wall' && !rightSide };
  // Look from the side without a wall, so the wall that matters faces us.
  const s: 1 | -1 = walls.left && !walls.right ? 1 : -1;
  const runs = views.map((view): TrayRun => {
    if (view.faces === 'left') return { view, a: v(0, D), b: v(0, 0), out: v(-1, 0) };
    if (view.faces === 'right') return { view, a: v(W, 0), b: v(W, view.right === 'open' ? D * 0.55 : D), out: v(1, 0) };
    // The front. An open end stops short, and the tray runs on past it: the way in.
    return { view, a: v(view.left === 'open' ? W * 0.38 : 0, 0), b: v(view.right === 'open' && !rightSide ? W * 0.62 : W, 0), out: v(0, -1) };
  });
  return { s, ox: s === -1 ? 92 : 34, oy: 210, runs, walls };
}

function projector(plan: TrayPlan) {
  return (p: V3): P => ({ x: plan.ox + p.x + plan.s * p.y * KX, y: plan.oy - p.y * KY - p.z });
}

const pts = (ps: P[]) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

function Room({ plan, ceiling }: { plan: TrayPlan; ceiling: boolean }) {
  const P3 = projector(plan);
  const x0 = plan.walls.left ? 0 : -60;
  const x1 = plan.walls.right ? W : W + 60;
  const floor = [v(x0, -60), v(x1, -60), v(x1, D), v(x0, D)].map(P3);
  const back = [v(x0, D), v(x1, D), v(x1, D, H), v(x0, D, H)].map(P3);
  // A wall at a side stands from the front of the room to the back wall.
  const side = (x: number) => [v(x, -40), v(x, D), v(x, D, H), v(x, -40, H)].map(P3);
  // The side wall nearest the eye is drawn faint, so the tray shows through it.
  const near = (which: 'left' | 'right') => (plan.s === -1 ? which === 'left' : which === 'right');
  const tray = [v(0, 0, 3), v(W, 0, 3), v(W, D, 3), v(0, D, 3)].map(P3);
  const lip = [v(0, 0, 0), v(W, 0, 0), v(W, 0, 3), v(0, 0, 3)].map(P3);
  return (
    <g>
      <polygon points={pts(floor)} fill={FOREGROUND} />
      <polygon points={pts(back)} fill={WALL} stroke={WALL_EDGE} strokeWidth={1.2} />
      {ceiling && <polyline points={pts([back[3], back[2]])} fill="none" stroke={WALL_EDGE} strokeWidth={1.6} />}
      {(['left', 'right'] as const).map((which) =>
        plan.walls[which] ? (
          <polygon
            key={which}
            points={pts(side(which === 'left' ? 0 : W))}
            fill={WALL}
            fillOpacity={near(which) ? 0.45 : 1}
            stroke={WALL_EDGE}
            strokeWidth={1.2}
            strokeDasharray={near(which) ? '4 3' : undefined}
          />
        ) : null
      )}
      <polygon points={pts(lip)} fill={WALL_EDGE} opacity={0.5} />
      <polygon points={pts(tray)} fill={BG} stroke={WALL_EDGE} strokeWidth={1.2} />
    </g>
  );
}

function GlassLines({ plan, lit }: { plan: TrayPlan; lit: number | null }) {
  const P3 = projector(plan);
  return (
    <g>
      {plan.runs.map((r) => {
        const [a, b] = [P3(lift(r.a, 3)), P3(lift(r.b, 3))];
        const on = lit === r.view.run;
        return <line key={r.view.run} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ACCENT} strokeWidth={on ? 2 : 1.3} strokeDasharray="5 4" opacity={on ? 1 : 0.6} />;
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The laser
// ---------------------------------------------------------------------------

function Beam({ from, to, faint = false }: { from: P; to: P; faint?: boolean }) {
  return (
    <g opacity={faint ? 0.4 : 1}>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={LASER} strokeWidth={6} opacity={0.16} />
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={LASER} strokeWidth={1.5} />
    </g>
  );
}

/** The laser standing on the floor, its lines going out four ways. */
function FloorLaser({ at }: { at: P }) {
  return (
    <g>
      <rect x={at.x - 7} y={at.y - 13} width={14} height={14} rx={2.5} fill={BG} stroke={INK} strokeWidth={1.4} />
      <rect x={at.x - 7} y={at.y - 13} width={14} height={4} rx={2} fill={INK} opacity={0.75} />
      <circle cx={at.x} cy={at.y - 4} r={2.6} fill={LASER} stroke={INK} strokeWidth={0.8} className="mw-glow" />
    </g>
  );
}

/** The laser on its little tripod, its head at the level line. */
function TripodLaser({ head, feet }: { head: P; feet: P }) {
  return (
    <g>
      <line x1={head.x} y1={head.y + 8} x2={feet.x - 13} y2={feet.y} stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={head.x} y1={head.y + 8} x2={feet.x + 13} y2={feet.y} stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={head.x} y1={head.y + 8} x2={feet.x + 2} y2={feet.y - 7} stroke={INK} strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
      <rect x={head.x - 8} y={head.y - 7} width={16} height={13} rx={2.5} fill={BG} stroke={INK} strokeWidth={1.4} />
      <circle cx={head.x} cy={head.y} r={2.6} fill={LASER} stroke={INK} strokeWidth={0.8} className="mw-glow" />
    </g>
  );
}

/** The ends of the glass line that meets a corner, and whether each is a wall. */
function runsAt(plan: TrayPlan, corner: V3) {
  const same = (p: V3, q: V3) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  return plan.runs.flatMap((r) => {
    if (same(r.a, corner)) return [{ far: r.b, wall: r.view.right === 'wall' }];
    if (same(r.b, corner)) return [{ far: r.a, wall: r.view.left === 'wall' }];
    return [];
  });
}

/** The laser over a corner mark: a line along each glass line to the wall it meets, and up that wall. */
function CornerLaser({ plan, corner }: { plan: TrayPlan; corner: V3 }) {
  const P3 = projector(plan);
  const at = P3(lift(corner, 3));
  const ways = runsAt(plan, corner);
  return (
    <g>
      {ways.map(({ far, wall }, i) => {
        const u = unit(corner, far);
        return (
          <g key={i}>
            <Beam from={at} to={P3(lift(far, 3))} />
            {/* Out past the laser too: its lines go four ways. */}
            <Beam from={at} to={P3(lift(add(corner, u, -34), 3))} faint />
            {wall && <Beam from={P3(lift(far, 3))} to={P3(lift(far, H - 6))} />}
          </g>
        );
      })}
      <FloorLaser at={P3(corner)} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The tape
// ---------------------------------------------------------------------------

/** A tape measure from its hook to its body, at any angle on the page, with the number once it is typed. */
function Tape({ hook, body, value, lit, labelAt }: { hook: P; body: P; value: string; lit?: P; labelAt: P }) {
  const dx = body.x - hook.x;
  const dy = body.y - hook.y;
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const [nx, ny] = [-uy, ux];
  const w = 4.3;
  const band = [
    { x: hook.x + nx * w, y: hook.y + ny * w },
    { x: body.x + nx * w, y: body.y + ny * w },
    { x: body.x - nx * w, y: body.y - ny * w },
    { x: hook.x - nx * w, y: hook.y - ny * w },
  ];
  const ticks = Math.floor(len / 7);
  return (
    <g>
      <polygon points={pts(band)} fill={TAPE} stroke={TAPE_DARK} strokeWidth={0.7} />
      {Array.from({ length: ticks }, (_, i) => {
        const t = (i + 1) * 7;
        const major = i % 5 === 4;
        const p = { x: hook.x + ux * t, y: hook.y + uy * t };
        return <line key={i} x1={p.x + nx * w} y1={p.y + ny * w} x2={p.x + nx * (w - (major ? 4.3 : 2.2))} y2={p.y + ny * (w - (major ? 4.3 : 2.2))} stroke={TAPE_DARK} strokeWidth={0.6} />;
      })}
      {/* The hook, square to the blade. */}
      <line x1={hook.x + nx * 6.5} y1={hook.y + ny * 6.5} x2={hook.x - nx * 6.5} y2={hook.y - ny * 6.5} stroke={INK} strokeWidth={3} />
      {/* The body. */}
      <rect x={body.x + ux * 8 - 9} y={body.y + uy * 8 - 9} width={18} height={18} rx={4} fill={BG} stroke={INK} strokeWidth={1.4} />
      {lit && (
        <g className="mw-appear">
          <circle cx={lit.x} cy={lit.y} r={7} fill={LASER} opacity={0.22} />
          <circle cx={lit.x} cy={lit.y} r={2.2} fill={LASER} />
        </g>
      )}
      <g className="mw-appear">
        <rect x={labelAt.x - 27} y={labelAt.y - 10} width={54} height={20} rx={3} fill={ACCENT} />
        <text x={labelAt.x} y={labelAt.y + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" fontFamily={FONT}>
          {value}
        </text>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Each reading
// ---------------------------------------------------------------------------

interface Reading {
  /** The tape from its hook to its body, in the room. */
  hook: V3;
  body: V3;
  lit?: V3;
  /** Where the number goes, and the circled number of a reading already taken. */
  label: V3;
  mark: V3;
  run: number;
  words: string;
  laser: { kind: 'corner'; corner: V3 } | { kind: 'level'; run: TrayRun } | { kind: 'upright'; on: V3; wallDir: V3; foot: V3 } | null;
  ceiling?: boolean;
}

function readingOf(plan: TrayPlan, visual: RunPicture): Reading | null {
  const r = plan.runs[visual.view.run];
  if (!r) return null;
  const run = r.view.run;
  const outside = (p: V3, k = OUT) => add(p, r.out, k);
  // A circled number sits just inside the glass line, on the tray.
  const inside = (p: V3) => add(p, r.out, -15);
  switch (visual.kind) {
    case 'run-width': {
      if (visual.laser) {
        const [at, from] = visual.laser === 'left' ? [r.a, r.b] : [r.b, r.a];
        const body = outside(at);
        return { hook: outside(from), body, lit: body, label: outside(along(from, at, 0.5), 30), mark: inside(along(from, at, 0.5)), run, words: 'from the far end of the glass to the laser at the corner', laser: { kind: 'corner', corner: at } };
      }
      const fromRight = r.view.right === 'wall' && r.view.left !== 'wall';
      const [near, far] = fromRight ? [r.b, r.a] : [r.a, r.b];
      return { hook: outside(near), body: outside(far), label: outside(along(near, far, 0.5), 30), mark: inside(along(near, far, 0.5)), run, words: 'along the floor from one end of the glass to the other', laser: null };
    }
    case 'tray-width':
      return { hook: outside(v(0, 0), 22), body: outside(v(W, 0), 22), label: outside(v(W * 0.5, 0), 42), mark: inside(v(W * 0.8, 0)), run, words: 'from the wall to the far edge of the tray', laser: null };
    case 'run-floor':
    case 'run-ceiling': {
      const end = visual.side === 'left' ? r.a : r.b;
      const foot = along(end, visual.side === 'left' ? r.b : r.a, 0.08);
      const top = visual.kind === 'run-floor' ? LEVEL_Z : H - 2;
      return {
        hook: outside(foot, 4),
        body: outside(lift(foot, top), 4),
        lit: visual.kind === 'run-floor' ? outside(lift(foot, top), 4) : undefined,
        // Beside the tape, along the glass, so it never sits on the blade.
        label: add(add(lift(foot, top * 0.55), unit(foot, visual.side === 'left' ? r.b : r.a), 44), r.out, -6),
        mark: outside(foot, 16),
        run,
        words: visual.kind === 'run-floor' ? 'from the floor up to the level line' : 'from the floor straight up to the ceiling',
        laser: visual.kind === 'run-floor' ? { kind: 'level', run: r } : null,
        ceiling: visual.kind === 'run-ceiling',
      };
    }
    case 'wall-gap': {
      const [wallEnd, other] = visual.side === 'left' ? [r.a, r.b] : [r.b, r.a];
      const into = unit(wallEnd, other);
      const on = add(wallEnd, into, OFF);
      const z = visual.at === 'bottom' ? 0 : visual.toCeiling ? H - 8 : GLASS_Z;
      const [hook, body] = [outside(lift(wallEnd, z), 3), outside(lift(on, z), 3)];
      return {
        hook,
        body,
        lit: body,
        label: add(lift(along(wallEnd, on, 0.6), z + (visual.at === 'bottom' ? 0 : 14)), r.out, -46),
        mark: outside(lift(along(wallEnd, on, 0.5), visual.at === 'bottom' ? 0 : z), 16),
        run,
        words: `from the wall to the laser line, at the ${visual.at}`,
        laser: { kind: 'upright', on, wallDir: v(-into.y, into.x), foot: add(on, r.out, 30) },
      };
    }
    default:
      return null;
  }
}

function LaserFor({ plan, reading, ceiling }: { plan: TrayPlan; reading: Reading; ceiling: boolean }) {
  const P3 = projector(plan);
  const laser = reading.laser;
  if (!laser) return null;
  if (laser.kind === 'corner') return <CornerLaser plan={plan} corner={laser.corner} />;
  if (laser.kind === 'level') {
    const r = laser.run;
    const mid = along(r.a, r.b, 0.5);
    const head = P3(add(lift(mid, LEVEL_Z), r.out, 28));
    const feet = P3(add(mid, r.out, 28));
    return (
      <g>
        <Beam from={P3(lift(add(r.a, unit(r.b, r.a), 10), LEVEL_Z))} to={P3(lift(add(r.b, unit(r.a, r.b), 10), LEVEL_Z))} />
        <Beam from={head} to={P3(lift(mid, LEVEL_Z))} faint />
        <TripodLaser head={head} feet={feet} />
      </g>
    );
  }
  // The up-and-down line stood off a wall: a line on the floor along the
  // wall, and up through the glass line.
  const top = ceiling ? H - 4 : H - 10;
  return (
    <g>
      <Beam from={P3(add(laser.on, laser.wallDir, -60))} to={P3(add(laser.on, laser.wallDir, 60))} />
      <Beam from={P3(laser.on)} to={P3(lift(laser.on, top))} />
      <FloorLaser at={P3(laser.foot)} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The pictures
// ---------------------------------------------------------------------------

/** A reading on a shower drawn on its tray. */
export function TrayReading({ visual, views, value, mark }: { visual: RunPicture; views: RunView[]; value: number | null; mark?: number }) {
  const plan = planFor(views);
  const P3 = projector(plan);
  const reading = readingOf(plan, visual);
  if (!reading) return null;
  const ceiling = !!reading.ceiling || (visual.kind === 'wall-gap' && visual.toCeiling);
  return (
    <Frame label={`Measuring ${reading.words}`}>
      <Room plan={plan} ceiling={ceiling} />
      <GlassLines plan={plan} lit={reading.run} />
      <LaserFor plan={plan} reading={reading} ceiling={ceiling} />
      <Tape hook={P3(reading.hook)} body={P3(reading.body)} value={value === null ? '?' : `${value}mm`} lit={reading.lit ? P3(reading.lit) : undefined} labelAt={P3(reading.label)} />
      {mark !== undefined && (
        <g className="mw-appear">
          <PointMark x={P3(reading.mark).x} y={P3(reading.mark).y} n={mark} lit />
        </g>
      )}
    </Frame>
  );
}

/** The laser switched on where the first reading needs it: over a corner mark, or in front of the glass. */
export function TrayLaserOn({ views, corner }: { views: RunView[]; corner: { run: number; end: 'left' | 'right' } | null }) {
  const plan = planFor(views);
  const P3 = projector(plan);
  const r = corner ? plan.runs[corner.run] : null;
  const at = r ? (corner!.end === 'left' ? r.a : r.b) : null;
  const front = plan.runs.find((x) => x.view.faces === 'front')!;
  return (
    <Frame label={at ? 'The laser on the floor over the corner mark, its lines along both glass lines to the walls' : 'The laser on a small tripod in front of the glass line, with its lines switched on'}>
      <Room plan={plan} ceiling={false} />
      <GlassLines plan={plan} lit={null} />
      {at ? (
        <CornerLaser plan={plan} corner={at} />
      ) : (
        <LaserFor plan={plan} reading={{ hook: front.a, body: front.b, label: front.a, mark: front.a, run: front.view.run, words: '', laser: { kind: 'level', run: front } }} ceiling={false} />
      )}
      {at && (
        <g className="mw-appear">
          <text x={P3(at).x + 58} y={P3(at).y + 17} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={ACCENT} fontFamily={FONT}>
            over the corner mark
          </text>
        </g>
      )}
    </Frame>
  );
}

/** The height of the glass: tape on the wall with the top marked on it, and the tape measure read up to it. */
export function TrayHeight({ views, value, what }: { views: RunView[]; value: number | null; what: 'glass' | 'screen' }) {
  const plan = planFor(views);
  const P3 = projector(plan);
  // The mark goes on a wall: the first end of the glass that meets one.
  const r = plan.runs.find((x) => x.view.left === 'wall') ?? plan.runs.find((x) => x.view.right === 'wall') ?? plan.runs[0];
  const [wallEnd, other] = r.view.left === 'wall' ? [r.a, r.b] : [r.b, r.a];
  const foot = add(wallEnd, unit(wallEnd, other), 12);
  const into = unit(wallEnd, other);
  const markAt = (z: number) => P3(lift(add(wallEnd, into, 0.5), z));
  const m = markAt(GLASS_Z);
  return (
    <Frame label={`A marker line on tape stuck to the wall at the height of the ${what}, and a tape measure reading up to it`}>
      <Room plan={plan} ceiling={false} />
      <GlassLines plan={plan} lit={r.view.run} />
      <rect x={m.x - 9} y={m.y - 8} width={18} height={16} rx={1} fill={MASK} stroke={MASK_EDGE} strokeWidth={0.6} />
      <line x1={m.x - 7} y1={m.y} x2={m.x + 7} y2={m.y} stroke={MARK} strokeWidth={2} strokeLinecap="round" />
      <Tape hook={P3(add(foot, r.out, 4))} body={P3(add(lift(foot, GLASS_Z), r.out, 4))} value={value === null ? '?' : `${value}mm`} labelAt={P3(add(lift(foot, GLASS_Z * 0.5), r.out, 34))} />
      <g className="mw-appear">
        <text x={m.x} y={m.y - 14} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={ACCENT} fontFamily={FONT}>
          top of the {what}
        </text>
      </g>
    </Frame>
  );
}
