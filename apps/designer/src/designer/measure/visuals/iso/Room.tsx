/**
 * The bathroom: the floor, the walls, the tray or the bath, the masking tape
 * marks and the glass that will stand on them.
 *
 * Drawn as a technical illustration is (Matt's references, 12 November
 * 2026): every edge a fine dark line, every surface a flat plane of white or
 * light grey, the walls cut away with their thickness showing, a tiled floor,
 * and pale glass with a few thin lines of reflection. One light falls from
 * above the eye's left shoulder, so the faces turned to it are white and the
 * others a shade greyer. Nothing in the room is drawn in the colours the
 * measuring is drawn in, so the laser and the tape always stand out from it.
 */

import { Fragment, useContext } from 'react';
import { GlassShown, useIso } from './Stage';
import { MM, add, along, dir, glassTop, lift, roomTop, v, type P, type Pane, type Run, type V3 } from './space';

export const pts = (ps: P[]) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** The weight of an object's outline, and of the finer lines inside it, in screen pixels. */
export const LINE = 1.05;
export const FINE = 0.6;

/** A flat face in the room, given its corners. */
export function Face({ ps, fill, stroke, width = LINE, opacity, className }: { ps: V3[]; fill: string; stroke?: string; width?: number; opacity?: number; className?: string }) {
  const { at } = useIso();
  return <polygon points={pts(ps.map(at))} fill={fill} stroke={stroke} strokeWidth={stroke ? width : undefined} strokeLinejoin="round" opacity={opacity} className={className} />;
}

/** A straight line in the room. */
export function Seg({ a, b, stroke, width = LINE, opacity, cap = 'round' }: { a: V3; b: V3; stroke: string; width?: number; opacity?: number; cap?: 'round' | 'butt' }) {
  const { at } = useIso();
  const [p, q] = [at(a), at(b)];
  return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={stroke} strokeWidth={width} strokeLinecap={cap} opacity={opacity} />;
}

// ---------------------------------------------------------------------------
// The floor and the walls
// ---------------------------------------------------------------------------

const TILE = 600;

export function Floor() {
  const { plan, at, id } = useIso();
  const { x0, x1 } = plan.room;
  const y0 = -MM.apron;
  const y1 = plan.back;
  const fade = id('floorfade');
  const mask = id('floormask');
  // The floor fades into the page at the front and the open sides.
  const c = at(v((x0 + x1) / 2, plan.back * 0.45));
  const far = Math.max(...[v(x0, y0), v(x1, y0), v(x0, y1), v(x1, y1)].map((p) => Math.hypot(at(p).x - c.x, at(p).y - c.y)));
  const joints: [V3, V3][] = [];
  for (let x = Math.ceil(x0 / TILE) * TILE; x < x1; x += TILE) joints.push([v(x, y0), v(x, y1)]);
  for (let y = plan.back - TILE; y > y0; y -= TILE) joints.push([v(x0, y), v(x1, y)]);
  return (
    <g>
      <defs>
        <radialGradient id={fade} gradientUnits="userSpaceOnUse" cx={c.x} cy={c.y} r={far}>
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="0.98" stopColor="#000" />
        </radialGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x={c.x - far} y={c.y - far} width={far * 2} height={far * 2}>
          <rect x={c.x - far} y={c.y - far} width={far * 2} height={far * 2} fill={`url(#${fade})`} />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <Face ps={[v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)]} fill="var(--iso-floor)" />
        {joints.map(([a, b], i) => (
          <Seg key={i} a={a} b={b} stroke="var(--iso-floor-joint)" width={FINE} />
        ))}
      </g>
    </g>
  );
}

/** Shade on the floor along the foot of each wall, and in its corners. */
export function WallShade() {
  const { plan, id } = useIso();
  const { x0, x1 } = plan.room;
  const reach = 260;
  const strips: { ps: V3[]; from: V3; to: V3 }[] = [{ ps: [v(x0, plan.back), v(x1, plan.back), v(x1, plan.back - reach), v(x0, plan.back - reach)], from: v((x0 + x1) / 2, plan.back), to: v((x0 + x1) / 2, plan.back - reach) }];
  if (plan.walls.left) strips.push({ ps: [v(0, plan.back), v(0, -MM.apron * 0.4), v(reach, -MM.apron * 0.4), v(reach, plan.back)], from: v(0, plan.back / 2), to: v(reach, plan.back / 2) });
  if (plan.walls.right) {
    const W = plan.room.x1;
    strips.push({ ps: [v(W, plan.back), v(W, -MM.apron * 0.4), v(W - reach, -MM.apron * 0.4), v(W - reach, plan.back)], from: v(W, plan.back / 2), to: v(W - reach, plan.back / 2) });
  }
  return (
    <g>
      {strips.map((s, i) => (
        <Shade key={i} id={id(`ao${i}`)} ps={s.ps} from={s.from} to={s.to} />
      ))}
    </g>
  );
}

function Shade({ id, ps, from, to, z = 0 }: { id: string; ps: V3[]; from: V3; to: V3; z?: number }) {
  const { at } = useIso();
  const [a, b] = [at(lift(from, z)), at(lift(to, z))];
  return (
    <g>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
          <stop offset="0" stopColor="var(--iso-shadow)" stopOpacity={0.08} />
          <stop offset="1" stopColor="var(--iso-shadow)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <Face ps={ps.map((p) => lift(p, z))} fill={`url(#${id})`} />
    </g>
  );
}

/** One wall's face toward the shower: a flat plane with a fine outline. */
function WallFace({ base, run, top, fill }: { base: V3; run: V3; top: number; fill: string }) {
  const end = add(base, run);
  return <Face ps={[base, end, lift(end, top), lift(base, top)]} fill={fill} stroke="var(--iso-line)" />;
}

/** The walls behind the shower: the back wall and a side wall where the glass meets one, cut off at the top. */
export function Walls({ near = false }: { near?: boolean }) {
  const { plan } = useIso();
  const top = roomTop(plan);
  const T = MM.wallThick;
  const { x0, x1 } = plan.room;
  const front = -MM.apron * 0.4;
  const B = plan.back;
  const W = plan.room.x1;
  // The near wall, when the shower has a wall at both ends, is drawn on its own, see-through.
  if (near) {
    if (!plan.near) return null;
    const x = plan.near === 'left' ? 0 : W;
    const s = plan.near === 'left' ? -1 : 1;
    return (
      <g opacity={0.28}>
        <Face ps={[v(x, front), v(x, B), v(x, B, top), v(x, front, top)]} fill="var(--iso-wall-lit)" stroke="var(--iso-line)" />
        <Face ps={[v(x, front, top), v(x, B + T, top), v(x + s * T, B + T, top), v(x + s * T, front, top)]} fill="var(--iso-cut)" stroke="var(--iso-line)" />
      </g>
    );
  }
  const side = (which: 'left' | 'right') => plan.walls[which] && plan.near !== which;
  return (
    <g>
      <WallFace base={v(x0, B)} run={v(x1 - x0, 0)} top={top} fill="var(--iso-wall-shade)" />
      {side('left') && <WallFace base={v(0, front)} run={v(0, B - front)} top={top} fill="var(--iso-wall-lit)" />}
      {side('right') && <WallFace base={v(W, B)} run={v(0, front - B)} top={top} fill="var(--iso-wall-lit)" />}
      {/* The cut along the top of the walls, and the wall's end where the room is cut short. */}
      <Face ps={[v(side('left') ? -T : x0, B, top), v(side('right') ? W + T : x1, B, top), v(side('right') ? W + T : x1, B + T, top), v(side('left') ? -T : x0, B + T, top)]} fill="var(--iso-cut)" stroke="var(--iso-line)" />
      {side('left') && (
        <>
          <Face ps={[v(-T, front, top), v(0, front, top), v(0, B, top), v(-T, B, top)]} fill="var(--iso-cut)" stroke="var(--iso-line)" />
          <Face ps={[v(-T, front), v(0, front), v(0, front, top), v(-T, front, top)]} fill="var(--iso-wall-end)" stroke="var(--iso-line)" />
        </>
      )}
      {side('right') && (
        <>
          <Face ps={[v(W, front, top), v(W + T, front, top), v(W + T, B, top), v(W, B, top)]} fill="var(--iso-cut)" stroke="var(--iso-line)" />
          <Face ps={[v(W, front), v(W + T, front), v(W + T, front, top), v(W, front, top)]} fill="var(--iso-wall-end)" stroke="var(--iso-line)" />
        </>
      )}
      {!plan.walls.left && plan.mirror === 1 && <Face ps={[v(x0, B), v(x0, B + T), v(x0, B + T, top), v(x0, B, top)]} fill="var(--iso-wall-end)" stroke="var(--iso-line)" />}
      {!plan.walls.right && plan.mirror === -1 && <Face ps={[v(x1, B), v(x1, B + T), v(x1, B + T, top), v(x1, B, top)]} fill="var(--iso-wall-end)" stroke="var(--iso-line)" />}
      {plan.toCeiling && <Ceiling />}
    </g>
  );
}

/** Where the glass goes up to the ceiling: the ceiling cut back along the top of the walls. */
function Ceiling() {
  const { plan } = useIso();
  const top = roomTop(plan);
  const slab = 90;
  const { x0, x1 } = plan.room;
  const B = plan.back;
  const reach = 300;
  return (
    <g>
      <Face ps={[v(x0, B, top), v(x1, B, top), v(x1, B - reach, top), v(x0, B - reach, top)]} fill="var(--iso-ceiling)" stroke="var(--iso-line)" />
      <Face ps={[v(x0, B - reach, top), v(x1, B - reach, top), v(x1, B - reach, top + slab), v(x0, B - reach, top + slab)]} fill="var(--iso-cut)" stroke="var(--iso-line)" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// The tray
// ---------------------------------------------------------------------------

export function Tray() {
  const { plan, id } = useIso();
  if (plan.surface === 'bath') return <Bath />;
  const { x0, x1, y0, y1 } = plan.tray;
  const h = MM.tray;
  const left = plan.walls.left ? 0 : x0;
  const right = plan.walls.right ? x1 - MM.lip : x1;
  const top = [v(left, y0, h), v(right, y0, h), v(right, y1, h), v(left, y1, h)];
  // A soft shadow on the floor round its foot.
  const shadow = [v(left - 30, y0 - 50), v(right + 30, y0 - 50), v(right + 30, y1), v(left - 30, y1)];
  // The tray's own shallow fall to the waste.
  const inset = 55;
  const dish = [v(left + inset, y0 + inset, h), v(right - inset, y0 + inset, h), v(right - inset, y1 - inset, h), v(left + inset, y1 - inset, h)];
  const waste = v((left + right) / 2, y1 * 0.7, h);
  return (
    <g>
      <g filter={`url(#${id('soft')})`} opacity={0.18}>
        <Face ps={shadow} fill="var(--iso-shadow)" />
      </g>
      <Face ps={[v(left, y0), v(right, y0), v(right, y0, h), v(left, y0, h)]} fill="var(--iso-tray-shade)" stroke="var(--iso-line)" />
      {plan.mirror === 1 && !plan.walls.left && <Face ps={[v(left, y0), v(left, y1), v(left, y1, h), v(left, y0, h)]} fill="var(--iso-tray-lit)" stroke="var(--iso-line)" />}
      {plan.mirror === -1 && !plan.walls.right && <Face ps={[v(right, y0), v(right, y1), v(right, y1, h), v(right, y0, h)]} fill="var(--iso-tray-lit)" stroke="var(--iso-line)" />}
      <Face ps={top} fill="var(--iso-tray)" stroke="var(--iso-line)" />
      <Face ps={dish} fill="var(--iso-tray-dish)" stroke="var(--iso-line-soft)" width={FINE} />
      <Disc at={waste} r={58} fill="var(--iso-metal)" stroke="var(--iso-line)" width={FINE} />
      <Disc at={waste} r={30} fill="var(--iso-metal-dark)" opacity={0.3} />
    </g>
  );
}

/**
 * A bath against the back wall, its front rim the floor a screen stands on:
 * the rim wide enough at the front for the glass line, the masking tape and
 * the tape measure outside the glass, and the basin sunk inside it, seen over
 * the rim.
 */
function Bath() {
  const { plan, id, at } = useIso();
  const { x0, x1, y0, y1 } = plan.tray;
  const h = plan.base;
  const left = plan.walls.left ? 0 : x0;
  const right = plan.walls.right ? x1 - MM.lip : x1;
  const top = [v(left, y0, h), v(right, y0, h), v(right, y1, h), v(left, y1, h)];
  const shadow = [v(left - 30, y0 - 60), v(right + 30, y0 - 60), v(right + 30, y1), v(left - 30, y1)];
  // The basin's opening in the rim, and how far down it goes.
  const [bl, br, bf, bb] = [left + MM.rimEnd, right - MM.rimEnd, y0 + MM.rimFront, y1 - MM.rimBack];
  const d = MM.basin;
  const opening = [v(bl, bf, h), v(br, bf, h), v(br, bb, h), v(bl, bb, h)];
  const clip = id('basin');
  const waste = v(plan.walls.left ? bl + 170 : br - 170, (bf + bb) / 2, h - d);
  return (
    <g>
      <g filter={`url(#${id('soft')})`} opacity={0.2}>
        <Face ps={shadow} fill="var(--iso-shadow)" />
      </g>
      <Face ps={[v(left, y0), v(right, y0), v(right, y0, h), v(left, y0, h)]} fill="var(--iso-tray-shade)" stroke="var(--iso-line)" />
      {plan.mirror === 1 && !plan.walls.left && <Face ps={[v(left, y0), v(left, y1), v(left, y1, h), v(left, y0, h)]} fill="var(--iso-tray-lit)" stroke="var(--iso-line)" />}
      {plan.mirror === -1 && !plan.walls.right && <Face ps={[v(right, y0), v(right, y1), v(right, y1, h), v(right, y0, h)]} fill="var(--iso-tray-lit)" stroke="var(--iso-line)" />}
      <Face ps={top} fill="var(--iso-tray)" stroke="var(--iso-line)" />
      <defs>
        <clipPath id={clip}>
          <polygon points={pts(opening.map(at))} />
        </clipPath>
      </defs>
      {/* Inside the basin, as much as shows over the rim: its far wall, its end walls and its bottom. */}
      <g clipPath={`url(#${clip})`}>
        <Face ps={[v(bl, bb, h), v(br, bb, h), v(br, bb, h - d), v(bl, bb, h - d)]} fill="var(--iso-tray-lit)" stroke="var(--iso-line-soft)" width={FINE} />
        <Face ps={[v(bl, bf, h), v(bl, bb, h), v(bl, bb, h - d), v(bl, bf, h - d)]} fill="var(--iso-tray-shade)" stroke="var(--iso-line-soft)" width={FINE} />
        <Face ps={[v(br, bf, h), v(br, bb, h), v(br, bb, h - d), v(br, bf, h - d)]} fill="var(--iso-tray-shade)" stroke="var(--iso-line-soft)" width={FINE} />
        <Face ps={[v(bl, bf, h - d), v(br, bf, h - d), v(br, bb, h - d), v(bl, bb, h - d)]} fill="var(--iso-tray-dish)" stroke="var(--iso-line-soft)" width={FINE} />
        <Disc at={waste} r={34} fill="var(--iso-metal)" stroke="var(--iso-line)" width={FINE} />
      </g>
      <Face ps={opening} fill="none" stroke="var(--iso-line)" width={FINE} />
    </g>
  );
}

/** A flat round thing lying in the room, such as the waste in the tray. */
export function Disc({ at: c, r, fill, stroke, width = FINE, opacity }: { at: V3; r: number; fill: string; stroke?: string; width?: number; opacity?: number }) {
  const ps = Array.from({ length: 28 }, (_, i) => add(c, v(Math.cos((i / 28) * Math.PI * 2) * r, Math.sin((i / 28) * Math.PI * 2) * r)));
  return <Face ps={ps} fill={fill} stroke={stroke} width={width} opacity={opacity} />;
}

// ---------------------------------------------------------------------------
// The marks on the floor
// ---------------------------------------------------------------------------

/**
 * A short piece of masking tape on a glass line, with the line drawn on it.
 * At a corner a second piece crosses it, with the other line, so the lines
 * cross. `shift` moves the tape along the line, by its half-length, so its
 * end can sit against a wall; `stop` marks where the glass stops.
 */
export function Mask({ at: p, along: u, cross, shift = 0, stop = false }: { at: V3; along: V3; cross?: V3; shift?: number; stop?: boolean }) {
  const { plan } = useIso();
  const h = plan.base + 1;
  const n = v(-u.y, u.x);
  // At a corner the pieces are longer, so the marks show past a laser standing on them.
  const L = (cross ? MM.maskLong * 1.5 : MM.maskLong) / 2;
  const w = MM.maskWide / 2;
  const centre = lift(add(p, u, shift * L), h);
  // The tape is laid along the line, and over a corner both ways.
  const strip = (a: V3, b: V3) => [add(add(centre, a, -L), b, -w), add(add(centre, a, L), b, -w), add(add(centre, a, L), b, w), add(add(centre, a, -L), b, w)];
  const at = lift(p, h);
  const lines: [V3, V3][] = [shift === 0 ? [add(centre, u, -L * 0.85), add(centre, u, L * 0.85)] : [at, add(at, u, L * 1.85)]];
  if (cross) lines.push([add(at, cross, -L * 0.85), add(at, cross, L * 0.85)]);
  return (
    <g>
      <Face ps={strip(u, n)} fill="var(--iso-mask)" stroke="var(--iso-mask-edge)" width={0.8} />
      {cross && <Face ps={strip(cross, v(-cross.y, cross.x))} fill="var(--iso-mask)" stroke="var(--iso-mask-edge)" width={0.8} />}
      {lines.map(([a, b], i) => (
        <Seg key={i} a={a} b={b} stroke="var(--iso-pencil)" width={2} />
      ))}
      {stop && <Seg a={add(at, n, -w * 0.8)} b={add(at, n, w * 0.8)} stroke="var(--iso-pencil)" width={2} />}
    </g>
  );
}

/** A piece of masking tape on a wall with a level line drawn across it. */
export function WallMask({ at: p, face, along: u }: { at: V3; face: V3; along: V3 }) {
  const L = 160 / 2;
  const w = 70 / 2;
  const c = add(p, face, 2);
  return (
    <g>
      <Face ps={[add(add(c, u, -L), UPv, -w), add(add(c, u, L), UPv, -w), add(add(c, u, L), UPv, w), add(add(c, u, -L), UPv, w)]} fill="var(--iso-mask)" stroke="var(--iso-mask-edge)" width={0.8} />
      <Seg a={add(c, u, -L * 0.85)} b={add(c, u, L * 0.85)} stroke="var(--iso-pencil)" width={1.6} />
    </g>
  );
}
const UPv = v(0, 0, 1);

// ---------------------------------------------------------------------------
// The glass
// ---------------------------------------------------------------------------

/** One pane standing on its glass line, with its hardware. */
export function GlassPane({ pane, run, sliding }: { pane: Pane; run: Run; sliding: boolean }) {
  const { plan, id } = useIso();
  const base = plan.base;
  const top = glassTop(plan);
  const [a, b] = [lift(pane.a, base), lift(pane.b, base)];
  const out = run.out;
  const t = MM.glassThick;
  const at = (p: V3, z: number) => lift(p, z);
  const height = top - base;
  // Thin lines of reflection across the pane, leaning the same way on every pane.
  const glint = (t0: number, z0: number, t1: number, z1: number) => [at(along(a, b, t0), base + height * z0), at(along(a, b, t1), base + height * z1)] as const;
  const hingeEnd = pane.hinge === 'a' ? a : pane.hinge === 'b' ? b : null;
  const handleAt = pane.hinge === 'a' ? along(a, b, 0.88) : along(a, b, 0.12);
  const u = dir(a, b);
  return (
    <g>
      <Face ps={[a, b, at(b, top), at(a, top)]} fill={`url(#${id('glass')})`} />
      {[glint(0.12, 0.34, 0.3, 0.92), glint(0.19, 0.3, 0.37, 0.88), glint(0.6, 0.12, 0.72, 0.4)].map(([p, q], i) => (
        <Seg key={i} a={p} b={q} stroke="var(--iso-glass-glint)" width={i === 1 ? FINE : 0.9} />
      ))}
      {/* The edges, and the top edge's thickness. */}
      <Face ps={[at(a, top), at(b, top), at(add(b, out, t), top), at(add(a, out, t), top)]} fill="var(--iso-glass-top)" stroke="var(--iso-glass-edge)" width={FINE} />
      <Seg a={at(a, top)} b={at(b, top)} stroke="var(--iso-glass-edge)" />
      <Seg a={a} b={at(a, top)} stroke="var(--iso-glass-edge)" />
      <Seg a={b} b={at(b, top)} stroke="var(--iso-glass-edge)" />
      <Seg a={a} b={b} stroke="var(--iso-glass-edge)" width={FINE} />
      {pane.kind === 'door' && !sliding && hingeEnd && (
        <>
          {[0.14, 0.82].map((h) => (
            <Face key={h} ps={[at(add(hingeEnd, u, pane.hinge === 'a' ? 0 : -70), base + height * h), at(add(hingeEnd, u, pane.hinge === 'a' ? 70 : 0), base + height * h), at(add(hingeEnd, u, pane.hinge === 'a' ? 70 : 0), base + height * h + 110), at(add(hingeEnd, u, pane.hinge === 'a' ? 0 : -70), base + height * h + 110)]} fill="var(--iso-metal)" stroke="var(--iso-line)" width={FINE} />
          ))}
        </>
      )}
      {pane.kind === 'door' && (
        <>
          <Seg a={at(add(handleAt, out, 45), base + height * 0.42)} b={at(add(handleAt, out, 45), base + height * 0.6)} stroke="var(--iso-line)" width={3.2} />
          <Seg a={at(add(handleAt, out, 45), base + height * 0.42)} b={at(add(handleAt, out, 45), base + height * 0.6)} stroke="var(--iso-metal)" width={1.4} />
        </>
      )}
    </g>
  );
}

/** A slim channel holding the glass where it meets a wall. */
export function Channel({ at: p, run }: { at: V3; run: Run }) {
  const { plan } = useIso();
  const top = glassTop(plan);
  return (
    <g>
      <Seg a={lift(add(p, run.out, 10), plan.base)} b={lift(add(p, run.out, 10), top)} stroke="var(--iso-line)" width={2.8} cap="butt" />
      <Seg a={lift(add(p, run.out, 10), plan.base)} b={lift(add(p, run.out, 10), top)} stroke="var(--iso-metal)" width={1.2} cap="butt" />
    </g>
  );
}

/** Every pane of a run, and the rail a sliding door hangs from. */
export function RunGlass({ run }: { run: Run }) {
  const { plan } = useIso();
  const shown = useContext(GlassShown);
  const top = glassTop(plan);
  if (!shown) return null;
  return (
    <g>
      {run.panes.map((pane, i) => (
        <GlassPane key={i} pane={pane} run={run} sliding={plan.sliding} />
      ))}
      {run.view.left === 'wall' && <Channel at={run.a} run={run} />}
      {run.view.right === 'wall' && <Channel at={run.b} run={run} />}
      {plan.sliding && run.panes.some((p) => p.kind === 'door') && (
        <Fragment>
          <Seg a={lift(add(run.a, run.out, 30), top + 20)} b={lift(add(run.b, run.out, 30), top + 20)} stroke="var(--iso-line)" width={4} cap="butt" />
          <Seg a={lift(add(run.a, run.out, 30), top + 20)} b={lift(add(run.b, run.out, 30), top + 20)} stroke="var(--iso-metal)" width={2} cap="butt" />
        </Fragment>
      )}
    </g>
  );
}
