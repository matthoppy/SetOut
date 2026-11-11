/**
 * The customer's opening, drawn from their own readings.
 *
 * The laser cross is the datum: every point on the drawing is a reading
 * away from it, so what they see is literally what they measured. Leans,
 * falls and slopes are blown up eight times so they can be seen at all, and
 * the drawing says so. The dimensions are the real numbers.
 *
 * It is laid out as a dimensioned drawing. Inside the opening there is only
 * the door and the cross. Each reading sits on its own line just outside the
 * surface it was taken from, and what the readings add up to sits beyond
 * that. A door is tall and narrow, so numbers written inside it land on each
 * other; outside there is always room.
 */

import { CROSS_POINTS, ceilingSlope, wallLean, type CrossKey, type OpeningMeasurements } from '@setout/engine';
import type { ConfiguratorPanel } from '@setout/engine';

const INK = 'hsl(var(--foreground) / 0.8)';
const FAINT = 'hsl(var(--muted-foreground) / 0.5)';
const ACCENT = 'hsl(var(--measure-accent))';
const BG = 'hsl(var(--background))';
const LASER = '#e11d48';
const GLASS = 'hsl(var(--measure-accent) / 0.08)';
const FONT = 'system-ui, sans-serif';
/** How many times bigger a lean, a fall or a slope is drawn than it is. */
const EX = 8;

// The page, in drawing units. One unit is about one pixel on a phone.
const W = 340;
/** Each side of the opening: a column for the readings, then one for the height they add up to. */
const GUTTER = 82;
/** Above and below it: a row for the readings, then one for the width they add up to. */
const BAND = 56;
/** The opening is never drawn taller than this, so the drawing fits a phone. */
const MAX_TALL = 270;
const TICK = 4;
const MARK_R = 6.5;

interface Props {
  opening: OpeningMeasurements;
  heightMm: number;
  toCeiling: boolean;
  topGapMm: number;
  panels?: ConfiguratorPanel[];
  className?: string;
}

/** A dimension line with a tick at each end. */
function DimLine({ x1, y1, x2, y2, tone, weight = 1 }: { x1: number; y1: number; x2: number; y2: number; tone: string; weight?: number }) {
  const upright = x1 === x2;
  return (
    <g stroke={tone} strokeWidth={1}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={weight} />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) => (upright ? <line key={i} x1={x - TICK} y1={y} x2={x + TICK} y2={y} /> : <line key={i} x1={x} y1={y - TICK} x2={x} y2={y + TICK} />))}
    </g>
  );
}

/** How much room a reading takes when written out: its circled number, then the figure. */
const readingWidth = (value: number) => MARK_R * 2 + 3 + String(value).length * 6.4;

/** A reading as written on the drawing, with the same circled number as its card. */
function Reading({ n, value, x, y, anchor }: { n: number; value: number; x: number; y: number; anchor: 'start' | 'middle' | 'end' }) {
  const width = readingWidth(value);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return (
    <g fontFamily={FONT} fill={ACCENT}>
      <circle cx={left + MARK_R} cy={y} r={MARK_R} fill={BG} stroke={ACCENT} strokeWidth={1} />
      <text x={left + MARK_R} y={y + 3} textAnchor="middle" fontSize={8.5} fontWeight={700}>
        {n}
      </text>
      <text x={left + MARK_R * 2 + 3} y={y + 3.9} fontSize={11} fontWeight={600}>
        {value}
      </text>
    </g>
  );
}

/**
 * A wall-to-laser reading. The number sits beside its line, or beyond the
 * wall end of it when the line is too short to carry the number, as on any
 * drawing.
 */
function AcrossReading({ n, value, wallX, laserX, y, labelY }: { n: number; value: number; wallX: number; laserX: number; y: number; labelY: number }) {
  const fits = Math.abs(laserX - wallX) >= readingWidth(value) + 8;
  const leftOfLaser = wallX < laserX;
  return (
    <g>
      <DimLine x1={wallX} y1={y} x2={laserX} y2={y} tone={ACCENT} />
      {fits ? (
        <Reading n={n} value={value} x={(wallX + laserX) / 2} y={labelY} anchor="middle" />
      ) : (
        <Reading n={n} value={value} x={leftOfLaser ? wallX - 7 : wallX + 7} y={y} anchor={leftOfLaser ? 'end' : 'start'} />
      )}
    </g>
  );
}

/** A floor or ceiling reading, from the level line to the surface, with its number beside it. */
function UprightReading({ n, value, x, lineY, surfaceY, side }: { n: number; value: number; x: number; lineY: number; surfaceY: number; side: 'left' | 'right' }) {
  return (
    <g>
      <DimLine x1={x} y1={lineY} x2={x} y2={surfaceY} tone={ACCENT} />
      <Reading n={n} value={value} x={side === 'left' ? x - 6 : x + 6} y={(lineY + surfaceY) / 2} anchor={side === 'left' ? 'end' : 'start'} />
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
  const c = opening.crossReadings;
  const run = opening.runs[0];
  // Nothing here is drawn from a guess. With a reading missing there is no drawing.
  if (!c || !run || CROSS_POINTS.some((p) => (p.n <= 6 || toCeiling) && c[p.key] === null)) return null;
  const mm = (key: CrossKey) => c[key] ?? 0;

  const lb = mm('leftBottomMm');
  const lt = mm('leftTopMm');
  const rb = mm('rightBottomMm');
  const rt = mm('rightTopMm');
  const fl = mm('floorLeftMm');
  const fr = mm('floorRightMm');
  // Without a ceiling the drawing stops at the top of the glass, which is level.
  const cl = toCeiling ? mm('ceilingLeftMm') : Math.max(0, heightMm - fl);
  const cr = toCeiling ? mm('ceilingRightMm') : cl;

  // The four corners in millimetres from the cross, right and down, with the
  // difference between each pair of readings blown up.
  const corner = {
    bl: { x: -lb, y: fl },
    br: { x: rb, y: fl + (fr - fl) * EX },
    tl: { x: -lb + (lb - lt) * EX, y: -cl },
    tr: { x: rb - (rb - rt) * EX, y: -cl - (cr - cl) * EX },
  };
  const minX = Math.min(corner.bl.x, corner.tl.x);
  const maxX = Math.max(corner.br.x, corner.tr.x);
  const minY = Math.min(corner.tl.y, corner.tr.y);
  const maxY = Math.max(corner.bl.y, corner.br.y);

  // One scale for both directions, so the opening keeps its true proportions,
  // chosen so the blown-up shape fits between the gutters.
  const s = Math.min((W - GUTTER * 2) / Math.max(maxX - minX, 1), MAX_TALL / Math.max(maxY - minY, 1));
  const crossX = W / 2 - ((minX + maxX) / 2) * s;
  const lineY = BAND - minY * s;
  const H = BAND * 2 + (maxY - minY) * s;

  const blx = crossX + corner.bl.x * s;
  const brx = crossX + corner.br.x * s;
  const tlx = crossX + corner.tl.x * s;
  const trx = crossX + corner.tr.x * s;
  const floorL = lineY + corner.bl.y * s;
  const floorR = lineY + corner.br.y * s;
  const ceilL = lineY + corner.tl.y * s;
  const ceilR = lineY + corner.tr.y * s;
  const topY = BAND;
  const bottomY = H - BAND;
  const outL = crossX + minX * s;
  const outR = crossX + maxX * s;

  // Where the dimensions sit: a row of readings then the width above and
  // below, a column of readings then the height on each side.
  const rowT = topY - 12;
  const wideT = topY - 36;
  const rowB = bottomY + 12;
  const wideB = bottomY + 36;
  const readL = outL - 10;
  const readR = outR + 10;
  const tallL = outL - 64;
  const tallR = outR + 64;

  const left = wallLean(opening.startWall);
  const right = wallLean(opening.endWall);
  const slope = ceilingSlope(run);
  const outOfTrue = (left?.leanMm ?? 0) > 0 || (right?.leanMm ?? 0) > 0 || run.floorFallMm > 0 || (slope?.dropMm ?? 0) > 0;

  // Where each wall is at a given height, since on the drawing they lean.
  const leftAt = (y: number) => blx + ((tlx - blx) * (floorL - y)) / Math.max(floorL - ceilL, 1);
  const rightAt = (y: number) => brx + ((trx - brx) * (floorR - y)) / Math.max(floorR - ceilR, 1);

  // The door inside the opening: up to the lowest ceiling less the gap, or
  // the height they chose.
  const doorMm = Math.round(toCeiling ? (opening.ceilingHeightMm ?? heightMm) - topGapMm : heightMm);
  const doorTop = toCeiling ? Math.max(ceilL, ceilR) + topGapMm * s : floorL - heightMm * s;
  const notch = panels.find((p) => p.notches?.bottom_left || p.notches?.bottom_right)?.notches;

  // The door's name and height go under the level line, or over it when the
  // laser stood too low to leave room, in the middle of the door at that
  // height. A narrow door gets the bare figure. The laser's upright line
  // stops for the words where it would run through them.
  const under = Math.min(floorL, floorR) - lineY >= 44 || lineY - doorTop < 44;
  const nameY = under ? lineY + 15 : lineY - 22;
  const sizeY = nameY + 14;
  const doorL = leftAt(sizeY) + 4;
  const doorR = rightAt(sizeY) - 4;
  const doorX = (doorL + doorR) / 2;
  const figureWidth = String(doorMm).length * 7.7;
  const unitFits = figureWidth + 22 <= doorR - doorL - 6;
  const sizeText = unitFits ? `${doorMm}mm` : `${doorMm}`;
  const crossesWords = Math.abs(crossX - doorX) < (figureWidth + (unitFits ? 22 : 0)) / 2 + 3;
  const uprightTop = rowT - TICK;
  const uprightBottom = rowB + TICK;
  const upright = crossesWords
    ? [
        [uprightTop, nameY - 10],
        [sizeY + 5, uprightBottom],
      ]
    : [[uprightTop, uprightBottom]];

  // The laser is named at the end of its level line, clear of the door. It
  // moves off the line only when a reading beside it is too short to leave room.
  const laserNameY = floorR - lineY < 32 ? lineY - 5 : toCeiling && lineY - ceilR < 32 ? lineY + 11 : lineY + 3;

  // A faint line from each corner out to the dimensions that reach from it.
  const sideL = (toCeiling ? tallL : readL) - TICK;
  const sideR = (toCeiling ? tallR : readR) + TICK;
  const extensions = [
    [blx, floorL + 3, blx, wideB + TICK],
    [brx, floorR + 3, brx, wideB + TICK],
    [tlx, ceilL - 3, tlx, wideT - TICK],
    [trx, ceilR - 3, trx, wideT - TICK],
    [blx - 3, floorL, sideL, floorL],
    [brx + 3, floorR, sideR, floorR],
    ...(toCeiling
      ? [
          [tlx - 3, ceilL, sideL, ceilL],
          [trx + 3, ceilR, sideR, ceilR],
        ]
      : []),
  ];

  const overall = { fontSize: 12, fontWeight: 700, fill: INK, fontFamily: FONT, textAnchor: 'middle' as const };
  const midL = (floorL + ceilL) / 2;
  const midR = (floorR + ceilR) / 2;

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Your opening drawn from your measurements, with every number on it">
        {/* The walls and floor as measured, and the ceiling when it was measured. */}
        <path
          d={`M ${tlx} ${ceilL} L ${blx} ${floorL} L ${brx} ${floorR} L ${trx} ${ceilR}${toCeiling ? ' Z' : ''}`}
          fill={GLASS}
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {outOfTrue && <rect x={blx} y={topY} width={brx - blx} height={bottomY - topY} fill="none" stroke={FAINT} strokeWidth={1} strokeDasharray="4 4" />}

        {/* The glass. */}
        <path d={`M ${blx + 4} ${floorL} L ${brx - 4} ${floorR} L ${rightAt(doorTop) - 4} ${doorTop} L ${leftAt(doorTop) + 4} ${doorTop} Z`} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={1.4} />
        {notch && (
          <rect x={notch.bottom_left ? blx + 4 : brx - 4 - notch.width_mm * s} y={floorL - notch.height_mm * s} width={notch.width_mm * s} height={notch.height_mm * s} fill={BG} stroke={ACCENT} strokeWidth={1.2} />
        )}

        <g stroke={FAINT} strokeWidth={0.75}>
          {extensions.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>

        {/* The laser cross. */}
        <g stroke={LASER} strokeWidth={1} strokeDasharray="6 3">
          {upright.map(([y1, y2], i) => y2 > y1 && <line key={i} x1={crossX} y1={y1} x2={crossX} y2={y2} />)}
          <line x1={readL - TICK} y1={lineY} x2={readR + TICK} y2={lineY} />
        </g>
        <text x={readR + TICK + 4} y={laserNameY} fontSize={9} fontWeight={600} fill={LASER} fontFamily={FONT}>
          laser
        </text>

        <g fill={ACCENT} fontFamily={FONT} textAnchor="middle">
          <text x={doorX} y={nameY} fontSize={9.5} fontWeight={600}>
            door
          </text>
          <text x={doorX} y={sizeY} fontSize={12} fontWeight={700}>
            {sizeText}
          </text>
        </g>

        {/* Readings 1 to 4: each wall to the laser, along the floor and at the top. */}
        <AcrossReading n={1} value={lb} wallX={blx} laserX={crossX} y={rowB} labelY={rowB + 11} />
        <AcrossReading n={3} value={rb} wallX={brx} laserX={crossX} y={rowB} labelY={rowB + 11} />
        <AcrossReading n={2} value={lt} wallX={tlx} laserX={crossX} y={rowT} labelY={rowT - 11} />
        <AcrossReading n={4} value={rt} wallX={trx} laserX={crossX} y={rowT} labelY={rowT - 11} />

        {/* Readings 5 to 8: the floor and the ceiling to the level line. */}
        <UprightReading n={5} value={fl} x={readL} lineY={lineY} surfaceY={floorL} side="left" />
        <UprightReading n={6} value={fr} x={readR} lineY={lineY} surfaceY={floorR} side="right" />
        {toCeiling && (
          <>
            <UprightReading n={7} value={cl} x={readL} lineY={lineY} surfaceY={ceilL} side="left" />
            <UprightReading n={8} value={cr} x={readR} lineY={lineY} surfaceY={ceilR} side="right" />
          </>
        )}

        {/* What the readings add up to. */}
        <DimLine x1={blx} y1={wideB} x2={brx} y2={wideB} tone={INK} weight={1.4} />
        <text x={(blx + brx) / 2} y={wideB + 15} {...overall}>
          {lb + rb}mm at the floor
        </text>
        <DimLine x1={tlx} y1={wideT} x2={trx} y2={wideT} tone={INK} weight={1.4} />
        <text x={(tlx + trx) / 2} y={wideT - 6} {...overall}>
          {lt + rt}mm at the top
        </text>
        {toCeiling && (
          <>
            <DimLine x1={tallL} y1={floorL} x2={tallL} y2={ceilL} tone={INK} weight={1.4} />
            <text x={tallL - 6} y={midL} transform={`rotate(-90 ${tallL - 6} ${midL})`} {...overall}>
              {fl + cl}mm
            </text>
            <DimLine x1={tallR} y1={floorR} x2={tallR} y2={ceilR} tone={INK} weight={1.4} />
            <text x={tallR + 15} y={midR} transform={`rotate(-90 ${tallR + 15} ${midR})`} {...overall}>
              {fr + cr}mm
            </text>
          </>
        )}
      </svg>
      {outOfTrue && (
        <figcaption className="mt-1 text-center text-xs text-muted-foreground">
          Leans, falls and slopes are drawn {EX} times bigger so you can see them. The numbers are yours.
        </figcaption>
      )}
    </figure>
  );
}
