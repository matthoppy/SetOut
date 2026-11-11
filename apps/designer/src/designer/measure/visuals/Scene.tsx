/**
 * The pieces the card pictures are built from.
 *
 * One scene for every card: the opening seen from the front, with the
 * bathroom floor in the foreground where the laser stands on its tripod,
 * away from the glass line. The laser's two lines come out of the laser
 * itself: the level line sideways to each wall at the height of the laser,
 * the up-and-down line to the ceiling and the floor. Everything that is
 * measured happens on the glass line, which faces the viewer, so the tapes
 * read true.
 *
 * One style: a grey room, red laser, yellow tape, blue masking tape with a
 * black marker line, and the brand's accent for the thing being asked for.
 */

import type { CSSProperties, ReactNode } from 'react';

export const VB = { w: 320, h: 240 };
/** Left wall face, right wall face, the floor line, the ceiling, the middle. */
export const LF = 42;
export const RF = 278;
export const FLOOR = 194;
export const CEIL = 24;
export const CX = 160;
/** The laser head, and so the level line: a small tripod's height. */
export const LEVEL = 116;

export const WALL = 'hsl(var(--muted-foreground) / 0.16)';
export const WALL_EDGE = 'hsl(var(--muted-foreground) / 0.55)';
export const FOREGROUND = 'hsl(var(--muted-foreground) / 0.07)';
export const INK = 'hsl(var(--foreground) / 0.78)';
export const ACCENT = 'hsl(var(--measure-accent))';
export const BG = 'hsl(var(--background))';
export const LASER = '#e11d48';
export const TAPE = '#f5b301';
export const TAPE_DARK = '#8a6400';
export const MASK = '#9ccbff';
export const MASK_EDGE = '#5aa0e6';
export const MARK = '#1b1f24';
export const FONT = 'system-ui, sans-serif';

export function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** The opening from the front: two walls, the floor line, the bathroom floor in front, and the ceiling when it matters. */
export function Room({ ceiling }: { ceiling: boolean }) {
  const top = ceiling ? CEIL : 0;
  return (
    <g>
      <rect x={0} y={FLOOR} width={VB.w} height={VB.h - FLOOR} fill={FOREGROUND} />
      <rect x={0} y={0} width={LF} height={FLOOR} fill={WALL} />
      <rect x={RF} y={0} width={VB.w - RF} height={FLOOR} fill={WALL} />
      {ceiling && <rect x={0} y={0} width={VB.w} height={CEIL} fill={WALL} />}
      <line x1={LF} y1={top} x2={LF} y2={FLOOR} stroke={WALL_EDGE} strokeWidth={1.4} />
      <line x1={RF} y1={top} x2={RF} y2={FLOOR} stroke={WALL_EDGE} strokeWidth={1.4} />
      <line x1={0} y1={FLOOR} x2={VB.w} y2={FLOOR} stroke={WALL_EDGE} strokeWidth={1.4} />
      {ceiling && <line x1={LF} y1={CEIL} x2={RF} y2={CEIL} stroke={WALL_EDGE} strokeWidth={1.4} />}
    </g>
  );
}

/** A short piece of masking tape on the floor against a wall, with the glass line drawn across it. */
export function FloorMark({ side, animate = false }: { side: 'left' | 'right'; animate?: boolean }) {
  const x = side === 'left' ? LF : RF - 30;
  return (
    <g>
      <rect x={x} y={FLOOR - 4} width={30} height={9} rx={1} fill={MASK} stroke={MASK_EDGE} strokeWidth={0.6} className={animate ? 'mw-appear-early' : undefined} />
      <line x1={x + 2} y1={FLOOR} x2={x + 28} y2={FLOOR} stroke={MARK} strokeWidth={2} strokeLinecap="round" className={animate ? 'mw-draw' : undefined} style={animate ? ({ '--mw-len': 26 } as CSSProperties) : undefined} />
    </g>
  );
}

/** The glass line: the marks joined, along the floor. */
export function GlassLine({ lit = false }: { lit?: boolean }) {
  return <line x1={LF + 30} y1={FLOOR} x2={RF - 30} y2={FLOOR} stroke={ACCENT} strokeWidth={lit ? 1.8 : 1.2} strokeDasharray="5 4" opacity={lit ? 1 : 0.55} />;
}

/** A piece of masking tape on the wall with the top of the glass marked on it. */
export function WallMark({ side, y }: { side: 'left' | 'right'; y: number }) {
  const x = side === 'left' ? LF - 9 : RF - 11;
  return (
    <g>
      <rect x={x} y={y - 9} width={20} height={18} rx={1} fill={MASK} stroke={MASK_EDGE} strokeWidth={0.6} />
      <line x1={x + 2} y1={y} x2={x + 18} y2={y} stroke={MARK} strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

/** The laser on its little tripod, standing on the bathroom floor in front of the opening. */
export function Tripod({ on = true }: { on?: boolean }) {
  const headY = LEVEL;
  const feetY = 230;
  return (
    <g>
      {/* Legs. */}
      <line x1={CX} y1={headY + 12} x2={CX - 20} y2={feetY} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={CX} y1={headY + 12} x2={CX + 20} y2={feetY} stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={CX} y1={headY + 12} x2={CX + 3} y2={feetY - 6} stroke={INK} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} />
      <line x1={CX} y1={headY + 6} x2={CX} y2={headY + 16} stroke={INK} strokeWidth={2.2} />
      {/* The laser. */}
      <rect x={CX - 10} y={headY - 9} width={20} height={16} rx={3} fill={BG} stroke={INK} strokeWidth={1.4} />
      <circle cx={CX} cy={headY} r={3.2} fill={on ? LASER : 'none'} stroke={INK} strokeWidth={0.9} className={on ? 'mw-glow' : undefined} />
    </g>
  );
}

type LineMode = 'draw' | 'on' | 'dim' | 'off';

function Beam({ x1, y1, x2, y2, mode }: { x1: number; y1: number; x2: number; y2: number; mode: LineMode }) {
  if (mode === 'off') return null;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const cls = mode === 'draw' ? 'mw-draw' : undefined;
  const style = mode === 'draw' ? ({ '--mw-len': len } as CSSProperties) : undefined;
  return (
    <g opacity={mode === 'dim' ? 0.35 : 1}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LASER} strokeWidth={6} opacity={0.16} className={cls} style={style} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LASER} strokeWidth={1.6} className={cls} style={style} />
    </g>
  );
}

/**
 * The laser's two lines, coming out of the laser: the level line sideways to
 * each wall, the up-and-down line to the ceiling and the floor.
 */
export function LaserLines({ ceiling, vertical, level }: { ceiling: boolean; vertical: LineMode; level: LineMode }) {
  const top = ceiling ? CEIL : 4;
  return (
    <g>
      <Beam x1={CX} y1={LEVEL} x2={LF} y2={LEVEL} mode={level} />
      <Beam x1={CX} y1={LEVEL} x2={RF} y2={LEVEL} mode={level} />
      <Beam x1={CX} y1={LEVEL} x2={CX} y2={top} mode={vertical} />
      <Beam x1={CX} y1={LEVEL} x2={CX} y2={FLOOR} mode={vertical} />
    </g>
  );
}

/**
 * A tape measure from its body at (x1, y1) to its hook at (x2, y2). The
 * number appears once the blade is out; `lit` marks where the laser lights
 * the blade.
 */
export function TapeMeasure({ x1, y1, x2, y2, value, lit, animate = true, labelSide = 'before' }: { x1: number; y1: number; x2: number; y2: number; value: string; lit?: { x: number; y: number }; animate?: boolean; labelSide?: 'before' | 'after' }) {
  const horizontal = Math.abs(y2 - y1) < 0.5;
  const dir = horizontal ? Math.sign(x2 - x1) : Math.sign(y2 - y1);
  const len = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
  const cls = animate ? (horizontal ? 'mw-extend' : 'mw-extend-y') : undefined;
  const origin = { transformOrigin: `${x1}px ${y1}px` } as CSSProperties;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const sideSign = labelSide === 'before' ? -1 : 1;
  return (
    <g>
      <g className={cls} style={origin}>
        {horizontal ? (
          <rect x={Math.min(x1, x2)} y={y1 - 4.5} width={len} height={9} fill={TAPE} stroke={TAPE_DARK} strokeWidth={0.7} />
        ) : (
          <rect x={x1 - 4.5} y={Math.min(y1, y2)} width={9} height={len} fill={TAPE} stroke={TAPE_DARK} strokeWidth={0.7} />
        )}
        {Array.from({ length: Math.floor(len / 8) }, (_, i) => {
          const t = (i + 1) * 8;
          const major = i % 5 === 4;
          return horizontal ? (
            <line key={i} x1={x1 + dir * t} y1={y1 - 4.5} x2={x1 + dir * t} y2={y1 - (major ? 0 : 2.5)} stroke={TAPE_DARK} strokeWidth={0.6} />
          ) : (
            <line key={i} x1={x1 - 4.5} y1={y1 + dir * t} x2={x1 - (major ? 0 : 2.5)} y2={y1 + dir * t} stroke={TAPE_DARK} strokeWidth={0.6} />
          );
        })}
        {horizontal ? <rect x={x2 - (dir > 0 ? 2 : 1)} y={y1 - 7} width={3} height={14} fill={INK} /> : <rect x={x1 - 7} y={y2 - (dir > 0 ? 2 : 1)} width={14} height={3} fill={INK} />}
      </g>
      {horizontal ? (
        <rect x={x1 - (dir > 0 ? 18 : 2)} y={y1 - 11} width={20} height={22} rx={4} fill={BG} stroke={INK} strokeWidth={1.4} />
      ) : (
        <rect x={x1 - 11} y={y1 - (dir > 0 ? 18 : 2)} width={22} height={20} rx={4} fill={BG} stroke={INK} strokeWidth={1.4} />
      )}
      {lit && (
        <g className={animate ? 'mw-appear' : undefined}>
          <circle cx={lit.x} cy={lit.y} r={7} fill={LASER} opacity={0.22} />
          <line x1={lit.x} y1={lit.y - 8} x2={lit.x} y2={lit.y + 8} stroke={LASER} strokeWidth={2} />
        </g>
      )}
      <g className={animate ? 'mw-appear' : undefined}>
        {horizontal ? (
          <>
            <rect x={midX - 27} y={midY + sideSign * 26 - 10} width={54} height={20} rx={3} fill={ACCENT} />
            <text x={midX} y={midY + sideSign * 26 + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" fontFamily={FONT}>
              {value}
            </text>
          </>
        ) : (
          <>
            <rect x={midX + sideSign * 36 - 27} y={midY - 10} width={54} height={20} rx={3} fill={ACCENT} />
            <text x={midX + sideSign * 36} y={midY + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff" fontFamily={FONT}>
              {value}
            </text>
          </>
        )}
      </g>
    </g>
  );
}

/** A small circled number, as on the drawing. */
export function PointMark({ x, y, n, lit = false }: { x: number; y: number; n: number; lit?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={8} fill={lit ? ACCENT : BG} stroke={lit ? ACCENT : INK} strokeWidth={1.1} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={lit ? '#fff' : INK} fontFamily={FONT}>
        {n}
      </text>
    </g>
  );
}

/** A caption on the picture, in the accent. */
export function Caption({ x, y, children, anchor = 'start' }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={10.5} fontWeight={700} fill={ACCENT} fontFamily={FONT}>
      {children}
    </text>
  );
}
