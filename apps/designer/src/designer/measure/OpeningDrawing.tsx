/**
 * The customer's opening, drawn from their own eight readings.
 *
 * The laser cross is the datum: every point on the drawing is a reading
 * away from it, so what they see is literally what they measured. Leans,
 * falls and slopes are blown up eight times so they can be seen at all, and
 * the drawing says so. The dimensions are the real numbers.
 */

import { ceilingSlope, wallLean, type CrossReadings, type OpeningMeasurements } from '@setout/engine';
import type { ConfiguratorPanel } from '@setout/engine';

const INK = 'hsl(var(--foreground) / 0.8)';
const FAINT = 'hsl(var(--muted-foreground) / 0.5)';
const ACCENT = 'hsl(var(--measure-accent))';
const LASER = '#e11d48';
const GLASS = 'hsl(var(--measure-accent) / 0.08)';
const FONT = 'system-ui, sans-serif';
const EX = 8;

interface Props {
  opening: OpeningMeasurements;
  heightMm: number;
  toCeiling: boolean;
  topGapMm: number;
  panels?: ConfiguratorPanel[];
  className?: string;
}

/** A dimension line with ticks at both ends and the number on it. */
function Dim({ x1, y1, x2, y2, text, side = 'above', tone = INK, bold = false }: { x1: number; y1: number; x2: number; y2: number; text: string; side?: 'above' | 'below' | 'left' | 'right'; tone?: string; bold?: boolean }) {
  const vertical = x1 === x2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const tick = 4;
  const tx = vertical ? (side === 'left' ? x1 - 6 : x1 + 6) : mx;
  const ty = vertical ? my + 3.5 : side === 'above' ? y1 - 5 : y1 + 12;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone} strokeWidth={bold ? 1.4 : 1} />
      {vertical ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} stroke={tone} strokeWidth={1} />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} stroke={tone} strokeWidth={1} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} stroke={tone} strokeWidth={1} />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} stroke={tone} strokeWidth={1} />
        </>
      )}
      <text x={tx} y={ty} textAnchor={vertical ? (side === 'left' ? 'end' : 'start') : 'middle'} fontSize={bold ? 12 : 10.5} fontWeight={bold ? 700 : 600} fill={tone} fontFamily={FONT}>
        {text}
      </text>
    </g>
  );
}

/** What the readings say about the walls, floor and ceiling, in words. */
export function openingFindings(opening: OpeningMeasurements, toCeiling: boolean, topGapMm: number, heightMm: number): string[] {
  const run = opening.runs[0];
  const out: string[] = [];
  if (!run) return out;
  const left = wallLean(opening.startWall);
  const right = wallLean(opening.endWall);
  const slope = ceilingSlope(run);
  out.push(left && left.leanMm > 0 ? `Left wall leans ${left.leanMm}mm ${left.direction} at the top` : 'Left wall straight up');
  out.push(right && right.leanMm > 0 ? `Right wall leans ${right.leanMm}mm ${right.direction} at the top` : 'Right wall straight up');
  out.push(run.floorFallMm > 0 ? `Floor ${run.floorFallMm}mm lower on the ${run.floorLowEnd === 'start' ? 'left' : 'right'}` : 'Floor level');
  if (toCeiling && slope) {
    out.push(slope.dropMm > 0 ? `Ceiling ${slope.dropMm}mm lower on the ${slope.lowEnd === 'start' ? 'left' : 'right'}` : 'Ceiling level');
    out.push(`Door ${Math.round((opening.ceilingHeightMm ?? heightMm) - topGapMm)}mm, with a ${topGapMm}mm gap above it`);
  } else {
    out.push(`Glass ${heightMm}mm tall`);
  }
  return out;
}

export function OpeningDrawing({ opening, heightMm, toCeiling, topGapMm, panels = [], className }: Props) {
  const c: CrossReadings | null = opening.crossReadings ?? null;
  const run = opening.runs[0];
  if (!c || !run) return null;
  const r = (k: keyof CrossReadings) => c[k] ?? 0;

  // Real sizes.
  const bottomW = r('leftBottomMm') + r('rightBottomMm');
  const topW = r('leftTopMm') + r('rightTopMm');
  const leftH = toCeiling ? r('floorLeftMm') + r('ceilingLeftMm') : r('floorLeftMm') + Math.max(0, heightMm - r('floorLeftMm'));
  const rightH = toCeiling ? r('floorRightMm') + r('ceilingRightMm') : r('floorRightMm') + Math.max(0, heightMm - r('floorRightMm'));
  const tallest = Math.max(leftH, rightH, heightMm, 1);
  const widest = Math.max(bottomW, topW, 1);

  // The page. Dimension strings sit outside the opening on all four sides.
  const W = 400;
  const H = 440;
  const padX = 86;
  const padTop = 76;
  const padBottom = 70;
  const s = Math.min((W - padX * 2) / widest, (H - padTop - padBottom) / tallest);

  // The cross is the datum. Up is negative y.
  const lineY = padTop + (toCeiling ? Math.max(r('ceilingLeftMm'), r('ceilingRightMm')) : Math.max(0, heightMm - Math.min(r('floorLeftMm'), r('floorRightMm')))) * s;
  const crossX = padX + Math.max(r('leftBottomMm'), r('leftTopMm')) * s;

  // Exaggerated out-of-true: differences between paired readings, times EX.
  const leftLean = (r('leftBottomMm') - r('leftTopMm')) * s * EX;
  const rightLean = (r('rightBottomMm') - r('rightTopMm')) * s * EX;
  const floorL = lineY + r('floorLeftMm') * s;
  const floorR = floorL + (r('floorRightMm') - r('floorLeftMm')) * s * EX;
  const ceilL = toCeiling ? lineY - r('ceilingLeftMm') * s : lineY - (heightMm - r('floorLeftMm')) * s;
  const ceilR = toCeiling ? ceilL - (r('ceilingRightMm') - r('ceilingLeftMm')) * s * EX : ceilL;

  const blx = crossX - r('leftBottomMm') * s;
  const brx = crossX + r('rightBottomMm') * s;
  const tlx = blx + leftLean;
  const trx = brx - rightLean;

  const left = wallLean(opening.startWall);
  const right = wallLean(opening.endWall);
  const slope = ceilingSlope(run);
  const outOfTrue = (left?.leanMm ?? 0) > 0 || (right?.leanMm ?? 0) > 0 || run.floorFallMm > 0 || (slope?.dropMm ?? 0) > 0;

  // The door (glass) inside the opening: to the lowest ceiling less the gap,
  // or the chosen height.
  const doorTop = toCeiling ? Math.max(ceilL, ceilR) + topGapMm * s : floorL - heightMm * s;
  const notch = panels.find((p) => p.notches?.bottom_left || p.notches?.bottom_right)?.notches;

  const bottomY = Math.max(floorL, floorR);
  const topY = Math.min(ceilL, ceilR);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Your opening drawn from your measurements, with every number on it">
      {/* The walls, floor and ceiling as measured. */}
      <path d={`M ${tlx} ${ceilL} L ${trx} ${ceilR} L ${brx} ${floorR} L ${blx} ${floorL} Z`} fill={GLASS} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {outOfTrue && <rect x={blx} y={bottomY - (bottomY - topY)} width={brx - blx} height={bottomY - topY} fill="none" stroke={FAINT} strokeWidth={1} strokeDasharray="4 4" />}

      {/* The glass. */}
      <g>
        <path
          d={`M ${blx + 4} ${floorL} L ${brx - 4} ${floorR} L ${trx - 4} ${doorTop} L ${tlx + 4} ${doorTop} Z`}
          fill={ACCENT}
          fillOpacity={0.12}
          stroke={ACCENT}
          strokeWidth={1.4}
        />
        {notch && (
          <rect x={notch.bottom_left ? blx + 4 : brx - 4 - notch.width_mm * s} y={floorL - notch.height_mm * s} width={notch.width_mm * s} height={notch.height_mm * s} fill="hsl(var(--background))" stroke={ACCENT} strokeWidth={1.2} />
        )}
        <text x={(blx + brx) / 2} y={(doorTop + floorL) / 2} textAnchor="middle" fontSize={11} fontWeight={700} fill={ACCENT} fontFamily={FONT}>
          door {Math.round(toCeiling ? (opening.ceilingHeightMm ?? heightMm) - topGapMm : heightMm)}mm
        </text>
      </g>

      {/* The laser cross. */}
      <line x1={crossX} y1={topY - 10} x2={crossX} y2={bottomY + 10} stroke={LASER} strokeWidth={1} strokeDasharray="6 3" />
      <line x1={blx - 10} y1={lineY} x2={brx + 10} y2={lineY} stroke={LASER} strokeWidth={1} strokeDasharray="6 3" />
      <text x={crossX + 4} y={topY - 12} fontSize={9} fontWeight={600} fill={LASER} fontFamily={FONT}>
        laser
      </text>

      {/* The eight readings, each from its surface to the line. */}
      <Dim x1={blx} y1={floorL - 10} x2={crossX} y2={floorL - 10} text={`① ${r('leftBottomMm')}`} side="above" tone={ACCENT} />
      <Dim x1={crossX} y1={floorR - 10} x2={brx} y2={floorR - 10} text={`③ ${r('rightBottomMm')}`} side="above" tone={ACCENT} />
      <Dim x1={tlx} y1={ceilL + 16} x2={crossX} y2={ceilL + 16} text={`② ${r('leftTopMm')}`} side="below" tone={ACCENT} />
      <Dim x1={crossX} y1={ceilR + 16} x2={trx} y2={ceilR + 16} text={`④ ${r('rightTopMm')}`} side="below" tone={ACCENT} />
      <Dim x1={blx + 22} y1={lineY} x2={blx + 22} y2={floorL} text={`⑤ ${r('floorLeftMm')}`} side="right" tone={ACCENT} />
      <Dim x1={brx - 22} y1={lineY} x2={brx - 22} y2={floorR} text={`⑥ ${r('floorRightMm')}`} side="left" tone={ACCENT} />
      {toCeiling && (
        <>
          <Dim x1={blx + 22} y1={lineY} x2={blx + 22} y2={ceilL} text={`⑦ ${r('ceilingLeftMm')}`} side="right" tone={ACCENT} />
          <Dim x1={brx - 22} y1={lineY} x2={brx - 22} y2={ceilR} text={`⑧ ${r('ceilingRightMm')}`} side="left" tone={ACCENT} />
        </>
      )}

      {/* Overall sizes outside the opening. */}
      <Dim x1={blx} y1={bottomY + 24} x2={brx} y2={bottomY + 24} text={`${bottomW}mm at the floor`} side="below" bold />
      <Dim x1={tlx} y1={topY - 30} x2={trx} y2={topY - 30} text={`${topW}mm at the top`} side="above" bold />
      <Dim x1={blx - 34} y1={floorL} x2={blx - 34} y2={ceilL} text={`${Math.round(leftH)}`} side="left" bold />
      <Dim x1={brx + 34} y1={floorR} x2={brx + 34} y2={ceilR} text={`${Math.round(rightH)}`} side="right" bold />

      {outOfTrue && (
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={9.5} fill={FAINT} fontFamily={FONT}>
          Leans and falls drawn {EX}× so you can see them. The numbers are yours.
        </text>
      )}
    </svg>
  );
}
