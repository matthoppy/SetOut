/**
 * The tools and the measuring marks: the laser and its lines, the tape
 * measure, and the dimension with its number.
 *
 * Three colours, each with one meaning, the same on every card: the laser's
 * light is red and always glows, so it is never mistaken for an edge; the
 * tape is yellow, as a tape is; and what to measure is drawn in the
 * measuring accent, with arrows at both ends and the number large, where the
 * eye goes first. Physical things are lit by the room's one light.
 */

import type { ReactNode } from 'react';
import { Face, pts, Seg } from './Room';
import { useIso } from './Stage';
import { MM, add, dir, lift, v, type Box, type P, type V3 } from './space';

// ---------------------------------------------------------------------------
// Solid things
// ---------------------------------------------------------------------------

/** A shade of a material for a face, from the light that falls on it. */
const graphite = (light: number) => `hsl(216 11% ${Math.round(11 + light * 25)}%)`;
const yellow = (light: number) => `hsl(45 94% ${Math.round(38 + light * 20)}%)`;

/**
 * A box in the room, square to three directions: u along it, w across it, n
 * up from its base. Only the faces turned to the eye are drawn.
 */
export function Block({ base, u, w, n, su, sw, sn, paint, edge = 'var(--iso-line)' }: { base: V3; u: V3; w: V3; n: V3; su: number; sw: number; sn: number; paint: (light: number, normal: V3) => string; edge?: string }) {
  const { cam } = useIso();
  const c = (a: number, b: number, h: number) => add(add(add(base, u, a * su), w, b * sw), n, h * sn);
  const faces: { normal: V3; ps: V3[] }[] = [
    { normal: n, ps: [c(-0.5, -0.5, 1), c(0.5, -0.5, 1), c(0.5, 0.5, 1), c(-0.5, 0.5, 1)] },
    { normal: v(-u.x, -u.y, -u.z), ps: [c(-0.5, -0.5, 0), c(-0.5, 0.5, 0), c(-0.5, 0.5, 1), c(-0.5, -0.5, 1)] },
    { normal: u, ps: [c(0.5, -0.5, 0), c(0.5, 0.5, 0), c(0.5, 0.5, 1), c(0.5, -0.5, 1)] },
    { normal: v(-w.x, -w.y, -w.z), ps: [c(-0.5, -0.5, 0), c(0.5, -0.5, 0), c(0.5, -0.5, 1), c(-0.5, -0.5, 1)] },
    { normal: w, ps: [c(-0.5, 0.5, 0), c(0.5, 0.5, 0), c(0.5, 0.5, 1), c(-0.5, 0.5, 1)] },
  ];
  return (
    <g>
      {faces
        .filter((f) => cam.facing(f.normal))
        .map((f, i) => (
          <Face key={i} ps={f.ps} fill={paint(cam.light(f.normal), f.normal)} stroke={edge} width={0.8} />
        ))}
    </g>
  );
}

/** The laser's body on its feet, a red window round it where its lines come out. */
export const BODY = { size: 105, tall: 210 };

/** The laser standing at a point, its lines coming out MM.floorBeam above it. */
export function LaserBody({ at: p }: { at: V3 }) {
  const { at } = useIso();
  const e = at(lift(p, p.z + MM.floorBeam));
  const up = v(0, 0, 1);
  return (
    <g>
      <Contact at={p} r={BODY.size * 0.8} />
      <Block base={p} u={v(1, 0)} w={v(0, 1)} n={up} su={BODY.size} sw={BODY.size} sn={BODY.tall} paint={(l, normal) => (normal.z > 0.5 ? graphite(0.95) : graphite(l * 0.85))} />
      <Block base={lift(p, p.z + MM.floorBeam - 22)} u={v(1, 0)} w={v(0, 1)} n={up} su={BODY.size + 6} sw={BODY.size + 6} sn={44} paint={(l) => `hsl(352 32% ${Math.round(14 + l * 14)}%)`} />
      {/* The knob on top that locks the pendulum. */}
      <Block base={lift(p, p.z + BODY.tall)} u={v(1, 0)} w={v(0, 1)} n={up} su={46} sw={46} sn={18} paint={(l) => graphite(0.4 + l * 0.4)} />
      <g className="mw-glow">
        <circle cx={e.x} cy={e.y} r={26} fill="var(--iso-laser)" opacity={0.25} />
        <circle cx={e.x} cy={e.y} r={10} fill="var(--iso-laser-hot)" />
      </g>
    </g>
  );
}

/** A soft shadow on the floor under something standing on it. */
export function Contact({ at: p, r, strength = 0.2 }: { at: V3; r: number; strength?: number }) {
  const { id } = useIso();
  const ps = Array.from({ length: 20 }, (_, i) => add(p, v(Math.cos((i / 20) * Math.PI * 2) * r, Math.sin((i / 20) * Math.PI * 2) * r)));
  return (
    <g filter={`url(#${id('softer')})`} opacity={strength}>
      <Face ps={ps} fill="var(--iso-shadow)" />
    </g>
  );
}

/**
 * The laser on a small tripod, its lines coming out at `level` above the
 * floor: three short legs, and the centre column wound up to height.
 */
export function TripodLaser({ at: p, level }: { at: V3; level: number }) {
  const head = level - MM.floorBeam;
  const hub = Math.min(420, head - 120);
  const feet = [90, 210, 330].map((deg) => add(p, v(Math.cos((deg * Math.PI) / 180) * 280, Math.sin((deg * Math.PI) / 180) * 280)));
  return (
    <g>
      <Contact at={p} r={95} strength={0.16} />
      {feet.map((f, i) => (
        <g key={i}>
          <Contact at={f} r={26} strength={0.22} />
          <Seg a={lift(p, hub)} b={f} stroke="hsl(216 11% 24%)" width={2.4} />
          <Seg a={lift(p, hub)} b={f} stroke="hsl(216 11% 62%)" width={0.6} opacity={0.7} />
        </g>
      ))}
      <Seg a={lift(p, hub - 20)} b={lift(p, head)} stroke="hsl(216 11% 22%)" width={3.4} cap="butt" />
      <Seg a={lift(p, hub - 20)} b={lift(p, head)} stroke="hsl(216 11% 58%)" width={0.8} cap="butt" opacity={0.7} />
      <Block base={lift(p, hub - 50)} u={v(1, 0)} w={v(0, 1)} n={v(0, 0, 1)} su={70} sw={70} sn={60} paint={(l) => graphite(0.2 + l * 0.5)} />
      <LaserBody at={lift(p, head)} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The laser's light
// ---------------------------------------------------------------------------

/**
 * A laser line lit on a surface, from a to b. Light, not an edge: it glows,
 * and where it runs on past what matters it fades away.
 */
export function Beam({ a, b, fade = false, faint = false }: { a: V3; b: V3; fade?: boolean; faint?: boolean }) {
  const { at, id } = useIso();
  const [p, q] = [at(a), at(b)];
  const g = id(`beam-${Math.round(p.x)}-${Math.round(p.y)}-${Math.round(q.x)}-${Math.round(q.y)}`);
  const stroke = fade ? `url(#${g})` : 'var(--iso-laser)';
  return (
    <g opacity={faint ? 0.45 : 1}>
      {fade && (
        <defs>
          <linearGradient id={g} gradientUnits="userSpaceOnUse" x1={p.x} y1={p.y} x2={q.x} y2={q.y}>
            <stop offset="0" stopColor="var(--iso-laser)" />
            <stop offset="0.6" stopColor="var(--iso-laser)" stopOpacity={0.7} />
            <stop offset="1" stopColor="var(--iso-laser)" stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={8} strokeLinecap="round" opacity={0.16} />
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={fade ? stroke : 'var(--iso-laser-hot)'} strokeWidth={0.7} strokeLinecap="round" opacity={0.85} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The tape measure
// ---------------------------------------------------------------------------

/**
 * A tape measure, its blade from the hook at `hook` to its case beyond `end`,
 * lying with its face to `face`. The ticks are the blade's own, every 50mm.
 * `lit` is how far along the blade the laser lights it.
 */
export function Tape({ hook, end, face, lit }: { hook: V3; end: V3; face: V3; lit?: number }) {
  const { at } = useIso();
  const u = dir(hook, end);
  // Across the blade: square to the blade and to its face.
  const w0 = v(u.y * face.z - u.z * face.y, u.z * face.x - u.x * face.z, u.x * face.y - u.y * face.x);
  const wl = Math.hypot(w0.x, w0.y, w0.z) || 1;
  const w = v(w0.x / wl, w0.y / wl, w0.z / wl);
  const half = MM.blade / 2;
  const length = Math.hypot(end.x - hook.x, end.y - hook.y, end.z - hook.z);
  const up = (p: V3) => add(p, face, 3);
  const blade = [add(hook, w, -half), add(end, w, -half), add(end, w, half), add(hook, w, half)].map(up);
  const ticks: ReactNode[] = [];
  for (let s = 50, i = 1; s < length - 10; s += 50, i++) {
    const p = up(add(hook, u, s));
    const k = i % 10 === 0 ? 0.9 : i % 2 === 0 ? 0.5 : 0.3;
    const [a, b] = [at(add(p, w, half)), at(add(p, w, half - MM.blade * k))];
    ticks.push(<line key={s} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--iso-tape-ink)" strokeWidth={i % 2 === 0 ? 0.9 : 0.6} />);
  }
  const caseLen = 110;
  const across = (normal: V3) => Math.abs(normal.x * w.x + normal.y * w.y + normal.z * w.z) > 0.5;
  return (
    <g>
      <Face ps={blade} fill="var(--iso-tape)" stroke="var(--iso-tape-edge)" width={0.9} />
      {ticks}
      {/* The hook, bent square to the blade. */}
      <Face ps={[add(hook, w, -half - 5), add(hook, w, half + 5), add(add(hook, w, half + 5), face, 18), add(add(hook, w, -half - 5), face, 18)].map(up)} fill="hsl(216 10% 34%)" stroke="var(--iso-line)" width={0.8} />
      <Block base={add(end, u, caseLen / 2)} u={u} w={w} n={face} su={caseLen} sw={60} sn={caseLen} paint={(l, normal) => (across(normal) ? yellow(l) : graphite(l))} />
      {lit !== undefined && <Beam a={up(add(add(hook, u, lit), w, -half - 22))} b={up(add(add(hook, u, lit), w, half + 22))} />}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The measuring marks, drawn at a fixed size on the screen
// ---------------------------------------------------------------------------

/** Where the tape starts: a solid point. */
export function StartPoint({ at: p }: { at: P }) {
  const { px } = useIso();
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={px(7)} fill="var(--iso-paper)" opacity={0.95} />
      <circle cx={p.x} cy={p.y} r={px(4.2)} fill="var(--iso-ink)" />
    </g>
  );
}

/** Where the number is read: a ring, red where the laser lights the blade. */
export function ReadPoint({ at: p, laser }: { at: P; laser: boolean }) {
  const { px } = useIso();
  const tone = laser ? 'var(--iso-laser)' : 'var(--iso-ink)';
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={px(14)} fill={tone} opacity={0.18} className="mw-pulse" />
      <circle cx={p.x} cy={p.y} r={px(8)} fill="var(--iso-paper)" stroke={tone} strokeWidth={2.4} />
      <circle cx={p.x} cy={p.y} r={px(3.2)} fill={tone} />
    </g>
  );
}

/** A filled arrowhead with its point at `tip`, coming from `from`. */
function Arrow({ tip, from }: { tip: P; from: P }) {
  const { px } = useIso();
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / d, dy / d];
  const [L, H] = [px(9.5), px(3.8)];
  const back = { x: tip.x - ux * L, y: tip.y - uy * L };
  return <polygon points={pts([tip, { x: back.x - uy * H, y: back.y + ux * H }, { x: back.x + uy * H, y: back.y - ux * H }])} fill="var(--iso-ink)" />;
}

/** A circle on the page, such as the lens, that a label must stay inside. */
export interface Circle {
  c: P;
  r: number;
}

/** The size of the number's label on the screen, in pixels. */
const valueSize = (value: number | null) => {
  const text = value === null ? '?' : String(value);
  return { text, w: 16 + text.length * 9.8 + 4 + 23, h: 30 };
};

/**
 * What to measure, as a draughtsman draws it: a line beside the measurement
 * with an arrow at each end against a short line from each end point, and
 * the number on it. Where the line is too short to hold the number, the
 * number stands beside it.
 */
export function Dimension({ from, to, off, by, value, project, inside, avoid = [] }: { from: V3; to: V3; off: V3; by: number; value?: number | null; project?: (p: V3) => P; inside?: Circle; avoid?: Box[] }) {
  const iso = useIso();
  const { px, view } = iso;
  const at = project ?? iso.at;
  const [a, b] = [add(from, off, by), add(to, off, by)];
  const [pa, pb] = [at(a), at(b)];
  const ext = (p: V3) => [at(add(p, off, by * 0.15)), at(add(p, off, by * 1.2))] as const;
  const [ea, eb] = [ext(from), ext(to)];
  const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const long = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  let label: ReactNode = null;
  if (value !== undefined) {
    const size = valueSize(value);
    const [w, h] = [px(size.w), px(size.h)];
    // The points themselves stay in sight, whatever else must be kept clear.
    const keep = [...avoid, ...[at(from), at(to)].map((q) => ({ x: q.x - px(16), y: q.y - px(16), w: px(32), h: px(32) }))];
    const m = px(6);
    // How badly a label here would sit: off the page, outside the lens, or over the points or the laser.
    const clash = (p: P) => {
      const box = { x: p.x - w / 2, y: p.y - h / 2, w, h };
      let bad = 0;
      const out = Math.max(0, view.x + m - box.x) + Math.max(0, view.y + m - box.y) + Math.max(0, box.x + box.w - (view.x + view.w - m)) + Math.max(0, box.y + box.h - (view.y + view.h - m));
      bad += out * h * 4;
      if (inside) bad += Math.max(0, Math.hypot(p.x - inside.c.x, p.y - inside.c.y) - (inside.r - m - Math.hypot(w / 2, h / 2))) * h * 4;
      for (const o of keep) {
        const ox = Math.max(0, Math.min(box.x + box.w, o.x + o.w) - Math.max(box.x, o.x));
        const oy = Math.max(0, Math.min(box.y + box.h, o.y + o.h) - Math.max(box.y, o.y));
        bad += ox * oy;
      }
      return bad;
    };
    // On the line where it is long enough, nearest the middle first; else beside it, away from what was measured first.
    const onLine = long >= px(size.w + 34) ? [0.5, 0.36, 0.64, 0.24, 0.76].map((t) => ({ x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t })) : [];
    const o = at(add(add(from, to, 1), off, by * 2));
    const base = at(add(from, to, 1));
    const d = Math.hypot(o.x - base.x, o.y - base.y) || 1;
    const [dx, dy] = [(o.x - base.x) / d, (o.y - base.y) / d];
    const reach = px(size.h / 2 + 10) + Math.abs(dx * px(size.w / 2));
    const beside = [1, 1.6, 2.3, -1, -1.6, -2.3].flatMap((k) => [0, 0.6, -0.6].map((slide) => ({ x: mid.x + dx * reach * k + (pb.x - pa.x) * slide * 0.5, y: mid.y + dy * reach * k + (pb.y - pa.y) * slide * 0.5 })));
    // The first place with nothing in the way; failing that, the place where least is.
    const all = [...onLine, ...beside];
    const spot = all.find((q) => clash(q) === 0) ?? [...all].sort((a, b) => clash(a) - clash(b))[0];
    const on = onLine.includes(spot);
    label = <Value at={spot} value={value} leader={on ? undefined : mid} inside={inside} />;
  }
  return (
    <g>
      <line x1={ea[0].x} y1={ea[0].y} x2={ea[1].x} y2={ea[1].y} stroke="var(--iso-ink)" strokeWidth={1} opacity={0.7} />
      <line x1={eb[0].x} y1={eb[0].y} x2={eb[1].x} y2={eb[1].y} stroke="var(--iso-ink)" strokeWidth={1} opacity={0.7} />
      <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="var(--iso-ink)" strokeWidth={1.5} />
      <Arrow tip={pa} from={mid} />
      <Arrow tip={pb} from={mid} />
      {label}
    </g>
  );
}

/** The number being asked for, large, on the measuring accent. A question mark until it is typed. */
export function Value({ at: p0, value, leader, inside }: { at: P; value: number | null; leader?: P; inside?: Circle }) {
  const { px, id, view } = useIso();
  const size = valueSize(value);
  const fs = px(16.5);
  const unit = px(12.5);
  const w = px(size.w);
  const h = px(size.h);
  const m = px(8);
  let p = { x: Math.min(Math.max(p0.x, view.x + w / 2 + m), view.x + view.w - w / 2 - m), y: Math.min(Math.max(p0.y, view.y + h / 2 + m), view.y + view.h - h / 2 - m) };
  if (inside) {
    // Pulled in towards the middle of the circle until its far corner is inside it.
    const reach = inside.r - m - Math.hypot(w / 2, h / 2);
    const dx = p.x - inside.c.x;
    const dy = p.y - inside.c.y;
    const d = Math.hypot(dx, dy);
    if (d > reach) p = { x: inside.c.x + (dx / d) * Math.max(0, reach), y: inside.c.y + (dy / d) * Math.max(0, reach) };
  }
  return (
    <g className="mw-value">
      {leader && <line x1={p.x} y1={p.y} x2={leader.x} y2={leader.y} stroke="var(--iso-ink)" strokeWidth={1.2} />}
      <g filter={`url(#${id('lift')})`}>
        <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={h / 2} fill="var(--iso-ink)" />
      </g>
      <text x={p.x - w / 2 + px(11)} y={p.y + fs * 0.36} fontSize={fs} fontWeight={700} fill="var(--iso-ink-text)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {size.text}
        <tspan fontSize={unit} fontWeight={600} dx={px(3)} opacity={0.75}>
          mm
        </tspan>
      </text>
    </g>
  );
}

/** A few words on the picture, pointing at what they name. */
export function Note({ at: p0, to, text }: { at: P; to?: P; text: string }) {
  const { px, view } = useIso();
  const fs = px(13);
  const w = px(text.length * 7 + 20);
  const h = px(26);
  const m = px(8);
  const p = { x: Math.min(Math.max(p0.x, view.x + w / 2 + m), view.x + view.w - w / 2 - m), y: Math.min(Math.max(p0.y, view.y + h / 2 + m), view.y + view.h - h / 2 - m) };
  return (
    <g>
      {to && <line x1={p.x} y1={p.y} x2={to.x} y2={to.y} stroke="var(--iso-ink)" strokeWidth={1.1} />}
      {to && <circle cx={to.x} cy={to.y} r={px(2.8)} fill="var(--iso-ink)" />}
      <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={px(7)} fill="var(--iso-paper)" stroke="var(--iso-ink)" strokeOpacity={0.22} strokeWidth={1} />
      <text x={p.x} y={p.y + fs * 0.35} fontSize={fs} fontWeight={600} fill="var(--iso-ink)" textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
