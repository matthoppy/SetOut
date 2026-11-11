/**
 * The measuring drawings.
 *
 * These are the most important pictures in the product. Custom Showers cuts
 * to whatever the customer types, so the only defence against a wrong number
 * is the customer understanding what the number is before they go and get it.
 *
 * One component, one figure per screen, drawn from the customer's own shape:
 * a walk-in gets an open end, a corner gets a corner mark, a single door gets
 * the cross. The line being measured is lit and breathes; everything else
 * steps back. Readings already taken tilt the walls, floor and ceiling (much
 * exaggerated, and said so) so the picture starts to look like their room.
 *
 * Deliberately plain: a grey room, one blue thing to do, one label. A
 * realistic shower would bury the measurement in detail, and this is read on
 * a phone, in a bathroom, with a tape in the other hand.
 *
 * Colours are CSS variables so the figures follow dark mode and the embed.
 */

import { junctionPoint, runEnds, runPanelIndices, traceChain } from '@setout/engine';
import type { ConfiguratorJunction, ConfiguratorPanel } from '@setout/engine';

export type EndKind = 'wall' | 'corner' | 'open';
export type SceneTool = 'laser' | 'tape' | null;

export type SceneFigure =
  | { kind: 'tool'; tool: 'laser' | 'tape' }
  | {
      kind: 'overview';
      panels: ConfiguratorPanel[];
      junctions: ConfiguratorJunction[];
      leftWall: boolean;
      rightWall: boolean;
      runNames: string[];
    }
  | {
      kind: 'height';
      toCeiling: boolean;
      singleDoor: boolean;
      leftEnd: EndKind;
      rightEnd: EndKind;
    }
  | {
      kind: 'width';
      halves: boolean;
      tool: SceneTool;
      leftEnd: EndKind;
      rightEnd: EndKind;
      /** Walk-in: also show the whole tray width. */
      tray: boolean;
    }
  | { kind: 'width-top' }
  | { kind: 'cross'; points: [number, number] | null; ceiling: boolean; tool: SceneTool }
  | {
      kind: 'wall';
      side: 'left' | 'right';
      tool: SceneTool;
      /** Signed, positive leaning into the shower. Null before both readings. */
      leanMm: number | null;
      packers: boolean;
    }
  | {
      kind: 'floor';
      tool: SceneTool;
      leftEnd: EndKind;
      rightEnd: EndKind;
      fallMm: number | null;
      lowEnd: 'start' | 'end' | null;
    }
  | {
      kind: 'ceiling';
      leftEnd: EndKind;
      rightEnd: EndKind;
      dropMm: number | null;
      lowEnd: 'start' | 'end' | null;
    }
  | { kind: 'notches'; side: 'left' | 'right' };

interface MeasureSceneProps {
  figure: SceneFigure;
  /** Which labelled measurement is lit: a point number, 'A', 'bottom', 'start'... */
  active?: string | null;
  className?: string;
}

// The room. 320 × 220, floor at 180, walls 40 deep.
const W = 320;
const H = 220;
const FLOOR = 180;
const LF = 40; // left wall face
const RF = 280; // right wall face
const TOP = 44; // where a standard-height glass finishes
const CEIL = 14; // underside of the ceiling slab

const WALL = 'hsl(var(--muted-foreground) / 0.22)';
const WALL_EDGE = 'hsl(var(--muted-foreground) / 0.6)';
const INK = 'hsl(var(--muted-foreground))';
const ACCENT = 'hsl(var(--measure-accent))';
const GLASS = 'hsl(var(--measure-accent) / 0.09)';
const BG = 'hsl(var(--background))';

/** How far a real lean or fall is blown up so it can be seen at all. */
function exaggerate(mm: number | null, generic: number): number {
  if (mm === null) return generic;
  if (mm === 0) return 0;
  return Math.sign(mm) * Math.min(30, Math.max(6, Math.abs(mm) * 3));
}

type Tone = 'lit' | 'on' | 'muted';

function tone(key: string, active: string | null | undefined, on: boolean): Tone {
  if (active === key) return 'lit';
  return on ? 'on' : 'muted';
}

/** Dimension line with a tick at each end and a label at its middle. */
function Dim({
  x1,
  y1,
  x2,
  y2,
  label,
  tone: t,
  point = false,
  labelSide = 'before',
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  tone: Tone;
  /** Draw the label as a numbered disc on the line rather than text beside it. */
  point?: boolean;
  labelSide?: 'before' | 'after';
}) {
  const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const colour = t === 'muted' ? INK : ACCENT;
  const opacity = t === 'muted' ? 0.45 : 1;
  const width = t === 'lit' ? 2.5 : t === 'on' ? 2 : 1.5;
  const tick = (x: number, y: number) => (
    <line
      x1={vertical ? x - 5 : x}
      y1={vertical ? y : y - 5}
      x2={vertical ? x + 5 : x}
      y2={vertical ? y : y + 5}
      stroke={colour}
      strokeWidth={width}
    />
  );
  const offset = labelSide === 'before' ? -1 : 1;
  return (
    <g opacity={opacity}>
      {t === 'lit' && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth={12} strokeLinecap="round" className="measure-pulse" />
      )}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={width} />
      {tick(x1, y1)}
      {tick(x2, y2)}
      {point ? (
        <>
          <circle cx={midX} cy={midY} r={9.5} fill={t === 'muted' ? BG : ACCENT} stroke={colour} strokeWidth={1.5} />
          <text
            x={midX}
            y={midY + 0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={700}
            fill={t === 'muted' ? INK : BG}
          >
            {label}
          </text>
        </>
      ) : (
        <text
          x={vertical ? midX + 9 * offset : midX}
          y={vertical ? midY : midY + 9 * offset - (offset < 0 ? 0 : 3)}
          textAnchor={vertical ? (offset < 0 ? 'end' : 'start') : 'middle'}
          dominantBaseline={vertical ? 'middle' : offset < 0 ? 'auto' : 'hanging'}
          fontSize={12}
          fontWeight={700}
          fill={colour}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/** A small self-levelling laser on the floor. */
function LaserBox({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 9} y={y - 13} width={18} height={13} rx={2} fill={BG} stroke={ACCENT} strokeWidth={1.5} />
      <circle cx={x} cy={y - 6.5} r={2.2} fill={ACCENT} />
    </g>
  );
}

/** A dashed laser line, or a strip of masking tape with a pen line on it. */
function RefLine({
  x1,
  y1,
  x2,
  y2,
  tool,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tool: SceneTool;
}) {
  if (tool === 'tape') {
    const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    return (
      <g>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={ACCENT}
          strokeOpacity={0.18}
          strokeWidth={vertical ? 14 : 12}
        />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth={1.5} />
      </g>
    );
  }
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth={1.75} strokeDasharray="7 5" />
  );
}

/** A spirit level, vertical or horizontal, with its bubble reading true. */
function Level({ x, y, length, vertical }: { x: number; y: number; length: number; vertical: boolean }) {
  const w = vertical ? 14 : length;
  const h = vertical ? length : 14;
  const vx = vertical ? x + 3 : x + length / 2 - 11;
  const vy = vertical ? y + length / 2 - 11 : y + 3;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill={ACCENT} fillOpacity={0.16} stroke={ACCENT} strokeWidth={1.5} />
      <rect x={vx} y={vy} width={vertical ? 8 : 22} height={vertical ? 22 : 8} rx={4} fill={BG} stroke={ACCENT} strokeWidth={1} />
      <circle cx={vx + (vertical ? 4 : 11)} cy={vy + (vertical ? 11 : 4)} r={2.6} fill={ACCENT} />
    </g>
  );
}

/** Glazing packers stacked in a gap. */
function Packers({ x, y, count, flip }: { x: number; y: number; count: number; flip: boolean }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          x={flip ? x - (i + 1) * 7 : x + i * 7}
          y={y}
          width={6}
          height={18}
          rx={1}
          fill={ACCENT}
          fillOpacity={0.3 + i * 0.2}
          stroke={ACCENT}
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

/** A piece of masking tape on the floor marking where the glass stops or turns. */
function FloorMark({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <rect x={x - 8} y={y - 5} width={16} height={9} rx={1} fill={ACCENT} fillOpacity={0.3} stroke={ACCENT} strokeWidth={1} />
      <line x1={x} y1={y - 4} x2={x} y2={y + 3} stroke={ACCENT} strokeWidth={1.5} />
      {label && (
        <text x={x} y={y + 18} textAnchor="middle" fontSize={9} fontWeight={600} fill={INK}>
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * The room the measurement happens in: the two ends of this run, the floor,
 * and the ceiling when it matters. Leans, falls and slopes are in pixels and
 * already exaggerated by the caller.
 */
function Room({
  leftEnd,
  rightEnd,
  ceiling = false,
  leftLeanPx = 0,
  rightLeanPx = 0,
  floorFallPx = 0,
  floorLowEnd = null,
  ceilingDropPx = 0,
  ceilingLowEnd = null,
  fade,
}: {
  leftEnd: EndKind;
  rightEnd: EndKind;
  ceiling?: boolean;
  /** Positive moves the top of the face into the room. */
  leftLeanPx?: number;
  rightLeanPx?: number;
  floorFallPx?: number;
  floorLowEnd?: 'start' | 'end' | null;
  ceilingDropPx?: number;
  ceilingLowEnd?: 'start' | 'end' | null;
  /** Fade one side so the other is what the eye lands on. */
  fade?: 'left' | 'right' | null;
}) {
  const topY = ceiling ? 0 : 0;
  const floorL = FLOOR + (floorLowEnd === 'start' ? floorFallPx : 0);
  const floorR = FLOOR + (floorLowEnd === 'end' ? floorFallPx : 0);
  const ceilL = CEIL + (ceilingLowEnd === 'start' ? ceilingDropPx : 0);
  const ceilR = CEIL + (ceilingLowEnd === 'end' ? ceilingDropPx : 0);
  const leftTop = LF + leftLeanPx;
  const rightTop = RF - rightLeanPx;

  return (
    <g>
      {/* Tray / floor. */}
      <path d={`M 0 ${floorL} L ${W} ${floorR} L ${W} ${H} L 0 ${H} Z`} fill={WALL} opacity={0.6} />
      <line x1={0} y1={floorL} x2={W} y2={floorR} stroke={WALL_EDGE} strokeWidth={2} />

      {ceiling && (
        <>
          <path d={`M 0 0 L ${W} 0 L ${W} ${ceilR} L 0 ${ceilL} Z`} fill={WALL} />
          <line x1={0} y1={ceilL} x2={W} y2={ceilR} stroke={WALL_EDGE} strokeWidth={2} />
        </>
      )}

      <g opacity={fade === 'left' ? 0.35 : 1}>
        {leftEnd === 'wall' && (
          <>
            <path d={`M 0 ${topY} L ${leftTop} ${topY} L ${LF} ${floorL} L 0 ${floorL} Z`} fill={WALL} />
            <line x1={leftTop} y1={topY} x2={LF} y2={floorL} stroke={WALL_EDGE} strokeWidth={2} />
          </>
        )}
        {leftEnd === 'corner' && (
          <>
            <line x1={LF} y1={TOP - 10} x2={LF} y2={floorL} stroke={WALL_EDGE} strokeWidth={1.5} strokeDasharray="4 4" />
            <FloorMark x={LF} y={floorL} label="corner" />
          </>
        )}
      </g>

      <g opacity={fade === 'right' ? 0.35 : 1}>
        {rightEnd === 'wall' && (
          <>
            <path d={`M ${rightTop} ${topY} L ${W} ${topY} L ${W} ${floorR} L ${RF} ${floorR} Z`} fill={WALL} />
            <line x1={rightTop} y1={topY} x2={RF} y2={floorR} stroke={WALL_EDGE} strokeWidth={2} />
          </>
        )}
        {rightEnd === 'corner' && (
          <>
            <line x1={RF} y1={TOP - 10} x2={RF} y2={floorR} stroke={WALL_EDGE} strokeWidth={1.5} strokeDasharray="4 4" />
            <FloorMark x={RF} y={floorR} label="corner" />
          </>
        )}
      </g>
    </g>
  );
}

/** Where the glass will stand, as a ghost. */
function Glass({
  x1,
  x2,
  top = TOP,
  bottom = FLOOR - 3,
  notch,
}: {
  x1: number;
  x2: number;
  top?: number;
  bottom?: number;
  /** A bottom-left or bottom-right cut-out, in pixels. */
  notch?: { side: 'left' | 'right'; w: number; h: number } | null;
}) {
  const path = notch
    ? notch.side === 'left'
      ? `M ${x1} ${top} L ${x2} ${top} L ${x2} ${bottom} L ${x1 + notch.w} ${bottom} L ${x1 + notch.w} ${bottom - notch.h} L ${x1} ${bottom - notch.h} Z`
      : `M ${x1} ${top} L ${x2} ${top} L ${x2} ${bottom - notch.h} L ${x2 - notch.w} ${bottom - notch.h} L ${x2 - notch.w} ${bottom} L ${x1} ${bottom} Z`
    : `M ${x1} ${top} L ${x2} ${top} L ${x2} ${bottom} L ${x1} ${bottom} Z`;
  return <path d={path} fill={GLASS} stroke={ACCENT} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 3" />;
}

/** Right-hand x of the glass: the wall face, or a mark short of an open end. */
const openEndX = 212;
const glassRight = (end: EndKind) => (end === 'open' ? openEndX : RF);

export function MeasureScene({ figure, active = null, className }: MeasureSceneProps) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={describe(figure)}>
      <Figure figure={figure} active={active} />
    </svg>
  );
}

function describe(f: SceneFigure): string {
  switch (f.kind) {
    case 'tool':
      return f.tool === 'laser' ? 'Measuring with a laser level' : 'Measuring with a tape measure and spirit level';
    case 'overview':
      return 'Your shower from above, with each run numbered';
    case 'height':
      return 'Measuring from the floor up to where the glass will finish';
    case 'width':
      return f.halves ? 'Measuring the width in two halves, to a line in the middle' : 'Measuring the width along the floor';
    case 'width-top':
      return 'Measuring the width again at the top of the glass';
    case 'cross':
      return 'Readings to a cross in the middle of the opening';
    case 'wall':
      return `Checking whether the ${f.side} wall is straight up`;
    case 'floor':
      return 'Checking whether the floor is level along the glass line';
    case 'ceiling':
      return 'Measuring the ceiling height at each end';
    case 'notches':
      return 'A cut-out in the bottom corner of the glass for an upstand';
  }
}

function Figure({ figure: f, active }: { figure: SceneFigure; active: string | null }) {
  switch (f.kind) {
    case 'tool':
      return <ToolFigure tool={f.tool} />;
    case 'overview':
      return <OverviewFigure {...f} />;
    case 'height':
      return <HeightFigure {...f} active={active} />;
    case 'width':
      return <WidthFigure {...f} active={active} />;
    case 'width-top':
      return <WidthTopFigure active={active} />;
    case 'cross':
      return <CrossFigure {...f} active={active} />;
    case 'wall':
      return <WallFigure {...f} active={active} />;
    case 'floor':
      return <FloorFigure {...f} active={active} />;
    case 'ceiling':
      return <CeilingFigure {...f} active={active} />;
    case 'notches':
      return <NotchFigure {...f} active={active} />;
  }
}

// --- Figures -----------------------------------------------------------------

function ToolFigure({ tool }: { tool: 'laser' | 'tape' }) {
  if (tool === 'laser') {
    return (
      <>
        <Room leftEnd="wall" rightEnd="wall" />
        <Glass x1={LF + 6} x2={RF - 6} />
        <RefLine x1={160} y1={12} x2={160} y2={FLOOR - 14} tool="laser" />
        <RefLine x1={LF + 2} y1={104} x2={RF - 2} y2={104} tool="laser" />
        <LaserBox x={160} y={FLOOR} />
        <text x={168} y={26} fontSize={10} fontWeight={600} fill={ACCENT}>
          true vertical
        </text>
        <text x={RF - 6} y={98} textAnchor="end" fontSize={10} fontWeight={600} fill={ACCENT}>
          true level
        </text>
      </>
    );
  }
  return (
    <>
      <Room leftEnd="wall" rightEnd="wall" />
      <Glass x1={LF + 6} x2={RF - 6} />
      {/* Masking tape with a drawn line, a long level, and a tape measure. */}
      <RefLine x1={160} y1={30} x2={160} y2={FLOOR - 6} tool="tape" />
      <text x={168} y={40} fontSize={10} fontWeight={600} fill={ACCENT}>
        masking tape
      </text>
      <Level x={LF + 1} y={TOP + 10} length={118} vertical />
      <text x={LF + 20} y={TOP + 26} fontSize={10} fontWeight={600} fill={ACCENT}>
        level
      </text>
      <Packers x={LF + 1} y={FLOOR - 40} count={2} flip={false} />
      <g>
        <rect x={214} y={FLOOR - 42} width={34} height={30} rx={5} fill={BG} stroke={ACCENT} strokeWidth={1.5} />
        <circle cx={231} cy={FLOOR - 27} r={6} fill="none" stroke={ACCENT} strokeWidth={1.5} />
        <rect x={248} y={FLOOR - 30} width={28} height={7} fill={ACCENT} fillOpacity={0.35} stroke={ACCENT} strokeWidth={1} />
        <text x={231} y={FLOOR - 48} textAnchor="middle" fontSize={10} fontWeight={600} fill={ACCENT}>
          tape
        </text>
      </g>
    </>
  );
}

function OverviewFigure({
  panels,
  junctions,
  leftWall,
  rightWall,
  runNames,
}: {
  panels: ConfiguratorPanel[];
  junctions: ConfiguratorJunction[];
  leftWall: boolean;
  rightWall: boolean;
  runNames: string[];
}) {
  const trace = traceChain(panels, junctions);
  if (panels.length === 0) return null;
  const door = panels[trace.anchorIndex];
  const swing = door?.kind === 'door' ? door.width_mm : 0;
  const minX = trace.minX;
  const minY = trace.minY;
  const contentW = trace.maxX - minX || 1000;
  // The swing arc is a hint, not the subject, so only part of it earns room:
  // letting the whole quarter-circle into the bounds shrinks a corner shower
  // to a third of the box.
  const contentH = Math.max(trace.maxY, swing * 0.35) - minY || 1000;
  const padX = 124;
  const padY = 56;
  const s = Math.min((W - padX) / contentW, (H - padY) / contentH);
  const ox = W / 2 - (minX + contentW / 2) * s;
  const oy = H / 2 - (minY + contentH / 2) * s;
  const tx = (x: number) => x * s + ox;
  const ty = (y: number) => y * s + oy;
  const ends = runEnds(trace, panels.length);
  const runs = runPanelIndices(panels, junctions);

  const wallTick = (end: { x: number; y: number; dx: number; dy: number }, label: string, isWall: boolean) => {
    const px = -end.dy;
    const py = end.dx;
    const x = tx(end.x);
    const y = ty(end.y);
    return (
      <g>
        {isWall ? (
          <line x1={x - px * 16} y1={y - py * 16} x2={x + px * 16} y2={y + py * 16} stroke={WALL_EDGE} strokeWidth={4} />
        ) : (
          <circle cx={x} cy={y} r={3} fill={BG} stroke={INK} strokeWidth={1.5} />
        )}
        <text x={x + end.dx * 24} y={y + end.dy * 24} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={700} letterSpacing={1} fill={INK}>
          {label}
        </text>
      </g>
    );
  };

  return (
    <>
      {door?.kind === 'door' && trace.segments[trace.anchorIndex] && (() => {
        const seg = trace.segments[trace.anchorIndex];
        const hingeLeft = door.door?.hinge_side === 'left';
        const pivot = hingeLeft ? seg.x1 : seg.x2;
        const r = door.width_mm;
        return (
          <path
            d={`M ${tx(pivot)} ${ty(0)} L ${tx(hingeLeft ? pivot + r : pivot - r)} ${ty(0)} A ${r * s} ${r * s} 0 0 ${hingeLeft ? 1 : 0} ${tx(pivot)} ${ty(r)} Z`}
            fill={ACCENT}
            fillOpacity={0.06}
            stroke={ACCENT}
            strokeOpacity={0.3}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })()}
      {ends.left && wallTick(ends.left, leftWall ? 'WALL' : 'OPEN', leftWall)}
      {ends.right && wallTick(ends.right, rightWall ? 'WALL' : 'OPEN', rightWall)}
      {trace.segments.map((seg) => {
        const p = panels[seg.index];
        return (
          <line
            key={p.id}
            x1={tx(seg.x1)}
            y1={ty(seg.y1)}
            x2={tx(seg.x2)}
            y2={ty(seg.y2)}
            stroke={p.kind === 'door' ? ACCENT : INK}
            strokeWidth={p.kind === 'door' ? 5 : 6}
            strokeLinecap="round"
          />
        );
      })}
      {junctions.map((j, i) => {
        if (j.angle_deg !== 90) return null;
        const pt = junctionPoint(trace, i);
        return pt ? <circle key={i} cx={tx(pt.x)} cy={ty(pt.y)} r={4} fill={BG} stroke={INK} strokeWidth={1.5} /> : null;
      })}
      {/* One numbered disc per straight run, at its middle, with its name. */}
      {runs.map((indices, i) => {
        const first = trace.segments[indices[0]];
        const last = trace.segments[indices[indices.length - 1]];
        if (!first || !last) return null;
        const ax = Math.min(first.x1, first.x2, last.x1, last.x2);
        const bx = Math.max(first.x1, first.x2, last.x1, last.x2);
        const ay = Math.min(first.y1, first.y2, last.y1, last.y2);
        const by = Math.max(first.y1, first.y2, last.y1, last.y2);
        const vertical = Math.abs(first.dy) > Math.abs(first.dx);
        const cx = tx((ax + bx) / 2);
        const cy = ty((ay + by) / 2);
        // Discs sit outside the enclosure, where nothing else is drawn: a
        // return gets its disc on the room side, the front gets it out in
        // front, so the names never land on each other.
        const dx = vertical ? (cx < W / 2 ? -20 : 20) : 0;
        const dy = vertical ? 0 : 20;
        const name = runNames[i]?.replace(/^the /, '') ?? `run ${i + 1}`;
        return (
          <g key={i}>
            <circle cx={cx + dx} cy={cy + dy} r={10} fill={ACCENT} />
            <text x={cx + dx} y={cy + dy + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill={BG}>
              {i + 1}
            </text>
            {/* The name runs away from the glass, never across it. */}
            <text
              x={vertical ? cx + dx + (dx < 0 ? 6 : -6) : cx}
              y={cy + dy + (vertical ? 17 : 17)}
              textAnchor={vertical ? (dx < 0 ? 'end' : 'start') : 'middle'}
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={600}
              fill={INK}
            >
              {name}
            </text>
          </g>
        );
      })}
    </>
  );
}

function HeightFigure({
  toCeiling,
  singleDoor,
  leftEnd,
  rightEnd,
  active,
}: {
  toCeiling: boolean;
  singleDoor: boolean;
  leftEnd: EndKind;
  rightEnd: EndKind;
  active: string | null;
}) {
  const gap = toCeiling && singleDoor ? 10 : 0;
  const top = toCeiling ? CEIL + 2 + gap : TOP;
  const right = glassRight(rightEnd);
  return (
    <>
      <Room leftEnd={leftEnd} rightEnd={rightEnd} ceiling={toCeiling} />
      <Glass x1={LF + 6} x2={right - 6} top={top} />
      {!toCeiling && (
        <line x1={LF + 2} y1={TOP} x2={right - 2} y2={TOP} stroke={INK} strokeWidth={1.5} strokeDasharray="5 4" />
      )}
      <Dim x1={150} y1={FLOOR} x2={150} y2={top} label={toCeiling ? 'ceiling' : 'height'} tone={tone('height', active, true)} labelSide="after" />
      {gap > 0 && (
        <Dim x1={236} y1={CEIL + 2} x2={236} y2={CEIL + 2 + gap} label="gap" tone={tone('gap', active, true)} labelSide="after" />
      )}
      {!toCeiling && (
        <text x={LF + 10} y={TOP - 8} fontSize={10} fontWeight={600} fill={INK}>
          top of the glass
        </text>
      )}
    </>
  );
}

function WidthFigure({
  halves,
  tool,
  leftEnd,
  rightEnd,
  tray,
  active,
}: {
  halves: boolean;
  tool: SceneTool;
  leftEnd: EndKind;
  rightEnd: EndKind;
  tray: boolean;
  active: string | null;
}) {
  const right = glassRight(rightEnd);
  const mid = (LF + right) / 2;
  const y = FLOOR - 16;
  return (
    <>
      <Room leftEnd={leftEnd} rightEnd={rightEnd} />
      <Glass x1={LF + 6} x2={right - 6} />
      {rightEnd === 'open' && <FloorMark x={right} y={FLOOR} label="glass stops" />}
      {halves ? (
        <>
          <RefLine x1={mid} y1={TOP - 6} x2={mid} y2={FLOOR - 2} tool={tool} />
          {tool === 'laser' && <LaserBox x={mid} y={FLOOR} />}
          <Dim x1={LF} y1={y} x2={mid} y2={y} label="A" tone={tone('A', active, true)} />
          <Dim x1={mid} y1={y} x2={right} y2={y} label="B" tone={tone('B', active, true)} />
        </>
      ) : (
        <Dim x1={LF} y1={y} x2={right} y2={y} label={active === 'tray' ? '' : 'width'} tone={tone('width', active, true)} />
      )}
      {tray && (
        <Dim x1={LF} y1={FLOOR + 22} x2={W - 6} y2={FLOOR + 22} label="whole tray" tone={tone('tray', active, false)} labelSide="after" />
      )}
    </>
  );
}

function WidthTopFigure({ active }: { active: string | null }) {
  // Drawn leaning in a little at the top left, so the top really is narrower.
  const lean = 14;
  return (
    <>
      <Room leftEnd="wall" rightEnd="wall" leftLeanPx={lean} />
      <Glass x1={LF + 6} x2={RF - 6} />
      <line x1={LF + lean * 0.75} y1={TOP} x2={RF} y2={TOP} stroke={INK} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
      <Dim x1={LF + lean * 0.75} y1={TOP + 10} x2={RF} y2={TOP + 10} label="top" tone={tone('top', active, true)} />
      <Dim x1={LF + lean * 0.38} y1={112} x2={RF} y2={112} label="middle" tone={tone('middle', active, false)} />
      <Dim x1={LF} y1={FLOOR - 16} x2={RF} y2={FLOOR - 16} label="floor" tone="muted" />
    </>
  );
}

function CrossFigure({
  points,
  ceiling,
  tool,
  active,
}: {
  points: [number, number] | null;
  ceiling: boolean;
  tool: SceneTool;
  active: string | null;
}) {
  const cx = 160;
  const cy = 104;
  const on = (n: number) => !!points && n >= points[0] && n <= points[1];
  const t = (n: number) => tone(String(n), active, on(n));
  return (
    <>
      <Room leftEnd="wall" rightEnd="wall" ceiling={ceiling} />
      <RefLine x1={cx} y1={ceiling ? CEIL + 2 : 10} x2={cx} y2={FLOOR - 2} tool={tool} />
      <RefLine x1={LF + 2} y1={cy} x2={RF - 2} y2={cy} tool={tool} />
      {tool === 'laser' ? <LaserBox x={cx} y={FLOOR} /> : <circle cx={cx} cy={cy} r={4} fill={ACCENT} />}
      <Dim x1={LF} y1={FLOOR - 18} x2={cx} y2={FLOOR - 18} label="1" tone={t(1)} point />
      <Dim x1={LF} y1={TOP - 4} x2={cx} y2={TOP - 4} label="2" tone={t(2)} point />
      <Dim x1={cx} y1={FLOOR - 18} x2={RF} y2={FLOOR - 18} label="3" tone={t(3)} point />
      <Dim x1={cx} y1={TOP - 4} x2={RF} y2={TOP - 4} label="4" tone={t(4)} point />
      <Dim x1={76} y1={cy} x2={76} y2={FLOOR} label="5" tone={t(5)} point />
      <Dim x1={244} y1={cy} x2={244} y2={FLOOR} label="6" tone={t(6)} point />
      {ceiling && (
        <>
          <Dim x1={76} y1={CEIL} x2={76} y2={cy} label="7" tone={t(7)} point />
          <Dim x1={244} y1={CEIL} x2={244} y2={cy} label="8" tone={t(8)} point />
        </>
      )}
    </>
  );
}

function WallFigure({
  side,
  tool,
  leanMm,
  packers,
  active,
}: {
  side: 'left' | 'right';
  tool: SceneTool;
  leanMm: number | null;
  packers: boolean;
  active: string | null;
}) {
  // Positive leans into the shower at the top. Before any readings, show a
  // visible lean so the two gaps are obviously different sizes.
  const leanPx = exaggerate(leanMm, 22);
  const flip = side === 'right';
  // Everything is drawn for the left wall and mirrored in x for the right.
  const mx = (x: number) => (flip ? W - x : x);
  const faceBottom = LF;
  const faceTop = LF + leanPx;
  const faceAt = (y: number) => faceBottom + (leanPx * (FLOOR - y)) / FLOOR;
  const midY = (TOP + FLOOR) / 2;
  const laser = tool === 'laser';
  const lineX = LF + 48;
  // A level touches the wall where the wall comes furthest into the room.
  const touchesTop = leanPx > 0;
  const levelX = Math.max(faceTop, faceBottom);

  // The gaps are a few pixels wide against a level, so their labels sit
  // beyond the line or the level, with a leader, rather than on top of them.
  const dim = (y: number, key: string, label: string, on: boolean) => {
    const a = mx(faceAt(y));
    const b = mx(laser ? lineX : levelX);
    const tiny = Math.abs(b - a) < 2;
    const t = tone(key, active, on);
    const colour = t === 'muted' ? INK : ACCENT;
    const beyond = mx((laser ? lineX : levelX + 14) + 10);
    return (
      <g key={key}>
        <Dim x1={a} y1={y} x2={tiny ? a + (flip ? -2 : 2) : b} y2={y} label="" tone={t} />
        <text
          x={beyond}
          y={y}
          textAnchor={flip ? 'end' : 'start'}
          dominantBaseline="middle"
          fontSize={12}
          fontWeight={700}
          fill={colour}
          opacity={t === 'muted' ? 0.55 : 1}
        >
          {tiny ? `${label} 0` : label}
        </text>
      </g>
    );
  };

  return (
    <g>
      <g transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>
        <Room leftEnd="wall" rightEnd="wall" leftLeanPx={leanPx} fade="right" />
        <Glass x1={LF + 8 + Math.max(0, leanPx)} x2={RF - 6} />
        {laser ? (
          <>
            <RefLine x1={lineX} y1={TOP - 14} x2={lineX} y2={FLOOR - 2} tool="laser" />
            <LaserBox x={lineX} y={FLOOR} />
          </>
        ) : (
          <>
            <Level x={levelX} y={TOP - 6} length={FLOOR - TOP + 2} vertical />
            {packers && (
              <Packers
                x={touchesTop ? faceBottom + 1 : faceTop + 1}
                y={touchesTop ? FLOOR - 30 : TOP + 4}
                count={3}
                flip={false}
              />
            )}
          </>
        )}
      </g>
      {dim(TOP + 6, 'top', 'top', true)}
      {dim(midY, 'middle', 'middle', false)}
      {dim(FLOOR - 14, 'bottom', 'bottom', true)}
      {laser && (
        <text x={mx(lineX + 6)} y={TOP - 20} textAnchor={flip ? 'end' : 'start'} fontSize={10} fontWeight={600} fill={ACCENT}>
          laser line
        </text>
      )}
      {leanMm !== null && leanMm !== 0 && (
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={9} fill={INK}>
          lean drawn much bigger than it is
        </text>
      )}
    </g>
  );
}

function FloorFigure({
  tool,
  leftEnd,
  rightEnd,
  fallMm,
  lowEnd,
  active,
}: {
  tool: SceneTool;
  leftEnd: EndKind;
  rightEnd: EndKind;
  fallMm: number | null;
  lowEnd: 'start' | 'end' | null;
  active: string | null;
}) {
  const fallPx = fallMm === null ? 16 : Math.abs(exaggerate(fallMm, 16));
  const low = fallMm === null ? 'end' : lowEnd;
  const right = glassRight(rightEnd);
  const laser = tool === 'laser';
  const lineY = laser ? FLOOR - 46 : FLOOR - 14;
  const floorAt = (x: number) => {
    const l = FLOOR + (low === 'start' ? fallPx : 0);
    const r = FLOOR + (low === 'end' ? fallPx : 0);
    return l + ((r - l) * x) / W;
  };
  const xa = LF + 24;
  const xb = right - 24;
  const dim = (x: number, key: string, label: string) => {
    const top = laser ? lineY : lineY + 14;
    const bottom = floorAt(x);
    const tiny = bottom - top < 2;
    return (
      <Dim
        key={key}
        x1={x}
        y1={top}
        x2={x}
        y2={tiny ? top + 2 : bottom}
        label={tiny ? `${label} 0` : label}
        tone={tone(key, active, true)}
        labelSide={x < W / 2 ? 'before' : 'after'}
      />
    );
  };
  return (
    <>
      <Room leftEnd={leftEnd} rightEnd={rightEnd} floorFallPx={fallPx} floorLowEnd={low} />
      <Glass x1={LF + 6} x2={right - 6} bottom={Math.min(floorAt(LF), floorAt(right)) - 3} />
      {laser ? (
        <>
          <RefLine x1={LF + 4} y1={lineY} x2={right - 4} y2={lineY} tool="laser" />
          <LaserBox x={(LF + right) / 2} y={floorAt((LF + right) / 2)} />
          <text x={(LF + right) / 2} y={lineY - 8} textAnchor="middle" fontSize={10} fontWeight={600} fill={ACCENT}>
            level line
          </text>
        </>
      ) : (
        <Level x={LF + 8} y={Math.min(floorAt(LF + 8), floorAt(right - 8)) - 14} length={right - LF - 16} vertical={false} />
      )}
      {dim(xa, 'start', 'start')}
      {dim(xb, 'end', 'end')}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={9} fill={INK}>
        {fallMm === null ? 'slope drawn bigger than it is' : fallMm === 0 ? 'level' : 'fall drawn much bigger than it is'}
      </text>
    </>
  );
}

function CeilingFigure({
  leftEnd,
  rightEnd,
  dropMm,
  lowEnd,
  active,
}: {
  leftEnd: EndKind;
  rightEnd: EndKind;
  dropMm: number | null;
  lowEnd: 'start' | 'end' | null;
  active: string | null;
}) {
  const dropPx = dropMm === null ? 14 : Math.abs(exaggerate(dropMm, 14));
  const low = dropMm === null ? 'end' : lowEnd;
  const right = glassRight(rightEnd);
  const ceilAt = (x: number) => {
    const l = CEIL + (low === 'start' ? dropPx : 0);
    const r = CEIL + (low === 'end' ? dropPx : 0);
    return l + ((r - l) * x) / W;
  };
  const xa = LF + 24;
  const xb = right - 24;
  return (
    <>
      <Room leftEnd={leftEnd} rightEnd={rightEnd} ceiling ceilingDropPx={dropPx} ceilingLowEnd={low} />
      <Glass x1={LF + 6} x2={right - 6} top={Math.max(ceilAt(LF), ceilAt(right)) + 3} />
      <Dim x1={xa} y1={FLOOR} x2={xa} y2={ceilAt(xa)} label="start" tone={tone('start', active, true)} labelSide="after" />
      <Dim x1={xb} y1={FLOOR} x2={xb} y2={ceilAt(xb)} label="end" tone={tone('end', active, true)} labelSide="before" />
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={9} fill={INK}>
        {dropMm === null ? 'floor to ceiling, at each end' : dropMm === 0 ? 'level ceiling' : 'slope drawn much bigger than it is'}
      </text>
    </>
  );
}

function NotchFigure({ side, active }: { side: 'left' | 'right'; active: string | null }) {
  const flip = side === 'right';
  const w = 44;
  const h = 26;
  const mx = (x: number) => (flip ? W - x : x);
  return (
    <>
      <g transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>
        <Room leftEnd="wall" rightEnd="wall" fade="right" />
        {/* The upstand: a tiled step at the foot of the wall. */}
        <rect x={LF} y={FLOOR - h} width={w} height={h} fill={WALL} stroke={WALL_EDGE} strokeWidth={1.5} />
        <Glass x1={LF + 6} x2={RF - 6} notch={{ side: 'left', w: w - 2, h: h + 4 }} />
      </g>
      <Dim x1={mx(LF)} y1={FLOOR - h - 12} x2={mx(LF + w)} y2={FLOOR - h - 12} label="how far out" tone={tone('width', active, true)} />
      <Dim x1={mx(LF + w + 12)} y1={FLOOR} x2={mx(LF + w + 12)} y2={FLOOR - h} label="how tall" tone={tone('height', active, true)} labelSide={flip ? 'before' : 'after'} />
    </>
  );
}
