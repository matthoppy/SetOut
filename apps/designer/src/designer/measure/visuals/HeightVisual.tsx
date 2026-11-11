/**
 * The glass height: a piece of tape on each wall with the top of the glass
 * marked on it, and the tape measure hooked on the floor, read up at the mark.
 */

import { CX, Caption, FLOOR, FloorMark, Frame, GlassLine, LF, Room, TapeMeasure, WallMark } from './Scene';

export function HeightVisual({ glassTop, value }: { glassTop: number; value: number | null }) {
  const x = LF + 18;
  return (
    <Frame label="A marker line on tape stuck to each wall at the height of the glass, and a tape measure hooked on the floor reading up to it">
      <Room ceiling={false} />
      <FloorMark side="left" />
      <FloorMark side="right" />
      <GlassLine />
      <WallMark side="left" y={glassTop} />
      <WallMark side="right" y={glassTop} />
      <line x1={LF + 12} y1={glassTop} x2={CX + 100} y2={glassTop} stroke="hsl(var(--measure-accent))" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
      <TapeMeasure x1={x} y1={glassTop} x2={x} y2={FLOOR} value={value === null ? '?' : `${value}mm`} labelSide="after" />
      <g className="mw-appear">
        <Caption x={CX + 20} y={glassTop - 8} anchor="middle">
          top of the glass
        </Caption>
      </g>
    </Frame>
  );
}
