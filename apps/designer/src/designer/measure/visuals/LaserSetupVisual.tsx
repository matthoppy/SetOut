/**
 * The laser on its tripod in front of the opening, away from the glass line,
 * its two lines coming on: the level line out to each wall, the up-and-down
 * line to the ceiling and the floor.
 */

import { CEIL, CX, Caption, FloorMark, Frame, GlassLine, LEVEL, LaserLines, RF, Room, Tripod } from './Scene';

export function LaserSetupVisual({ toCeiling }: { toCeiling: boolean }) {
  return (
    <Frame label="A laser on a small tripod standing in front of the opening, with a level line going out to both walls and an up-and-down line through the middle">
      <Room ceiling={toCeiling} />
      <FloorMark side="left" />
      <FloorMark side="right" />
      <GlassLine />
      <LaserLines ceiling={toCeiling} vertical="draw" level="draw" />
      <Tripod />
      <g className="mw-appear">
        <Caption x={CX + 8} y={(toCeiling ? CEIL : 0) + 16}>
          up-and-down line
        </Caption>
        <Caption x={RF - 6} y={LEVEL - 8} anchor="end">
          level line
        </Caption>
      </g>
    </Frame>
  );
}
