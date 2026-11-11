/**
 * One of the eight readings to the laser cross. The tape is hooked on the
 * wall, the floor or the ceiling at the glass line and read where the laser
 * lights its blade; the number appears once it is out. Readings already
 * taken sit on the picture as small circled numbers.
 */

import { CEIL, CX, FLOOR, FloorMark, Frame, GlassLine, LEVEL, LF, LaserLines, PointMark, RF, Room, TapeMeasure, Tripod, WallMark } from './Scene';

interface Geometry {
  body: { x: number; y: number };
  hook: { x: number; y: number };
  lit: { x: number; y: number };
  mark: { x: number; y: number };
  labelSide: 'before' | 'after';
}

/** Where each reading's tape runs, in picture coordinates. */
export function readingGeometry(point: number, glassTop: number, toCeiling: boolean): Geometry {
  const top = toCeiling ? CEIL + 9 : glassTop;
  const bottom = FLOOR - 7;
  const lx = LF + 18;
  const rx = RF - 18;
  switch (point) {
    case 1:
      return { body: { x: CX, y: bottom }, hook: { x: LF, y: bottom }, lit: { x: CX, y: bottom }, mark: { x: (LF + CX) / 2, y: bottom }, labelSide: 'before' };
    case 2:
      return { body: { x: CX, y: top }, hook: { x: LF, y: top }, lit: { x: CX, y: top }, mark: { x: (LF + CX) / 2, y: top }, labelSide: 'after' };
    case 3:
      return { body: { x: CX, y: bottom }, hook: { x: RF, y: bottom }, lit: { x: CX, y: bottom }, mark: { x: (CX + RF) / 2, y: bottom }, labelSide: 'before' };
    case 4:
      return { body: { x: CX, y: top }, hook: { x: RF, y: top }, lit: { x: CX, y: top }, mark: { x: (CX + RF) / 2, y: top }, labelSide: 'after' };
    case 5:
      return { body: { x: lx, y: LEVEL }, hook: { x: lx, y: FLOOR }, lit: { x: lx, y: LEVEL }, mark: { x: lx, y: (LEVEL + FLOOR) / 2 }, labelSide: 'after' };
    case 6:
      return { body: { x: rx, y: LEVEL }, hook: { x: rx, y: FLOOR }, lit: { x: rx, y: LEVEL }, mark: { x: rx, y: (LEVEL + FLOOR) / 2 }, labelSide: 'before' };
    case 7:
      return { body: { x: lx, y: LEVEL }, hook: { x: lx, y: CEIL }, lit: { x: lx, y: LEVEL }, mark: { x: lx, y: (LEVEL + CEIL) / 2 }, labelSide: 'after' };
    default:
      return { body: { x: rx, y: LEVEL }, hook: { x: rx, y: CEIL }, lit: { x: rx, y: LEVEL }, mark: { x: rx, y: (LEVEL + CEIL) / 2 }, labelSide: 'before' };
  }
}

const NAMES: Record<number, string> = {
  1: 'the left wall to the laser, along the floor',
  2: 'the left wall to the laser, at the top',
  3: 'the right wall to the laser, along the floor',
  4: 'the right wall to the laser, at the top',
  5: 'the floor up to the level line, on the left',
  6: 'the floor up to the level line, on the right',
  7: 'the level line up to the ceiling, on the left',
  8: 'the level line up to the ceiling, on the right',
};

export function CrossReadingVisual({ point, glassTop, toCeiling, value, done = [] }: { point: number; glassTop: number; toCeiling: boolean; value: number | null; done?: number[] }) {
  const g = readingGeometry(point, glassTop, toCeiling);
  const vertical = point >= 5;
  const atTop = point === 2 || point === 4;
  return (
    <Frame label={`Measuring from ${NAMES[point]}`}>
      <Room ceiling={toCeiling} />
      <FloorMark side="left" />
      <FloorMark side="right" />
      {!toCeiling && atTop && <WallMark side={point === 2 ? 'left' : 'right'} y={glassTop} />}
      <GlassLine />
      <LaserLines ceiling={toCeiling} vertical={vertical ? 'dim' : 'on'} level={vertical ? 'on' : 'dim'} />
      <Tripod />
      {done
        .filter((n) => n !== point)
        .map((n) => {
          const m = readingGeometry(n, glassTop, toCeiling).mark;
          return <PointMark key={n} x={m.x + (n >= 5 ? (n % 2 === 1 ? -16 : 16) : 0)} y={m.y + (n >= 5 ? 0 : n === 2 || n === 4 ? -16 : 16)} n={n} />;
        })}
      <TapeMeasure x1={g.body.x} y1={g.body.y} x2={g.hook.x} y2={g.hook.y} value={value === null ? '?' : `${value}mm`} lit={g.lit} labelSide={g.labelSide} />
      <g className="mw-appear">
        <PointMark x={g.mark.x + (vertical ? (point % 2 === 1 ? -16 : 16) : 0)} y={g.mark.y + (vertical ? 0 : atTop ? -16 : 16)} n={point} lit />
      </g>
    </Frame>
  );
}
