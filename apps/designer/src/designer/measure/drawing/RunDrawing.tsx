/**
 * One run of glass, face on from outside the shower, drawn from its own
 * readings: how long it is along the floor, what the floor does under it, the
 * ceiling where the glass reaches it, and the lean of each wall it ends on.
 *
 * The laser's level line is the datum for the floor, as it was in the room.
 * A wall is drawn against the upright line the laser stood off it. A corner
 * or an open end has no wall, so the glass sets its own upright there.
 * Measured with a tape and a level, the level is the datum, drawn in ink:
 * nothing on a tape-measured drawing is laser red.
 */

import { readField, runNames, type CardField, type ConfiguratorState, type MeasureCardDef, type RunView } from '@setout/engine';
import { ACCENT, AcrossReading, BG, DimLine, EX, FAINT, FONT, GLASS, GUTTER, INK, LASER, MARK_R, Overall, Reading, TICK, UprightReading, W } from './parts';

/** A run is never drawn taller than this, so a shower with three of them stays readable on a phone. */
const MAX_TALL = 230;
/** How far off a wall its upright laser line is drawn. The real 50mm would be too small to see. */
const OFF_WALL = 12;

const same = (a: CardField, b: CardField) => JSON.stringify(a) === JSON.stringify(b);

/** A reading the deck asked for: its number as typed, and its circled number. */
function reader(state: ConfiguratorState, cards: MeasureCardDef[]) {
  return (field: CardField): { value: number | null; n?: number } => {
    const card = cards.find((c) => c.field && same(c.field, field));
    return { value: card ? readField(state, field) : null, n: card?.mark };
  };
}

export function RunDrawing({ state, cards, view, className }: { state: ConfiguratorState; cards: MeasureCardDef[]; view: RunView; className?: string }) {
  const read = reader(state, cards);
  const i = view.run;
  const run = state.opening.runs[i];
  const toCeiling = state.isFloorToCeiling;
  if (!run) return null;

  const whole = read({ kind: 'width', run: i });
  const halfA = read({ kind: 'half', run: i, half: 'a' });
  const halfB = read({ kind: 'half', run: i, half: 'b' });
  const tray = read({ kind: 'tray' });
  const floorS = read({ kind: 'floor', run: i, end: 'start' });
  const floorE = read({ kind: 'floor', run: i, end: 'end' });
  const ceilS = read({ kind: 'ceiling', run: i, end: 'start' });
  const ceilE = read({ kind: 'ceiling', run: i, end: 'end' });
  const wallL = i === 0 && view.left === 'wall' ? { bottom: read({ kind: 'wall', wall: 'start', at: 'bottom' }), top: read({ kind: 'wall', wall: 'start', at: 'top' }) } : null;
  const wallR = i === view.of - 1 && view.right === 'wall' ? { bottom: read({ kind: 'wall', wall: 'end', at: 'bottom' }), top: read({ kind: 'wall', wall: 'end', at: 'top' }) } : null;
  const height = read({ kind: 'height' });
  // Measured with a tape between two walls: the width again at the top.
  const topWidth = read({ kind: 'top', run: i });

  const inHalves = halfA.value !== null && halfB.value !== null;
  const width = inHalves ? (halfA.value ?? 0) + (halfB.value ?? 0) : whole.value;
  // Nothing here is drawn from a guess. With a reading missing there is no drawing.
  const needed = [floorS.value, floorE.value, ...(toCeiling ? [ceilS.value, ceilE.value] : []), ...[wallL, wallR].flatMap((w) => (w ? [w.bottom.value, w.top.value] : []))];
  if (width === null || needed.some((v) => v === null)) return null;

  const fs = floorS.value ?? 0;
  const fe = floorE.value ?? 0;
  const cs = toCeiling ? (ceilS.value ?? 0) : state.heightMm;
  const ce = toCeiling ? (ceilE.value ?? 0) : state.heightMm;
  // How far each wall's top is from where its foot is, towards the outside. Positive leans away from the glass.
  const leanOut = (w: typeof wallL) => (w ? (w.top.value ?? 0) - (w.bottom.value ?? 0) : 0);
  // The tray beside a walk-in screen runs on past where the glass stops.
  const trayMm = tray.value !== null && tray.value > width ? tray.value : null;

  // The four corners in millimetres from the left foot and the level line,
  // right and down, with what is out of true blown up.
  const corner = {
    bl: { x: 0, y: fs },
    br: { x: width, y: fs + (fe - fs) * EX },
    tl: { x: -leanOut(wallL) * EX, y: fs - cs },
    // Without a ceiling the top of the glass is level. With one, its far end
    // is as much lower as the two heights and the floor between them make it.
    tr: { x: width + leanOut(wallR) * EX, y: fs - cs + (toCeiling ? (cs - ce + fe - fs) * EX : 0) },
  };
  const minX = Math.min(corner.bl.x, corner.tl.x);
  const maxX = Math.max(corner.br.x, corner.tr.x, trayMm ?? 0);
  const minY = Math.min(corner.tl.y, corner.tr.y, 0);
  const maxY = Math.max(corner.bl.y, corner.br.y);
  const s = Math.min((W - GUTTER * 2) / Math.max(maxX - minX, 1), MAX_TALL / Math.max(maxY - minY, 1));

  // Rows above and below the glass: a wall's two readings nearest it, then
  // the width, then what the width adds up to.
  const gapRows = wallL || wallR ? 20 : 0;
  const top = 8 + gapRows + (topWidth.value !== null ? 30 : 0);
  const twoRows = inHalves || trayMm !== null;
  const below = gapRows + (twoRows ? 56 : 34);

  const x0 = W / 2 - ((minX + maxX) / 2) * s;
  const lineY = top - minY * s;
  const H = top + (maxY - minY) * s + below;
  const blx = x0 + corner.bl.x * s;
  const brx = x0 + corner.br.x * s;
  const tlx = x0 + corner.tl.x * s;
  const trx = x0 + corner.tr.x * s;
  const floorL = lineY + corner.bl.y * s;
  const floorR = lineY + corner.br.y * s;
  const ceilL = lineY + corner.tl.y * s;
  const ceilR = lineY + corner.tr.y * s;
  const bottomY = lineY + maxY * s;
  const topY = lineY + Math.min(corner.tl.y, corner.tr.y) * s;
  const outL = x0 + minX * s;
  const outR = x0 + maxX * s;
  const trayX = trayMm === null ? null : x0 + trayMm * s;

  const gapB = bottomY + 10;
  const gapT = topY - 10;
  const rowB = bottomY + gapRows + 12;
  const wideB = rowB + 24;
  const readL = outL - 10;
  const readR = outR + 10;
  const tallL = outL - 64;
  const tallR = outR + 64;

  // Where each side of the glass is at a given height, since on the drawing a wall leans.
  const leftAt = (y: number) => blx + ((tlx - blx) * (floorL - y)) / Math.max(floorL - ceilL, 1);
  const rightAt = (y: number) => brx + ((trx - brx) * (floorR - y)) / Math.max(floorR - ceilR, 1);

  // Where the laser stood for the two halves.
  const splitX = inHalves ? blx + (halfA.value ?? 0) * s : null;

  // The glass is named in its middle, under the level line when there is
  // room and over it when the laser stood low. A narrow run gets the bare
  // figure, and a very narrow one is left clear.
  const glassTop = Math.max(ceilL, ceilR);
  const glassMm = Math.round(toCeiling ? Math.max(cs, ce) : state.heightMm);
  const under = Math.min(floorL, floorR) - lineY >= 44 || lineY - glassTop < 44;
  const nameY = under ? lineY + 15 : lineY - 22;
  const sizeY = nameY + 14;
  const insideL = leftAt(sizeY) + 4;
  const insideR = rightAt(sizeY) - 4;
  const glassX = (insideL + insideR) / 2;
  const room = insideR - insideL - 6;
  const figureWidth = String(glassMm).length * 7.7;
  const sizeText = figureWidth + 22 <= room ? `${glassMm}mm` : figureWidth <= room ? `${glassMm}` : null;
  const wordsWide = sizeText === null ? 0 : figureWidth + (sizeText.endsWith('mm') ? 22 : 0);
  const name = view.surface === 'bath' ? 'screen' : 'glass';
  const numbered = !toCeiling && height.n !== undefined && room >= 46;

  // An upright laser line stops for the words where it would run through them.
  const broken = (x: number, y1: number, y2: number): [number, number][] =>
    sizeText !== null && Math.abs(x - glassX) < wordsWide / 2 + 3
      ? [
          [y1, nameY - 10],
          [sizeY + 5, y2],
        ]
      : [[y1, y2]];

  // A faint line from each corner out to the dimensions that reach from it.
  const farL = (toCeiling ? tallL : readL) - TICK;
  const farR = (toCeiling ? tallR : readR) + TICK;
  const extensions = [
    [blx, floorL + 3, blx, (twoRows ? wideB : rowB) + TICK],
    [brx, floorR + 3, brx, (inHalves ? wideB : rowB) + TICK],
    [blx - 3, floorL, farL, floorL],
    [brx + 3, floorR, farR, floorR],
    ...(toCeiling
      ? [
          [tlx - 3, ceilL, farL, ceilL],
          [trx + 3, ceilR, farR, ceilR],
        ]
      : []),
    ...(trayX !== null ? [[trayX, floorR + 3, trayX, wideB + TICK]] : []),
  ];

  const names = runNames(state);
  // Measured with a level, not a laser: its lines are drawn in ink, and not named laser.
  const level = state.opening.method !== 'laser';
  const datum = level ? INK : LASER;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`${names[i] ?? 'The glass'} drawn from your measurements, with every number on it`}>
      {/* The glass, with a wall where it ends on one and the ceiling where it reaches it. */}
      <path d={`M ${tlx} ${ceilL} L ${blx} ${floorL} L ${brx} ${floorR} L ${trx} ${ceilR}${toCeiling ? ' Z' : ''}`} fill={GLASS} stroke="none" />
      <path d={`M ${leftAt(glassTop) + 4} ${glassTop} L ${blx + 4} ${floorL} L ${brx - 4} ${floorR} L ${rightAt(glassTop) - 4} ${glassTop} Z`} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={1.4} />
      <g stroke={INK} strokeWidth={2} strokeLinecap="round" fill="none">
        <line x1={blx} y1={floorL} x2={brx} y2={floorR} />
        {trayX !== null && <line x1={brx} y1={floorR} x2={trayX} y2={floorR} strokeWidth={1.2} />}
        {wallL && <line x1={tlx} y1={ceilL} x2={blx} y2={floorL} />}
        {wallR && <line x1={trx} y1={ceilR} x2={brx} y2={floorR} />}
        {toCeiling && <line x1={tlx} y1={ceilL} x2={trx} y2={ceilR} />}
      </g>

      <g stroke={FAINT} strokeWidth={0.75}>
        {extensions.map(([x1, y1, x2, y2], k) => (
          <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>

      {/* The laser: its level line for the floor, and an upright line wherever it stood for a reading across. */}
      <g stroke={datum} strokeWidth={1} strokeDasharray="6 3" opacity={level ? 0.6 : 1}>
        <line x1={readL - TICK} y1={lineY} x2={readR + TICK} y2={lineY} />
        {splitX !== null && broken(splitX, glassTop - 6, rowB + TICK).map(([y1, y2], k) => y2 > y1 && <line key={k} x1={splitX} y1={y1} x2={splitX} y2={y2} />)}
      </g>
      <g stroke={datum} strokeWidth={0.8} strokeDasharray="3 3" opacity={level ? 0.5 : 0.75}>
        {wallL && <line x1={blx + OFF_WALL} y1={gapT - TICK} x2={blx + OFF_WALL} y2={gapB + TICK} />}
        {wallR && <line x1={brx - OFF_WALL} y1={gapT - TICK} x2={brx - OFF_WALL} y2={gapB + TICK} />}
      </g>
      {!level && (
        <text x={readR + TICK + 4} y={floorR - lineY < 32 ? lineY - 5 : lineY + 3} fontSize={9} fontWeight={600} fill={LASER} fontFamily={FONT}>
          laser
        </text>
      )}

      {sizeText !== null && (
        <g fill={ACCENT} fontFamily={FONT} textAnchor="middle">
          {numbered && (
            <>
              <circle cx={glassX - 14} cy={nameY - 3.4} r={MARK_R} fill={BG} stroke={ACCENT} strokeWidth={1} />
              <text x={glassX - 14} y={nameY - 0.4} fontSize={8.5} fontWeight={700}>
                {height.n}
              </text>
            </>
          )}
          <text x={numbered ? glassX - 4 : glassX} y={nameY} fontSize={9.5} fontWeight={600} textAnchor={numbered ? 'start' : 'middle'}>
            {name}
          </text>
          <text x={glassX} y={sizeY} fontSize={12} fontWeight={700}>
            {sizeText}
          </text>
        </g>
      )}

      {/* Each wall to its upright laser line, at the floor and at the top. */}
      {wallL && (
        <>
          <DimLine x1={blx} y1={gapB} x2={blx + OFF_WALL} y2={gapB} tone={ACCENT} />
          <Reading n={wallL.bottom.n} value={wallL.bottom.value ?? 0} x={blx - 7} y={gapB} anchor="end" />
          <DimLine x1={tlx} y1={gapT} x2={blx + OFF_WALL} y2={gapT} tone={ACCENT} />
          <Reading n={wallL.top.n} value={wallL.top.value ?? 0} x={Math.min(tlx, blx) - 7} y={gapT} anchor="end" />
        </>
      )}
      {wallR && (
        <>
          <DimLine x1={brx - OFF_WALL} y1={gapB} x2={brx} y2={gapB} tone={ACCENT} />
          <Reading n={wallR.bottom.n} value={wallR.bottom.value ?? 0} x={brx + 7} y={gapB} anchor="start" />
          <DimLine x1={brx - OFF_WALL} y1={gapT} x2={trx} y2={gapT} tone={ACCENT} />
          <Reading n={wallR.top.n} value={wallR.top.value ?? 0} x={Math.max(trx, brx) + 7} y={gapT} anchor="start" />
        </>
      )}

      {/* The width again at the top, wall to wall, where a tape measured it. */}
      {topWidth.value !== null && <AcrossReading n={topWidth.n} value={topWidth.value} outerX={trx} innerX={tlx} y={gapT - 24} labelY={gapT - 30} />}

      {/* How long the run is: in one pull, or the two halves and what they add up to. */}
      {inHalves && splitX !== null ? (
        <>
          <AcrossReading n={halfA.n} value={halfA.value ?? 0} outerX={blx} innerX={splitX} y={rowB} labelY={rowB + 11} />
          <AcrossReading n={halfB.n} value={halfB.value ?? 0} outerX={brx} innerX={splitX} y={rowB} labelY={rowB + 11} />
          <Overall x1={blx} x2={brx} y={wideB} text={`${width}mm along the ${view.surface === 'bath' ? 'bath' : 'floor'}`} below />
        </>
      ) : (
        <AcrossReading n={whole.n} value={width} outerX={view.right === 'wall' && view.left !== 'wall' ? blx : brx} innerX={view.right === 'wall' && view.left !== 'wall' ? brx : blx} y={rowB} labelY={rowB + 11} />
      )}
      {trayX !== null && trayMm !== null && (
        <>
          <DimLine x1={brx} y1={rowB} x2={trayX} y2={rowB} tone={INK} />
          <text x={(brx + trayX) / 2} y={rowB - 5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={INK} fontFamily={FONT}>
            {/* What is left of the tray is the way in. Said in words where there is room. */}
            {trayX - brx >= 74 ? `${trayMm - width} way in` : trayMm - width}
          </text>
          <AcrossReading n={tray.n} value={trayMm} outerX={trayX} innerX={blx} y={wideB} labelY={wideB + 11} />
        </>
      )}

      {/* The floor up to the level line at each end, and floor to ceiling where the glass reaches it. */}
      <UprightReading n={floorS.n} value={fs} x={readL} y1={lineY} y2={floorL} side="left" />
      <UprightReading n={floorE.n} value={fe} x={readR} y1={lineY} y2={floorR} side="right" />
      {toCeiling && (
        <>
          <UprightReading n={ceilS.n} value={cs} x={tallL} y1={floorL} y2={ceilL} side="left" turned />
          <UprightReading n={ceilE.n} value={ce} x={tallR} y1={floorR} y2={ceilR} side="right" turned />
        </>
      )}
    </svg>
  );
}
