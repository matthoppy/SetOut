/**
 * Marking the glass line: a short piece of tape on the floor against each
 * wall, and the line drawn across it where the glass will stand.
 */

import { CX, Caption, FLOOR, FloorMark, Frame, GlassLine, Room } from './Scene';

export function MarksVisual() {
  return (
    <Frame label="Two short pieces of masking tape on the floor, one against each wall, each with a marker line where the glass will stand">
      <Room ceiling={false} />
      <FloorMark side="left" animate />
      <FloorMark side="right" animate />
      <g className="mw-appear">
        <GlassLine lit />
        <Caption x={CX} y={FLOOR - 10} anchor="middle">
          the glass line
        </Caption>
      </g>
    </Frame>
  );
}
